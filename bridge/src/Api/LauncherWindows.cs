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

        public void Watch(string storeId, Guid? gameId)
        {
            if (!Processes.TryGetValue(storeId, out var names))
            {
                return;
            }
            var before = new HashSet<IntPtr>(Find(names).Select(w => w.Handle));
            Task.Run(async () =>
            {
                var started = DateTime.Now;
                var seen = new HashSet<IntPtr>(before);
                try
                {
                    while (DateTime.Now - started < WatchDuration)
                    {
                        foreach (var window in Find(names).Where(w => seen.Add(w.Handle)))
                        {
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
