using System;
using Playnite.SDK;
using Playnite.SDK.Events;
using Playnite.SDK.Plugins;
using Playscreen.Bridge.Api;

namespace Playscreen.Bridge
{
    /// <summary>
    /// Extension Playnite qui expose l'API Playscreen en local (voir api/openapi.yaml).
    /// Livrée dans le dossier Extensions du Playnite embarqué : active d'office.
    /// </summary>
    public class PlayscreenBridge : GenericPlugin
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        private readonly EventHub events = new EventHub();
        private ApiServer server;

        public override Guid Id { get; } = Guid.Parse("5c2a9f3e-7b1d-4e6a-9c48-2f1e0d7b3a61");

        public PlayscreenBridge(IPlayniteAPI api) : base(api)
        {
            Properties = new GenericPluginProperties { HasSettings = false };
        }

        public override void OnApplicationStarted(OnApplicationStartedEventArgs args)
        {
            try
            {
                server = new ApiServer(PlayniteApi, events);
                server.Start();
                logger.Info($"Playscreen API listening on port {server.Port}");
            }
            catch (Exception e)
            {
                logger.Error(e, "Failed to start Playscreen API");
            }
        }

        public override void OnApplicationStopped(OnApplicationStoppedEventArgs args)
        {
            server?.Dispose();
            events.Dispose();
        }

        public override void OnGameStarting(OnGameStartingEventArgs args) =>
            events.Publish("game.starting", new { gameId = args.Game.Id });

        public override void OnGameStarted(OnGameStartedEventArgs args) =>
            events.Publish("game.started", new { gameId = args.Game.Id });

        public override void OnGameStopped(OnGameStoppedEventArgs args) =>
            events.Publish("game.stopped", new { gameId = args.Game.Id, sessionSeconds = args.ElapsedSeconds });

        public override void OnGameInstalled(OnGameInstalledEventArgs args) =>
            events.Publish("game.installed", new { gameId = args.Game.Id });

        public override void OnGameUninstalled(OnGameUninstalledEventArgs args) =>
            events.Publish("game.uninstalled", new { gameId = args.Game.Id });

        public override void OnLibraryUpdated(OnLibraryUpdatedEventArgs args) =>
            // Playnite ne détaille pas les changements : l'interface recharge la liste.
            events.Publish("library.updated", new { added = new string[0], updated = new string[0], removed = new string[0] });
    }
}
