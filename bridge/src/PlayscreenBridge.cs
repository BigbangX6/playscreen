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
        private readonly SessionState session = new SessionState();
        private readonly LauncherMonitor launchers;
        private ApiServer server;

        public override Guid Id { get; } = Guid.Parse("5c2a9f3e-7b1d-4e6a-9c48-2f1e0d7b3a61");

        public PlayscreenBridge(IPlayniteAPI api) : base(api)
        {
            Properties = new GenericPluginProperties { HasSettings = false };
            launchers = new LauncherMonitor(events);
        }

        public override void OnApplicationStarted(OnApplicationStartedEventArgs args)
        {
            try
            {
                var sync = new StoreSync(PlayniteApi, events);
                server = new ApiServer(PlayniteApi, events, sync, session, launchers);
                server.Start();
                logger.Info($"Playscreen API listening on port {server.Port}");
                sync.RefreshConnections();
                SystemVolume.Watch(events);
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

        public override void OnGameStarting(OnGameStartingEventArgs args)
        {
            session.Starting(args.Game.Id);
            events.Publish("game.starting", new { gameId = args.Game.Id });
            // Le launcher peut démarrer ou se mettre à jour avant le jeu (F26).
            launchers.Watch(Stores.FromPluginId(args.Game.PluginId));
            // La mémoire pour le jeu : les autres launchers sont fermés.
            LauncherShutdown.CloseOthers(PlayniteApi, Stores.FromPluginId(args.Game.PluginId));
            if (Stores.FromPluginId(args.Game.PluginId) == "other")
            {
                // Application hors launcher : sa fenêtre s'ouvre derrière Playscreen.
                var gameId = args.Game.Id;
                Api.GameWindows.Watch(gameId, () => session.Current?.GameId == gameId, (handle, processId) =>
                {
                    if (session.SetWindow(gameId, handle, processId))
                    {
                        events.Publish("game.window", new { gameId, handle = handle.ToInt64() });
                    }
                });
            }
        }

        public override void OnGameStarted(OnGameStartedEventArgs args)
        {
            session.Started(args.Game.Id);
            events.Publish("game.started", new { gameId = args.Game.Id });
        }

        public override void OnGameStopped(OnGameStoppedEventArgs args)
        {
            session.Stopped(args.Game.Id);
            SessionHistory.Record(args.Game.Id, args.ElapsedSeconds);
            LauncherWindows.MinimizeAfterGame(Stores.FromPluginId(args.Game.PluginId));
            events.Publish("game.stopped", new { gameId = args.Game.Id, sessionSeconds = args.ElapsedSeconds });
        }

        public override void OnGameInstalled(OnGameInstalledEventArgs args) =>
            events.Publish("game.installed", new { gameId = args.Game.Id });

        public override void OnGameUninstalled(OnGameUninstalledEventArgs args) =>
            events.Publish("game.uninstalled", new { gameId = args.Game.Id });

        public override void OnLibraryUpdated(OnLibraryUpdatedEventArgs args) =>
            // Playnite ne détaille pas les changements : l'interface recharge la liste.
            events.Publish("library.updated", new { added = new string[0], updated = new string[0], removed = new string[0] });
    }
}
