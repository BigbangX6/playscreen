using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Playnite.SDK;
using Playnite.SDK.Models;
using Playnite.SDK.Plugins;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Fonctions de Playnite absentes du SDK, appelées par réflexion sur son modèle de vue
    /// principal (champ mainModel de MainViewAPI, mode bureau comme plein écran). Chaque
    /// méthode renvoie faux si Playnite a changé : l'appelant a alors une solution de repli.
    /// </summary>
    internal class PlayniteInternals
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private readonly IPlayniteAPI api;

        public PlayniteInternals(IPlayniteAPI api)
        {
            this.api = api;
        }

        private object MainModel =>
            api.MainView?.GetType().GetField("mainModel", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(api.MainView);

        /// <summary>
        /// MainViewModelBase.UpdateLibrary(plugin) : l'import de Playnite lui-même, qui
        /// télécharge ensuite les métadonnées (images, description) des nouveaux jeux.
        /// Bloque jusqu'à la fin ; à appeler hors du thread d'interface.
        /// </summary>
        public bool UpdateLibrary(LibraryPlugin plugin)
        {
            try
            {
                var model = MainModel;
                var method = model?.GetType().GetMethod("UpdateLibrary", new[] { typeof(LibraryPlugin) });
                if (method == null)
                {
                    logger.Warn("Playscreen: Playnite UpdateLibrary not found");
                    return false;
                }
                Task task = null;
                api.MainView.UIDispatcher.Invoke(() => task = (Task)method.Invoke(model, new object[] { plugin }));
                task?.Wait();
                return true;
            }
            catch (Exception e)
            {
                logger.Error(e, "Playscreen: Playnite UpdateLibrary failed");
                return false;
            }
        }

        /// <summary>
        /// Télécharge les métadonnées de jeux déjà en base (Playnite.Metadata.MetadataDownloader,
        /// avec les réglages de métadonnées de Playnite). Bloque jusqu'à la fin.
        /// </summary>
        public bool DownloadMetadata(List<Game> games)
        {
            if (games.Count == 0)
            {
                return true;
            }
            try
            {
                var model = MainModel;
                var database = Property(model, "Database");
                var extensions = Property(model, "Extensions");
                var appSettings = Property(model, "AppSettings");
                var metadataSettings = Property(appSettings, "MetadataSettings");
                var metadataPlugins = Property(extensions, "MetadataPlugins");
                var libraryPlugins = Property(extensions, "LibraryPlugins");
                var downloaderType = AppDomain.CurrentDomain.GetAssemblies()
                    .Select(a => a.GetType("Playnite.Metadata.MetadataDownloader"))
                    .FirstOrDefault(t => t != null);
                var constructor = downloaderType?.GetConstructors()
                    .FirstOrDefault(c => c.GetParameters().Length == 3 && c.GetParameters()[2].ParameterType == typeof(List<LibraryPlugin>));
                var download = downloaderType?.GetMethod("DownloadMetadataAsync");
                if (database == null || metadataSettings == null || constructor == null || download == null)
                {
                    logger.Warn("Playscreen: Playnite metadata downloader not found");
                    return false;
                }

                var downloader = constructor.Invoke(new[] { database, metadataPlugins, libraryPlugins });
                try
                {
                    var task = (Task)download.Invoke(downloader, new object[] { games, metadataSettings, appSettings, null, CancellationToken.None });
                    task.Wait();
                }
                finally
                {
                    (downloader as IDisposable)?.Dispose();
                }
                return true;
            }
            catch (Exception e)
            {
                logger.Error(e, "Playscreen: Playnite metadata download failed");
                return false;
            }
        }

        private static object Property(object target, string name) =>
            target?.GetType().GetProperty(name)?.GetValue(target);
    }
}
