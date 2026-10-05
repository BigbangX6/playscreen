using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// État des launchers (fermé, démarre, se met à jour, prêt) pendant une demande : lancement,
    /// installation, désinstallation. Sans lui, l'interface montre une attente sans
    /// explication (F26) et une demande faite pendant que le launcher démarre se perd (F25).
    /// Repères relevés le 5 octobre 2026 en fermant et relançant chaque launcher :
    /// Steam : utilisateur connecté dans le registre (ActiveProcess\ActiveUser), mise à jour dans
    /// logs\bootstrap_log.txt ; Epic et Battle.net : leur journal.
    /// </summary>
    public class LauncherMonitor
    {
        public const string Closed = "closed";
        public const string Starting = "starting";
        public const string Updating = "updating";
        public const string Ready = "ready";

        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);
        private static readonly TimeSpan WatchDuration = TimeSpan.FromMinutes(5);

        private readonly EventHub events;
        private readonly Dictionary<string, Detector> detectors = new Dictionary<string, Detector>
        {
            ["steam"] = new SteamDetector(),
            ["epic"] = new EpicDetector(),
            ["battlenet"] = new BattleNetDetector(),
        };
        /// <summary>Fin de surveillance par store ; une seule boucle par store.</summary>
        private readonly Dictionary<string, DateTime> watchedUntil = new Dictionary<string, DateTime>();
        private readonly Dictionary<string, List<Action>> readyCallbacks = new Dictionary<string, List<Action>>();

        public LauncherMonitor(EventHub events)
        {
            this.events = events;
        }

        /// <summary>État actuel, ou null si le store n'est pas suivi (Xbox).</summary>
        public string Current(string storeId)
        {
            if (!detectors.TryGetValue(storeId, out var detector))
            {
                return null;
            }
            lock (detector)
            {
                return detector.Detect();
            }
        }

        /// <summary>
        /// Publie launcher.state à chaque changement pendant quelques minutes. `onReady` est
        /// appelé une fois si le launcher devient prêt pendant la surveillance (il ne l'était
        /// pas au départ) : c'est là qu'on renvoie une demande perdue (F25).
        /// </summary>
        public void Watch(string storeId, Action onReady = null)
        {
            if (!detectors.ContainsKey(storeId))
            {
                return;
            }
            bool running;
            lock (watchedUntil)
            {
                running = watchedUntil.ContainsKey(storeId);
                watchedUntil[storeId] = DateTime.Now + WatchDuration;
                if (onReady != null)
                {
                    if (!readyCallbacks.TryGetValue(storeId, out var list))
                    {
                        readyCallbacks[storeId] = list = new List<Action>();
                    }
                    list.Add(onReady);
                }
            }
            if (!running)
            {
                Task.Run(() => Loop(storeId));
            }
        }

        private async Task Loop(string storeId)
        {
            string last = null;
            try
            {
                while (true)
                {
                    var state = Current(storeId);
                    List<Action> callbacks = null;
                    lock (watchedUntil)
                    {
                        if (DateTime.Now > watchedUntil[storeId])
                        {
                            watchedUntil.Remove(storeId);
                            readyCallbacks.Remove(storeId);
                            return;
                        }
                        if (state == Ready && readyCallbacks.TryGetValue(storeId, out callbacks))
                        {
                            readyCallbacks.Remove(storeId);
                        }
                    }
                    if (state != last)
                    {
                        logger.Info($"Playscreen: {storeId} launcher {state}");
                        events.Publish("launcher.state", new { storeId, state });
                        last = state;
                    }
                    foreach (var callback in callbacks ?? new List<Action>())
                    {
                        try
                        {
                            callback();
                        }
                        catch (Exception e)
                        {
                            logger.Error(e, $"Playscreen: {storeId} ready callback failed");
                        }
                    }
                    await Task.Delay(PollInterval).ConfigureAwait(false);
                }
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: watching {storeId} launcher failed");
                lock (watchedUntil)
                {
                    watchedUntil.Remove(storeId);
                    readyCallbacks.Remove(storeId);
                }
            }
        }

        private static bool IsRunning(string processName)
        {
            var processes = Process.GetProcessesByName(processName);
            foreach (var process in processes)
            {
                process.Dispose();
            }
            return processes.Length > 0;
        }

        private abstract class Detector
        {
            public abstract string Detect();
        }

        /// <summary>
        /// Steam est prêt quand il inscrit l'utilisateur connecté dans le registre (16 s après
        /// son lancement, connexion automatique comprise). Avant, il démarre, ou se met à jour
        /// si son journal de démarrage l'annonce.
        /// </summary>
        private class SteamDetector : Detector
        {
            private readonly LogFollower log = new LogFollower();
            private bool updating;

            public override string Detect()
            {
                if (!IsRunning("steam"))
                {
                    return Closed;
                }
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam\ActiveProcess"))
                {
                    var user = key?.GetValue("ActiveUser") as int?;
                    var pid = key?.GetValue("pid") as int?;
                    if (user > 0 && pid > 0 && IsSteamProcess(pid.Value))
                    {
                        updating = false;
                        return Ready;
                    }
                }
                var path = SteamLog();
                if (path != null)
                {
                    foreach (var line in log.ReadNew(path, out _))
                    {
                        // Messages en anglais (les autres sont traduits) : une section par démarrage.
                        if (line.Contains("] Startup - ") || line.Contains("] Shutdown") ||
                            line.Contains("Verification complete") || line.Contains("Nothing to do"))
                        {
                            updating = false;
                        }
                        else if (line.Contains("Downloaded new manifest") || line.Contains("Found pending update"))
                        {
                            updating = true;
                        }
                    }
                }
                return updating ? Updating : Starting;
            }

            private static bool IsSteamProcess(int pid)
            {
                try
                {
                    using (var process = Process.GetProcessById(pid))
                    {
                        return process.ProcessName.Equals("steam", StringComparison.OrdinalIgnoreCase);
                    }
                }
                catch (ArgumentException)
                {
                    return false; // Plus de processus avec ce numéro.
                }
            }

            private static string SteamLog()
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
                {
                    var steamPath = key?.GetValue("SteamPath") as string;
                    return string.IsNullOrEmpty(steamPath) ? null : Path.Combine(steamPath, "logs", "bootstrap_log.txt");
                }
            }
        }

        /// <summary>
        /// Epic écrit sa vérification de version dans son journal : « Stage of update started »
        /// (mise à jour téléchargée), puis « Waiting for next version update » (vérification
        /// finie, à jour ou mise à jour prête : il est utilisable). Pour appliquer une mise à
        /// jour, il se ferme et EpicGamesUpdater le relance (il le fait aussi sans mise à jour).
        /// </summary>
        private class EpicDetector : Detector
        {
            private readonly LogFollower log = new LogFollower();
            private string state;

            public override string Detect()
            {
                if (!IsRunning("EpicGamesLauncher"))
                {
                    state = null;
                    // EpicGamesUpdater relance Epic, après une mise à jour mais aussi sans (vu le
                    // 5 octobre 2026 : Epic se relance seul après la fermeture d'un jeu).
                    return IsRunning("EpicGamesUpdater") ? Starting : Closed;
                }
                var path = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"EpicGamesLauncher\Saved\Logs\EpicGamesLauncher.log");
                var lines = log.ReadNew(path, out var restarted);
                if (restarted)
                {
                    state = null;
                }
                foreach (var line in lines)
                {
                    if (line.Contains("LogSelfUpdateService: Stage of update started"))
                    {
                        state = Updating;
                    }
                    else if (line.Contains("LogSelfUpdateService: Waiting for next version update"))
                    {
                        state = Ready;
                    }
                }
                return state ?? Starting;
            }
        }

        /// <summary>
        /// Battle.net : journal de l'instance principale (« mode=server ») ; prêt une fois
        /// connecté (« Logged into Battle.net successfully », au moment où sa fenêtre
        /// s'affiche). Sa mise à jour : « UPDATE operation for "battle.net" » jusqu'à
        /// « Update completed: battle.net », puis il redémarre.
        /// </summary>
        private class BattleNetDetector : Detector
        {
            private readonly LogFollower log = new LogFollower();
            private bool loggedIn;
            private bool updating;

            public override string Detect()
            {
                if (!IsRunning("Battle.net"))
                {
                    return Closed;
                }
                var path = MainLog();
                if (path != null)
                {
                    var lines = log.ReadNew(path, out var restarted);
                    if (restarted)
                    {
                        loggedIn = updating = false;
                    }
                    foreach (var line in lines)
                    {
                        if (line.Contains("Logged into Battle.net successfully"))
                        {
                            loggedIn = true;
                        }
                        else if (line.Contains("UPDATE operation for \"battle.net\""))
                        {
                            updating = true;
                        }
                        else if (line.Contains("Update completed: battle.net"))
                        {
                            updating = false;
                        }
                    }
                }
                return updating ? Updating : loggedIn ? Ready : Starting;
            }

            /// <summary>
            /// Journal le plus récent de l'instance principale : une 2e instance lancée par un
            /// lien (--game=…) écrit un petit journal « mode=client » puis se ferme.
            /// </summary>
            private static string MainLog()
            {
                var folder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Battle.net\Logs");
                if (!Directory.Exists(folder))
                {
                    return null;
                }
                // Les noms contiennent la date : l'ordre alphabétique est l'ordre chronologique.
                foreach (var file in Directory.GetFiles(folder, "battle.net-*.log").OrderByDescending(f => f, StringComparer.Ordinal).Take(5))
                {
                    if (LogFollower.Head(file).Contains("mode=server"))
                    {
                        return file;
                    }
                }
                return null;
            }
        }

        /// <summary>
        /// Lit les lignes ajoutées à un journal depuis la lecture précédente (les journaux
        /// des launchers grossissent toute la journée). Repère un nouveau fichier (nouveau
        /// démarrage du launcher) par son début, qui change.
        /// </summary>
        private class LogFollower
        {
            private const int HeadLength = 256;
            private string path;
            private string head = "";
            private long offset;

            public static string Head(string file)
            {
                try
                {
                    using (var stream = Open(file))
                    {
                        var buffer = new byte[Math.Min(HeadLength * 8, stream.Length)];
                        var read = stream.Read(buffer, 0, buffer.Length);
                        return Encoding.UTF8.GetString(buffer, 0, read);
                    }
                }
                catch (IOException)
                {
                    return "";
                }
            }

            /// <summary>Nouvelles lignes complètes ; `restarted` si c'est un autre fichier qu'avant.</summary>
            public List<string> ReadNew(string file, out bool restarted)
            {
                restarted = false;
                var lines = new List<string>();
                try
                {
                    using (var stream = Open(file))
                    {
                        var start = new byte[Math.Min(HeadLength, stream.Length)];
                        var startRead = stream.Read(start, 0, start.Length);
                        var currentHead = Encoding.UTF8.GetString(start, 0, startRead);
                        // Même fichier : même chemin, pas raccourci, et même début (le début
                        // des journaux d'Epic contient l'heure d'ouverture).
                        var same = file == path && stream.Length >= offset &&
                            (currentHead.StartsWith(head, StringComparison.Ordinal) || head.StartsWith(currentHead, StringComparison.Ordinal));
                        if (!same)
                        {
                            restarted = path != null;
                            path = file;
                            offset = 0;
                        }
                        if (!same || currentHead.Length > head.Length)
                        {
                            head = currentHead;
                        }
                        if (stream.Length == offset)
                        {
                            return lines;
                        }
                        stream.Position = offset;
                        var buffer = new byte[stream.Length - offset];
                        var read = 0;
                        while (read < buffer.Length)
                        {
                            var n = stream.Read(buffer, read, buffer.Length - read);
                            if (n == 0)
                            {
                                break;
                            }
                            read += n;
                        }
                        // Seulement les lignes terminées : la dernière peut être en cours d'écriture.
                        var end = Array.LastIndexOf(buffer, (byte)'\n', read - 1);
                        if (end < 0)
                        {
                            return lines;
                        }
                        offset += end + 1;
                        lines.AddRange(Encoding.UTF8.GetString(buffer, 0, end).Split('\n'));
                    }
                }
                catch (IOException e)
                {
                    logger.Warn($"Playscreen: cannot read {file}: {e.Message}");
                }
                return lines;
            }

            private static FileStream Open(string file) =>
                new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        }
    }
}
