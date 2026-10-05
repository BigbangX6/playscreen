using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Win32;
using Playnite.SDK;
using Playnite.SDK.Models;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Progression des installations : Playnite n'en donne aucune (il vérifie seulement
    /// toutes les 10 s si le jeu est installé). On lit donc ce que les launchers écrivent.
    /// Steam : appmanifest_&lt;id&gt;.acf ; Epic : Manifests\Pending\*.item. Dans les deux cas,
    /// le direct vient des octets écrits par le launcher (ProcessWrites).
    /// </summary>
    public class InstallProgress
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);
        // Sans manifeste après ce délai, le joueur a sans doute annulé la confirmation Steam.
        private static readonly TimeSpan NoManifestTimeout = TimeSpan.FromMinutes(30);
        private static readonly TimeSpan MaxDuration = TimeSpan.FromHours(24);
        private static readonly Regex VdfPair = new Regex("^\\s*\"([^\"]+)\"\\s+\"([^\"]*)\"", RegexOptions.Compiled);
        private const int StateFullyInstalled = 4;

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        private readonly HashSet<Guid> tracked = new HashSet<Guid>();

        public InstallProgress(IPlayniteAPI api, EventHub events)
        {
            this.api = api;
            this.events = events;
        }

        /// <summary>Suit l'installation en arrière-plan, si le store le permet.</summary>
        public void Track(Game game)
        {
            var store = Stores.FromPluginId(game.PluginId);
            if (store != "steam" && store != "epic")
            {
                return; // Battle.net, Xbox : à étudier.
            }
            lock (tracked)
            {
                if (!tracked.Add(game.Id))
                {
                    return;
                }
            }
            if (store == "steam")
            {
                Task.Run(() => TrackSteam(game.Id, game.GameId));
            }
            else
            {
                Task.Run(() => TrackEpic(game.Id, game.GameId));
            }
        }

        /// <summary>
        /// Epic garde le fichier du jeu dans Manifests\Pending pendant l'installation (avec
        /// sa taille installée, à confirmer) puis le déplace dans Manifests à la fin. En
        /// direct : octets écrits par le launcher (≈ taille installée, mesuré le 5 octobre
        /// 2026 : 7,3 Go écrits pour Fall Guys, 7,39 Go ; 972 Mo pour Unrailed, 0,95 Go).
        /// </summary>
        private async Task TrackEpic(Guid gameId, string appName)
        {
            var manifests = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Epic", "EpicGamesLauncher", "Data", "Manifests");
            var started = DateTime.Now;
            var writes = new ProcessWrites("EpicGamesLauncher");
            var seenPending = false;
            long total = 0;
            long lastDone = -1;
            try
            {
                while (DateTime.Now - started < MaxDuration)
                {
                    var pending = FindEpicItem(Path.Combine(manifests, "Pending"), appName);
                    if (pending != null)
                    {
                        seenPending = true;
                        total = Math.Max(total, pending.Value);
                        if (total > 0)
                        {
                            var done = (long)(total * Math.Min(0.99, (double)writes.Since() / total));
                            if (done != lastDone)
                            {
                                lastDone = done;
                                events.Publish("install.progress", new { gameId, bytesDone = done, bytesTotal = total });
                            }
                        }
                    }
                    else
                    {
                        var installed = FindEpicItem(manifests, appName);
                        if (installed != null && (seenPending || DateTime.Now - started > TimeSpan.FromSeconds(5)))
                        {
                            total = installed.Value > 0 ? installed.Value : total;
                            if (total > 0)
                            {
                                events.Publish("install.progress", new { gameId, bytesDone = total, bytesTotal = total });
                            }
                            return; // game.installed arrivera par Playnite.
                        }
                        if (!seenPending && DateTime.Now - started > NoManifestTimeout)
                        {
                            logger.Info($"Playscreen: no Epic install started for {appName}, giving up");
                            return;
                        }
                    }

                    if (api.Database.Games.Get(gameId)?.IsInstalled == true)
                    {
                        return;
                    }
                    await Task.Delay(PollInterval).ConfigureAwait(false);
                }
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: Epic progress for {appName} failed");
            }
            finally
            {
                lock (tracked)
                {
                    tracked.Remove(gameId);
                }
            }
        }

        /// <summary>Taille installée du jeu dans un dossier de fichiers .item d'Epic (0 si absente), ou null.</summary>
        private static long? FindEpicItem(string folder, string appName)
        {
            if (!Directory.Exists(folder))
            {
                return null;
            }
            foreach (var file in Directory.GetFiles(folder, "*.item"))
            {
                try
                {
                    string text;
                    using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var reader = new StreamReader(stream))
                    {
                        text = reader.ReadToEnd();
                    }
                    var item = Playnite.SDK.Data.Serialization.FromJson<EpicItem>(text);
                    if (item != null && item.AppName == appName)
                    {
                        return item.InstallSize;
                    }
                }
                catch (Exception)
                {
                    // Fichier déplacé, en cours d'écriture ou vide (Epic l'écrit parfois
                    // vide) : on réessaiera au prochain passage.
                }
            }
            return null;
        }

        private class EpicItem
        {
            public string AppName { get; set; }
            public long InstallSize { get; set; }
        }

        private async Task TrackSteam(Guid gameId, string appId)
        {
            var started = DateTime.Now;
            long lastDone = -1;
            var steamWrites = new ProcessWrites("steam");
            try
            {
                while (DateTime.Now - started < MaxDuration)
                {
                    var manifest = FindSteamManifest(appId);
                    if (manifest == null)
                    {
                        if (DateTime.Now - started > NoManifestTimeout)
                        {
                            logger.Info($"Playscreen: no Steam manifest for {appId}, giving up");
                            return;
                        }
                    }
                    else
                    {
                        var values = ReadVdf(manifest);
                        var toDownload = Long(values, "BytesToDownload");
                        var toStage = Long(values, "BytesToStage");
                        // On affiche la taille installée (l'espace occupé sur le disque).
                        var total = toStage > 0 ? toStage : toDownload;
                        long done;
                        var fullyInstalled = (Long(values, "StateFlags") & StateFullyInstalled) != 0;
                        if (fullyInstalled)
                        {
                            done = total;
                        }
                        else
                        {
                            // Steam n'écrit le manifeste qu'au début et à la fin, et réserve
                            // d'emblée la place des fichiers (la taille du dossier ne dit rien).
                            // En direct : les octets réellement écrits par Steam depuis le début,
                            // qui suivent la taille installée. Comparé à la barre « Installation
                            // des fichiers » de Steam le 5 octobre 2026 (MOTiON, 2,2 Go) :
                            // 46 % contre 43 %, puis 99 % contre 98 %.
                            var written = (double)steamWrites.Since() / Math.Max(1, total);
                            // Plafonné à 99 % tant que Steam n'a pas fini.
                            done = (long)(total * Math.Min(0.99, written));
                        }
                        if (total > 0 && done != lastDone)
                        {
                            lastDone = done;
                            events.Publish("install.progress", new { gameId, bytesDone = done, bytesTotal = total });
                        }
                        if (fullyInstalled)
                        {
                            // game.installed arrivera par Playnite (vérification toutes les 10 s).
                            return;
                        }
                    }

                    if (api.Database.Games.Get(gameId)?.IsInstalled == true)
                    {
                        return;
                    }
                    await Task.Delay(PollInterval).ConfigureAwait(false);
                }
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: Steam progress for {appId} failed");
            }
            finally
            {
                lock (tracked)
                {
                    tracked.Remove(gameId);
                }
            }
        }

        private static string FindSteamManifest(string appId)
        {
            return SteamLibraryFolders()
                .Select(folder => Path.Combine(folder, "steamapps", $"appmanifest_{appId}.acf"))
                .FirstOrDefault(File.Exists);
        }

        /// <summary>Dossier de Steam + bibliothèques déclarées dans libraryfolders.vdf.</summary>
        private static List<string> SteamLibraryFolders()
        {
            var folders = new List<string>();
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
            {
                var steamPath = key?.GetValue("SteamPath") as string;
                if (string.IsNullOrEmpty(steamPath))
                {
                    return folders;
                }
                folders.Add(steamPath.Replace('/', '\\'));
                var config = Path.Combine(steamPath, "steamapps", "libraryfolders.vdf");
                if (File.Exists(config))
                {
                    folders.AddRange(File.ReadAllLines(config)
                        .Select(line => VdfPair.Match(line))
                        .Where(m => m.Success && m.Groups[1].Value == "path")
                        .Select(m => m.Groups[2].Value.Replace(@"\\", @"\")));
                }
            }
            return folders.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        /// <summary>Clés simples d'un fichier VDF (le premier niveau suffit ici).</summary>
        private static Dictionary<string, string> ReadVdf(string path)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            // Steam réécrit le fichier pendant le téléchargement : on le lit sans le bloquer.
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    var match = VdfPair.Match(line);
                    if (match.Success && !values.ContainsKey(match.Groups[1].Value))
                    {
                        values[match.Groups[1].Value] = match.Groups[2].Value;
                    }
                }
            }
            return values;
        }

        private static long Long(Dictionary<string, string> values, string key) =>
            values.TryGetValue(key, out var text) && long.TryParse(text, out var value) ? value : 0;
    }
}
