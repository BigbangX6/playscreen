using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Win32;
using Playnite.SDK;
using Playnite.SDK.Models;
using Playnite.SDK.Plugins;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// État des stores (launcher installé, compte connecté) et synchronisation à la demande.
    /// Playnite n'a pas de méthode publique « mettre à jour la bibliothèque » : on appelle
    /// LibraryPlugin.GetGames puis Database.ImportGame, comme Playnite le fait lui-même.
    /// </summary>
    public class StoreSync
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan LoginCheckTimeout = TimeSpan.FromSeconds(30);

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        // Vérifier la connexion fait un appel réseau : on garde le dernier résultat connu.
        private readonly ConcurrentDictionary<string, bool?> connected = new ConcurrentDictionary<string, bool?>();
        private readonly HashSet<string> running = new HashSet<string>();
        private readonly PlayniteInternals internals;

        public StoreSync(IPlayniteAPI api, EventHub events)
        {
            this.api = api;
            this.events = events;
            internals = new PlayniteInternals(api);
        }

        public LibraryPlugin FindPlugin(Stores.StoreInfo store)
        {
            var pluginId = BuiltinExtensions.GetIdFromExtension(store.Extension);
            return api.Addons.Plugins.OfType<LibraryPlugin>().FirstOrDefault(p => p.Id == pluginId);
        }

        public StoreDto Describe(Stores.StoreInfo store)
        {
            var plugin = FindPlugin(store);
            var pluginId = BuiltinExtensions.GetIdFromExtension(store.Extension);
            return new StoreDto
            {
                Id = store.Id,
                Name = store.Name,
                PluginInstalled = plugin != null,
                LauncherInstalled = IsLauncherInstalled(store, plugin),
                Connected = connected.TryGetValue(store.Id, out var value) ? value : null,
                GameCount = api.Database.Games.Count(g => g.PluginId == pluginId),
            };
        }

        /// <summary>Lance la synchronisation en arrière-plan. Faux si elle tourne déjà.</summary>
        public bool TryStart(Stores.StoreInfo store, LibraryPlugin plugin)
        {
            lock (running)
            {
                if (!running.Add(store.Id))
                {
                    return false;
                }
            }
            Task.Run(() => Run(store, plugin));
            return true;
        }

        /// <summary>Vérifie la connexion des stores en arrière-plan (au démarrage).</summary>
        public void RefreshConnections()
        {
            foreach (var store in Stores.All)
            {
                var plugin = FindPlugin(store);
                if (plugin != null)
                {
                    Task.Run(() =>
                    {
                        RefreshConnection(store, plugin);
                        events.Publish("store.updated", Describe(store));
                    });
                }
            }
        }

        private void Run(Stores.StoreInfo store, LibraryPlugin plugin)
        {
            events.Publish("sync.started", new { storeId = store.Id });
            string error = null;
            try
            {
                var added = new List<Guid>();
                var updated = new List<Guid>();
                // L'import de Playnite lui-même télécharge aussi les images des nouveaux jeux ;
                // notre import n'est qu'un repli si Playnite a changé.
                var before = api.Database.Games.Where(g => g.PluginId == plugin.Id)
                    .ToDictionary(g => g.Id, g => g.IsInstalled + "|" + g.InstallDirectory);
                if (internals.UpdateLibrary(plugin))
                {
                    foreach (var game in api.Database.Games.Where(g => g.PluginId == plugin.Id))
                    {
                        if (!before.TryGetValue(game.Id, out var state))
                        {
                            added.Add(game.Id);
                        }
                        else if (state != game.IsInstalled + "|" + game.InstallDirectory)
                        {
                            updated.Add(game.Id);
                        }
                    }
                }
                else
                {
                    Import(plugin, added, updated);
                }

                // Rattrapage : jeux sans jaquette (importés par une ancienne version de la
                // passerelle, ou image indisponible lors de l'import).
                var withoutCover = api.Database.Games
                    .Where(g => g.PluginId == plugin.Id && string.IsNullOrEmpty(g.CoverImage) && !added.Contains(g.Id))
                    .ToList();
                if (withoutCover.Count > 0 && internals.DownloadMetadata(withoutCover))
                {
                    updated.AddRange(withoutCover.Select(g => g.Id).Where(id => !updated.Contains(id)));
                }
                logger.Info($"Playscreen sync {store.Id}: {added.Count} added, {updated.Count} updated, {withoutCover.Count} without cover");
                if (added.Count > 0 || updated.Count > 0)
                {
                    events.Publish("library.updated", new { added, updated, removed = new Guid[0] });
                }
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen sync {store.Id} failed");
                error = e.Message;
            }
            finally
            {
                lock (running)
                {
                    running.Remove(store.Id);
                }
            }

            RefreshConnection(store, plugin);
            events.Publish("store.updated", Describe(store));
            // Sans compte connecté, seuls les jeux installés ont pu être importés.
            if (error == null && connected.TryGetValue(store.Id, out var isConnected) && isConnected == false)
            {
                error = "not connected";
            }
            if (error == null)
            {
                events.Publish("sync.finished", new { storeId = store.Id, ok = true });
            }
            else
            {
                events.Publish("sync.finished", new { storeId = store.Id, ok = false, error });
            }
        }

        /// <summary>Repli : même logique que GameDatabase.ImportGames de Playnite 10, sans les images.</summary>
        private void Import(LibraryPlugin plugin, List<Guid> added, List<Guid> updated)
        {
            var excluded = new HashSet<string>(api.Database.ImportExclusions
                .Where(e => e.LibraryId == plugin.Id)
                .Select(e => e.GameId));
            var metadata = plugin.GetGames(new LibraryGetGamesArgs())?.ToList() ?? new List<GameMetadata>();

            using (api.Database.BufferedUpdate())
            {
                foreach (var meta in metadata)
                {
                    if (excluded.Contains(meta.GameId))
                    {
                        continue;
                    }

                    var existing = api.Database.Games.FirstOrDefault(g => g.PluginId == plugin.Id && g.GameId == meta.GameId);
                    if (existing == null)
                    {
                        added.Add(api.Database.ImportGame(meta, plugin).Id);
                        continue;
                    }

                    // Un jeu ajouté ou forcé à la main garde l'état choisi par l'utilisateur.
                    if (existing.IsCustomGame || existing.OverrideInstallState)
                    {
                        continue;
                    }
                    if (existing.IsInstalled != meta.IsInstalled
                        || !string.Equals(existing.InstallDirectory, meta.InstallDirectory, StringComparison.OrdinalIgnoreCase))
                    {
                        existing.IsInstalled = meta.IsInstalled;
                        existing.InstallDirectory = meta.InstallDirectory;
                        api.Database.Games.Update(existing);
                        updated.Add(existing.Id);
                    }
                }
            }
        }

        /// <summary>
        /// Les 4 extensions exposent IsUserLoggedIn sur leur modèle de réglages (pas dans le
        /// SDK) : on le lit par réflexion. En cas de doute : null, jamais une fausse certitude.
        /// </summary>
        public void RefreshConnection(Stores.StoreInfo store, LibraryPlugin plugin)
        {
            bool? value = null;
            try
            {
                var settings = plugin.GetSettings(false);
                var property = settings?.GetType().GetProperty("IsUserLoggedIn");
                if (property != null)
                {
                    var check = Task.Run(() => (bool)property.GetValue(settings));
                    if (check.Wait(LoginCheckTimeout))
                    {
                        value = check.Result;
                    }
                    else
                    {
                        logger.Warn($"Playscreen: login check for {store.Id} timed out");
                    }
                }
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: login check for {store.Id} failed");
            }
            connected[store.Id] = value;
        }

        private static bool? IsLauncherInstalled(Stores.StoreInfo store, LibraryPlugin plugin)
        {
            try
            {
                // L'extension Xbox répond toujours « installé » : on cherche l'appli Xbox nous-mêmes.
                if (store.Id == "xbox")
                {
                    return IsAppxPackageInstalled("Microsoft.GamingApp_");
                }
                return plugin?.Client?.IsInstalled;
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: launcher check for {store.Id} failed");
                return null;
            }
        }

        /// <summary>Paquets du Microsoft Store installés pour l'utilisateur courant (lecture seule).</summary>
        private static bool IsAppxPackageInstalled(string familyPrefix)
        {
            const string packages = @"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";
            using (var key = Registry.CurrentUser.OpenSubKey(packages))
            {
                return key != null && key.GetSubKeyNames().Any(n => n.StartsWith(familyPrefix, StringComparison.OrdinalIgnoreCase));
            }
        }
    }
}
