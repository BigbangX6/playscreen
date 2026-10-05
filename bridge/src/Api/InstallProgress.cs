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
    /// Steam : appmanifest_&lt;id&gt;.acf (octets téléchargés / à télécharger).
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
            if (Stores.FromPluginId(game.PluginId) != "steam")
            {
                return; // Epic, Battle.net, Xbox : à étudier.
            }
            lock (tracked)
            {
                if (!tracked.Add(game.Id))
                {
                    return;
                }
            }
            Task.Run(() => TrackSteam(game.Id, game.GameId));
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
