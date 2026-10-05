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

        public static List<Process> Find(Game game)
        {
            var result = new List<Process>();
            if (string.IsNullOrEmpty(game.InstallDirectory))
            {
                return result;
            }
            var directory = Path.GetFullPath(game.InstallDirectory).TrimEnd('\\') + "\\";
            foreach (var process in Process.GetProcesses())
            {
                var path = ExecutablePath(process.Id);
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
                    }
                    catch (Exception e) when (e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
                    {
                        // Processus déjà terminé ou protégé (anti-triche) : on passe au suivant.
                    }
                }
            }
            return count;
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
