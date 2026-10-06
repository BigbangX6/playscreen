using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Applications hors launcher (jeux « other » : un .exe ajouté à la main, un émulateur…).
    /// Lancées par Playnite, en arrière-plan : leur fenêtre s'ouvre derrière Playscreen, et
    /// leur processus n'est pas toujours dans le dossier d'installation (Bloc-notes de Windows 11
    /// : notepad.exe relance l'application du Store puis s'arrête). On repère donc la première
    /// nouvelle fenêtre apparue après le lancement : son identifiant (handle) est donné à
    /// l'interface (game.window, session.windowHandle) qui la met au premier plan, et
    /// « Quitter » ferme cette fenêtre.
    /// </summary>
    internal static class GameWindows
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan WatchDuration = TimeSpan.FromSeconds(60);
        private const long WS_CAPTION = 0x00C00000;
        private const uint WM_CLOSE = 0x0010;

        /// <summary>Fenêtres à ne jamais prendre pour celle du jeu.</summary>
        private static readonly HashSet<string> IgnoredProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Playnite.DesktopApp", "Playnite.FullscreenApp", "playscreen-ui", "Playscreen", "playscreen-sentinel",
            "msedgewebview2", "explorer", "ShellExperienceHost", "SearchHost", "StartMenuExperienceHost",
            "TextInputHost", "ApplicationFrameHost", "SystemSettings", "LockApp",
            // Launchers (fenêtre « Steam se ferme… » quand LauncherShutdown les ferme, etc.).
            "steam", "steamwebhelper", "EpicGamesLauncher", "EpicWebHelper", "Battle.net", "XboxPcApp",
        };

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hWnd, uint command);
        [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
        [DllImport("user32.dll", EntryPoint = "GetWindowLong")] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

        // Playnite est un programme 32 bits : GetWindowLongPtr n'y existe pas.
        private static long Style(IntPtr hWnd) => (IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, -16) : GetWindowLong32(hWnd, -16)).ToInt64();
        [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
        [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

        /// <summary>Fenêtres principales visibles (titre, cadre, pas masquées), avec leur processus.</summary>
        private static Dictionary<IntPtr, uint> TopWindows()
        {
            var result = new Dictionary<IntPtr, uint>();
            EnumWindows((hWnd, _) =>
            {
                // GW_OWNER = 4 ; DWMWA_CLOAKED = 14 (fenêtres d'applications du Store cachées).
                if (IsWindowVisible(hWnd) && GetWindow(hWnd, 4) == IntPtr.Zero && GetWindowTextLength(hWnd) > 0
                    && (Style(hWnd) & WS_CAPTION) == WS_CAPTION
                    && !(DwmGetWindowAttribute(hWnd, 14, out var cloaked, 4) == 0 && cloaked != 0))
                {
                    GetWindowThreadProcessId(hWnd, out var processId);
                    result[hWnd] = processId;
                }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        private static string ProcessName(uint processId)
        {
            try
            {
                using (var process = Process.GetProcessById((int)processId))
                {
                    return process.ProcessName;
                }
            }
            catch (ArgumentException)
            {
                return null;
            }
        }

        /// <summary>
        /// Avant le lancement : note les fenêtres déjà là, puis guette la première nouvelle
        /// fenêtre (60 s) et la passe à `found` (handle, processus).
        /// </summary>
        public static void Watch(Guid gameId, Func<bool> stillStarting, Action<IntPtr, uint> found)
        {
            var before = new HashSet<IntPtr>(TopWindows().Keys);
            Task.Run(async () =>
            {
                var start = DateTime.Now;
                try
                {
                    while (DateTime.Now - start < WatchDuration && stillStarting())
                    {
                        await Task.Delay(500).ConfigureAwait(false);
                        foreach (var window in TopWindows().Where(w => !before.Contains(w.Key)))
                        {
                            var name = ProcessName(window.Value);
                            if (name == null || IgnoredProcesses.Contains(name))
                            {
                                before.Add(window.Key);
                                continue;
                            }
                            logger.Info($"Playscreen: window of {gameId} found ({name}, {window.Key})");
                            found(window.Key, window.Value);
                            return;
                        }
                    }
                }
                catch (Exception e)
                {
                    logger.Error(e, $"Playscreen: watching windows of {gameId} failed");
                }
            });
        }

        /// <summary>Ferme la fenêtre (comme la croix) ou son processus de force. Faux si elle n'existe plus.</summary>
        public static bool Close(IntPtr handle, uint processId, bool force)
        {
            if (force)
            {
                try
                {
                    using (var process = Process.GetProcessById((int)processId))
                    {
                        process.Kill();
                        return true;
                    }
                }
                catch (Exception e) when (e is ArgumentException || e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
                {
                    return false;
                }
            }
            return IsWindow(handle) && PostMessage(handle, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        }
    }
}
