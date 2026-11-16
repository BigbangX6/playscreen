using System;
using System.IO;
using System.Linq;
using System.Text;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Catalogue local du lanceur Epic (C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog\
    /// catcache.bin : JSON en base64). Donne, pour le nom d'un jeu (« Sugar » pour Rocket
    /// League), son espace et son identifiant de catalogue, que les liens d'Epic demandent.
    /// </summary>
    internal static class EpicCatalog
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        private class Release
        {
            public string appId { get; set; }
        }

        private class Item
        {
            public string id { get; set; }
            public string @namespace { get; set; }
            public Release[] releaseInfo { get; set; }
        }

        /// <summary>« espace:identifiant:nom », ou null si le jeu n'est pas dans le catalogue.</summary>
        public static string FullId(string appName)
        {
            try
            {
                var file = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    @"Epic\EpicGamesLauncher\Data\Catalog\catcache.bin");
                if (string.IsNullOrEmpty(appName) || !File.Exists(file))
                {
                    return null;
                }
                var json = Encoding.UTF8.GetString(Convert.FromBase64String(File.ReadAllText(file).Trim()));
                var items = Serialization.FromJson<Item[]>(json) ?? new Item[0];
                var item = items.FirstOrDefault(i => i.releaseInfo?.Any(r => string.Equals(r.appId, appName, StringComparison.OrdinalIgnoreCase)) == true);
                return item == null || string.IsNullOrEmpty(item.@namespace) || string.IsNullOrEmpty(item.id)
                    ? null
                    : $"{item.@namespace}:{item.id}:{appName}";
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: Epic catalog not readable: {e.GetType().Name}");
                return null;
            }
        }
    }
}
