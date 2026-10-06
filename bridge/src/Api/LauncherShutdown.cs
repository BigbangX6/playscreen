using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Win32;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Au lancement d'un jeu : les autres launchers (Steam, Epic, Battle.net, Xbox) sont
    /// vraiment fermés, pas seulement réduits, pour laisser la mémoire au jeu. On garde celui
    /// du jeu, et ceux qui installent un jeu (téléchargement en cours). Les launchers hors
    /// bibliothèque (EA app, Ubisoft Connect…) ne sont pas touchés : certains jeux Steam ou
    /// Epic en ont besoin pour démarrer.
    /// </summary>
    internal static class LauncherShutdown
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        public static void CloseOthers(IPlayniteAPI api, string gameStore)
        {
            // Les jeux en cours d'installation, par store (lu tout de suite, sur le fil de Playnite).
            var installing = api.Database.Games.Where(g => g.IsInstalling).Select(g => Stores.FromPluginId(g.PluginId)).ToList();
            Task.Run(() =>
            {
                foreach (var store in new[] { "steam", "epic", "battlenet", "xbox" })
                {
                    if (store == gameStore || installing.Contains(store))
                    {
                        continue;
                    }
                    try
                    {
                        Close(store);
                    }
                    catch (Exception e)
                    {
                        logger.Error(e, $"Playscreen: cannot close {store}");
                    }
                }
            });
        }

        private static void Close(string store)
        {
            switch (store)
            {
                case "steam":
                    if (Running("steam"))
                    {
                        // Fermeture propre, comme « Steam › Quitter ».
                        using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
                        {
                            var exe = key?.GetValue("SteamExe") as string;
                            if (exe != null && File.Exists(exe))
                            {
                                logger.Info("Playscreen: closing Steam (game of another store)");
                                Process.Start(exe, "-shutdown");
                            }
                        }
                    }
                    break;
                case "epic":
                    // Pas de commande pour quitter : la croix le range seulement dans la zone de
                    // notification. Ses téléchargements sont exclus plus haut.
                    Kill("EpicGamesLauncher", "EpicWebHelper");
                    break;
                case "battlenet":
                    // L'agent (Agent.exe), qui télécharge, reste en route.
                    Kill("Battle.net");
                    break;
                case "xbox":
                    // Les services de jeux (téléchargements) restent en route.
                    Kill("XboxPcApp");
                    break;
            }
        }

        private static bool Running(string name)
        {
            var processes = Process.GetProcessesByName(name);
            foreach (var process in processes)
            {
                process.Dispose();
            }
            return processes.Length > 0;
        }

        private static void Kill(params string[] names)
        {
            foreach (var name in names)
            {
                foreach (var process in Process.GetProcessesByName(name))
                {
                    using (process)
                    {
                        try
                        {
                            process.Kill();
                            logger.Info($"Playscreen: {name} closed (game of another store)");
                        }
                        catch (Exception e) when (e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
                        {
                            // Déjà fermé ou protégé.
                        }
                    }
                }
            }
        }
    }
}
