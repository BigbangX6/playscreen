using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Playnite.SDK.Models;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Processus d'un jeu : ceux dont l'exécutable est dans son dossier d'installation (la
    /// même règle que la surveillance des jeux par Playnite). Sert à quitter un jeu.
    /// </summary>
    internal static class GameProcesses
    {
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref int size);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);

        /// <summary>
        /// Programmes essentiels de Windows : jamais fermés, quel que soit leur dossier. Les fermer
        /// fait tomber la session ou Windows entier (vu le 15 novembre 2026 dans Windows Sandbox :
        /// une application ajoutée depuis C:\Windows\System32 a fait fermer tout System32).
        /// </summary>
        private static readonly HashSet<string> Protected = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "csrss", "winlogon", "wininit", "lsass", "services", "smss", "svchost", "dwm", "explorer",
            "sihost", "fontdrvhost", "ctfmon", "taskhostw", "RuntimeBroker", "StartMenuExperienceHost",
            "ShellExperienceHost", "SearchHost", "TextInputHost", "conhost", "dllhost", "audiodg",
            "spoolsv", "lsaiso", "Registry", "System", "Idle", "MsMpEng", "SecurityHealthService",
            "playscreen-sentinel", "Playscreen", "Playnite.DesktopApp", "Playnite.BrowserProcess",
            "msedgewebview2",
        };

        /// <summary>
        /// Processus du jeu : exécutable dans son dossier d'installation, dans la session de la
        /// personne. Rien si ce dossier est partagé par d'autres programmes (Windows, Program Files,
        /// dossier personnel, Bureau…) : on ne peut pas savoir lesquels sont au jeu ; l'appelant
        /// vise alors seulement le processus suivi (sa fenêtre).
        /// </summary>
        public static List<Process> Find(Game game)
        {
            var result = new List<Process>();
            if (string.IsNullOrEmpty(game.InstallDirectory))
            {
                return result;
            }
            var directory = Path.GetFullPath(game.InstallDirectory).TrimEnd(Path.DirectorySeparatorChar) + "\\";
            if (IsSharedDirectory(directory))
            {
                return result;
            }
            var session = Process.GetCurrentProcess().SessionId;
            foreach (var process in Process.GetProcesses())
            {
                var path = process.SessionId == session && !Protected.Contains(process.ProcessName) ? ExecutablePath(process.Id) : null;
                if (path != null && path.StartsWith(directory, StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(process);
                }
                else
                {
                    process.Dispose();
                }
            }
            return result;
        }

        /// <summary>Vrai pour un programme essentiel de Windows ou de Playscreen (à ne jamais fermer).</summary>
        public static bool IsProtected(Process process)
        {
            return Protected.Contains(process.ProcessName) || process.SessionId != Process.GetCurrentProcess().SessionId;
        }

        /// <summary>
        /// Dossier partagé par d'autres programmes que le jeu : Windows et ses sous-dossiers, racine
        /// d'un disque, Program Files, dossiers de la personne (Bureau, Documents, Téléchargements,
        /// AppData…) et leurs racines connues.
        /// </summary>
        internal static bool IsSharedDirectory(string directory)
        {
            directory = directory.TrimEnd(Path.DirectorySeparatorChar) + "\\";
            var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd(Path.DirectorySeparatorChar) + "\\";
            if (directory.StartsWith(windows, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (Path.GetPathRoot(directory).Equals(directory, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var shared = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                local,
                Path.Combine(local, "Programs"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
                Path.GetDirectoryName(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)),
            };
            foreach (var folder in shared)
            {
                if (!string.IsNullOrEmpty(folder) && (folder.TrimEnd(Path.DirectorySeparatorChar) + "\\").Equals(directory, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Demande la fermeture (comme la croix de la fenêtre), ou ferme de force. Renvoie le
        /// nombre de processus visés.
        /// </summary>
        public static int Stop(Game game, bool force)
        {
            var processes = Find(game);
            var count = 0;
            foreach (var process in processes)
            {
                using (process)
                {
                    try
                    {
                        if (force)
                        {
                            process.Kill();
                            count++;
                        }
                        else if (process.MainWindowHandle != IntPtr.Zero && process.CloseMainWindow())
                        {
                            count++;
                        }
                        else if (CloseStoreAppFrame(process.Id))
                        {
                            // Jeu du Microsoft Store (Xbox) : sa fenêtre appartient à
                            // ApplicationFrameHost, le processus du jeu n'en a pas à lui
                            // (Solitaire, 16/11/2026).
                            count++;
                        }
                    }
                    catch (Exception e) when (e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
                    {
                        // Processus déjà terminé ou protégé (anti-triche) : on passe au suivant.
                    }
                }
            }
            return count;
        }

        private delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

        private const uint WM_CLOSE = 0x0010;

        /// <summary>
        /// Fenêtre d'ApplicationFrameHost qui contient l'appli du Store (processus processId) :
        /// fermée comme avec la croix. Faux si aucune.
        /// </summary>
        private static bool CloseStoreAppFrame(int processId)
        {
            var frames = new List<IntPtr>();
            foreach (var host in Process.GetProcessesByName("ApplicationFrameHost"))
            {
                var hostId = (uint)host.Id;
                host.Dispose();
                EnumWindows((hwnd, _) =>
                {
                    GetWindowThreadProcessId(hwnd, out var owner);
                    if (owner == hostId && IsWindowVisible(hwnd))
                    {
                        var hostsGame = false;
                        EnumChildWindows(hwnd, (child, __) =>
                        {
                            GetWindowThreadProcessId(child, out var childOwner);
                            hostsGame |= childOwner == (uint)processId;
                            return !hostsGame;
                        }, IntPtr.Zero);
                        if (hostsGame)
                        {
                            frames.Add(hwnd);
                        }
                    }
                    return true;
                }, IntPtr.Zero);
            }
            foreach (var frame in frames)
            {
                PostMessage(frame, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            }
            return frames.Count > 0;
        }

        /// <summary>Chemin de l'exécutable, y compris pour un processus 64 bits ; null si inaccessible.</summary>
        private static string ExecutablePath(int processId)
        {
            var handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
            if (handle == IntPtr.Zero)
            {
                return null;
            }
            try
            {
                var buffer = new StringBuilder(1024);
                var size = buffer.Capacity;
                return QueryFullProcessImageName(handle, 0, buffer, ref size) ? buffer.ToString(0, size) : null;
            }
            finally
            {
                CloseHandle(handle);
            }
        }
    }
}
