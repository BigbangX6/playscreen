using System;
using System.IO;
using Microsoft.Win32;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Launchers installés mais jamais lancés : leur programme est là, mais les extensions de
    /// Playnite ne le voient pas encore (elles lisent ce que le launcher écrit à son premier
    /// lancement). On regarde les emplacements d'installation habituels.
    /// </summary>
    internal static class LauncherFiles
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        private static string ProgramFilesX86 =>
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        public static bool IsInstalled(string storeId)
        {
            switch (storeId)
            {
                case "steam":
                    return SteamExecutable() != null;
                case "epic":
                    return File.Exists(Path.Combine(ProgramFilesX86, @"Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe"))
                        || File.Exists(Path.Combine(ProgramFilesX86, @"Epic Games\Launcher\Portal\Binaries\Win32\EpicGamesLauncher.exe"));
                case "battlenet":
                    return File.Exists(Path.Combine(ProgramFilesX86, @"Battle.net\Battle.net.exe"))
                        || File.Exists(Path.Combine(ProgramFilesX86, @"Battle.net\Battle.net Launcher.exe"));
                default:
                    return false;
            }
        }

        /// <summary>steam.exe d'après son installateur (registre de la machine) ou l'emplacement par défaut.</summary>
        private static string SteamExecutable()
        {
            var folder = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath", null) as string
                ?? Path.Combine(ProgramFilesX86, "Steam");
            var exe = Path.Combine(folder, "steam.exe");
            return File.Exists(exe) ? exe : null;
        }

        /// <summary>
        /// Écrit ce que Steam écrit lui-même à son premier lancement (HKCU\Software\Valve\Steam :
        /// SteamPath, SteamExe), pour que l'extension Steam de Playnite le trouve (installation de
        /// jeux, lancement). Seulement si ces valeurs manquent.
        /// </summary>
        public static void RegisterSteam()
        {
            try
            {
                var exe = SteamExecutable();
                if (exe == null)
                {
                    return;
                }
                using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Valve\Steam"))
                {
                    if (key == null || !string.IsNullOrEmpty(key.GetValue("SteamPath") as string))
                    {
                        return;
                    }
                    // Même forme que Steam : minuscules et barres obliques.
                    key.SetValue("SteamPath", Path.GetDirectoryName(exe).Replace('\\', '/').ToLowerInvariant());
                    key.SetValue("SteamExe", exe.Replace('\\', '/').ToLowerInvariant());
                    logger.Info("Playscreen: Steam registered for the current user (installed, never started)");
                }
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: Steam registration failed: {e.GetType().Name}");
            }
        }
    }
}
