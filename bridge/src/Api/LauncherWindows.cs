using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Après une demande d'installation ou de désinstallation, guette les nouvelles fenêtres
    /// du launcher (confirmation Steam, désinstallation Battle.net…). Elles s'ouvrent souvent
    /// derrière Playscreen (F27) : on prévient l'interface (launcher.prompt), qui est au
    /// premier plan et peut donc les y mettre.
    /// </summary>
    internal class LauncherWindows
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan WatchDuration = TimeSpan.FromSeconds(90);
        private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(500);

        /// <summary>Processus des fenêtres de chaque launcher (Steam : son interface est dans steamwebhelper).</summary>
        private static readonly Dictionary<string, string[]> Processes = new Dictionary<string, string[]>
        {
            ["steam"] = new[] { "steam", "steamwebhelper" },
            ["epic"] = new[] { "EpicGamesLauncher" },
            ["battlenet"] = new[] { "Battle.net", "Blizzard Uninstaller" },
        };

        private readonly EventHub events;

        public LauncherWindows(EventHub events)
        {
            this.events = events;
        }

        /// <summary>Titres des fenêtres principales des launchers (elles ne se ferment pas).</summary>
        private static readonly HashSet<string> MainTitles = new HashSet<string>
        {
            "Steam", "Lanceur Epic Games", "Epic Games Launcher", "Battle.net",
        };

        /// <summary>Après la fermeture de la fenêtre, délai laissé au téléchargement pour commencer.</summary>
        private static readonly TimeSpan CancelGrace = TimeSpan.FromSeconds(15);

        /// <summary>
        /// `cancelled` (installation Steam seulement, F30) : appelé si les fenêtres signalées se
        /// ferment et que `started` reste faux pendant CancelGrace (« Annuler » dans Steam).
        /// </summary>
        /// <summary>
        /// Fenêtres déjà ouvertes, à prendre **avant** la demande : la confirmation de Steam
        /// s'ouvre parfois avant que la surveillance commence.
        /// </summary>
        public HashSet<IntPtr> Snapshot(string storeId) =>
            Processes.TryGetValue(storeId, out var names)
                ? new HashSet<IntPtr>(Find(names).Select(w => w.Handle))
                : new HashSet<IntPtr>();

        public void Watch(string storeId, Guid? gameId, Func<bool> started = null, Action cancelled = null, HashSet<IntPtr> before = null, Func<bool> launcherReady = null)
        {
            if (!Processes.TryGetValue(storeId, out var names))
            {
                return;
            }
            before = before ?? Snapshot(storeId);
            Task.Run(async () =>
            {
                logger.Info($"Playscreen: watching {storeId} windows ({before.Count} already open)");
                var watchStart = DateTime.Now;
                var seen = new HashSet<IntPtr>(before);
                var prompts = new HashSet<IntPtr>();
                DateTime? closedAt = null;
                try
                {
                    while (DateTime.Now - watchStart < WatchDuration)
                    {
                        var current = Find(names);
                        if (cancelled != null && prompts.Count > 0)
                        {
                            var open = current.Any(w => prompts.Contains(w.Handle));
                            if (open || started()) closedAt = null;
                            else if (closedAt == null) closedAt = DateTime.Now;
                            else if (DateTime.Now - closedAt > CancelGrace)
                            {
                                cancelled();
                                return;
                            }
                            if (started()) return;
                        }
                        foreach (var window in current.Where(w => seen.Add(w.Handle)))
                        {
                            // La fenêtre principale du launcher reste ouverte : seule une vraie
                            // fenêtre de confirmation compte pour savoir si on a annulé.
                            // Fenêtres du démarrage du launcher (« Se connecter à Steam »…) : pas
                            // une confirmation, on attend qu'il soit prêt.
                            if (!MainTitles.Contains(window.Title) && (launcherReady == null || launcherReady()))
                            {
                                prompts.Add(window.Handle);
                            }
                            logger.Info($"Playscreen: {storeId} window \"{window.Title}\"");
                            events.Publish("launcher.prompt", new
                            {
                                gameId,
                                storeId,
                                title = window.Title,
                                handle = window.Handle.ToInt64(),
                            });
                        }
                        await Task.Delay(PollInterval).ConfigureAwait(false);
                    }
                }
                catch (Exception e)
                {
                    logger.Error(e, $"Playscreen: watching {storeId} windows failed");
                }
            });
        }

        /// <summary>
        /// Après une partie, le launcher revient souvent au premier plan (Battle.net, Steam…) :
        /// ses fenêtres sont réduites, pour que Playscreen reste devant. Rien n'est fermé.
        /// </summary>
        public static void MinimizeAfterGame(string storeId)
        {
            if (!Processes.TryGetValue(storeId, out var names))
            {
                return;
            }
            Task.Run(async () =>
            {
                // Le launcher réapparaît une à quelques secondes après la fin du jeu.
                for (var i = 0; i < 4; i++)
                {
                    await Task.Delay(1500).ConfigureAwait(false);
                    foreach (var window in Find(names))
                    {
                        ShowWindow(window.Handle, SwMinimize);
                    }
                }
                logger.Info($"Playscreen: {storeId} windows minimized after the game");
            });
        }

        private const int SwMinimize = 6;

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int command);

        private class Window
        {
            public IntPtr Handle;
            public string Title;
        }

        /// <summary>Fenêtres principales visibles (avec titre, sans propriétaire) des processus donnés.</summary>
        private static List<Window> Find(string[] processNames)
        {
            var ids = new HashSet<uint>();
            foreach (var name in processNames)
            {
                foreach (var process in Process.GetProcessesByName(name))
                {
                    ids.Add((uint)process.Id);
                    process.Dispose();
                }
            }
            var result = new List<Window>();
            if (ids.Count == 0)
            {
                return result;
            }
            EnumWindows((hwnd, _) =>
            {
                GetWindowThreadProcessId(hwnd, out var processId);
                if (ids.Contains(processId) && IsWindowVisible(hwnd) && GetWindow(hwnd, GW_OWNER) == IntPtr.Zero)
                {
                    var length = GetWindowTextLength(hwnd);
                    if (length > 0)
                    {
                        var title = new StringBuilder(length + 1);
                        GetWindowText(hwnd, title, title.Capacity);
                        result.Add(new Window { Handle = hwnd, Title = title.ToString() });
                    }
                }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        private const uint GW_OWNER = 4;

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hWnd, uint command);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    }
}
