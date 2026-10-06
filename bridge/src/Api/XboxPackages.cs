using System;
using System.Linq;
using System.Threading.Tasks;
using Playnite.SDK;
using Windows.Management.Deployment;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Jeux Xbox / Microsoft Store : paquets Windows de l'utilisateur. L'extension Xbox de
    /// Playnite ouvre seulement la page « Applications installées » pour désinstaller (il
    /// faudrait y chercher le jeu à la souris) ; on retire directement le paquet, sans fenêtre
    /// ni droits admin (paquet installé pour l'utilisateur).
    /// </summary>
    internal static class XboxPackages
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        /// <summary>
        /// Retire le paquet (nom de famille = storeGameId). Vrai aussi s'il est déjà absent
        /// (désinstallé ailleurs) ; faux en cas d'échec.
        /// </summary>
        public static async Task<bool> Uninstall(string familyName)
        {
            var manager = new PackageManager();
            var package = manager.FindPackagesForUser("", familyName).FirstOrDefault();
            if (package == null)
            {
                logger.Info($"Playscreen: Xbox package {familyName} already absent");
                return true;
            }
            var result = await manager.RemovePackageAsync(package.Id.FullName).AsTask().ConfigureAwait(false);
            if (result.ExtendedErrorCode != null)
            {
                logger.Error($"Playscreen: removing {familyName} failed: {result.ErrorText}");
                return false;
            }
            logger.Info($"Playscreen: Xbox package {familyName} removed");
            return true;
        }
    }
}
