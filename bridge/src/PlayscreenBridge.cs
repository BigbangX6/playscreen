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
        private readonly MemoryTrim memory = new MemoryTrim();
        private LauncherWindows launcherWindows;
        private readonly LauncherMonitor launchers;
        private ApiServer server;
        /// <summary>
        /// Connexions aux stores gardées en vie : revérifiées toutes les 6 heures (Epic renouvelle
        /// alors son jeton ; sans cela, il expire après quelques semaines sans Playscreen).
        /// Pas pendant une partie (navigateur intégré = mémoire prise au jeu).
        /// </summary>
        private System.Threading.Timer keepAlive;

        /// <summary>Session Battle.net gardée active (elle expire après ~30 min sans visite).</summary>
        private System.Threading.Timer battleNetAlive;

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
                System.Threading.Tasks.Task.Run(() => Api.SteamSettings.EnableControllerOverlay());
                server.ResumeInstalls();
                keepAlive = new System.Threading.Timer(_ =>
                {
                    if (session.Current == null)
                    {
                        logger.Info("Playscreen: keeping store connections alive");
                        sync.RefreshConnections();
                    }
                }, null, TimeSpan.FromHours(6), TimeSpan.FromHours(6));
                battleNetAlive = new System.Threading.Timer(_ => sync.KeepBattleNetAlive(),
                    null, TimeSpan.FromMinutes(20), TimeSpan.FromMinutes(20));
                new PlayniteInternals(PlayniteApi).DisableUpdateChecks();
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
            LauncherWindows.GameStarting();
            session.Starting(args.Game.Id);
            events.Publish("game.starting", new { gameId = args.Game.Id });
            // Le launcher peut démarrer ou se mettre à jour avant le jeu (F26).
            launchers.Watch(Stores.FromPluginId(args.Game.PluginId));
            // Fenêtre du launcher qui demande un clic avant le jeu (Steam : « option de
            // lancement »…) : signalée à l'interface, qui la met devant avec la souris manette.
            // Jusqu'ici surveillé seulement pendant les installations (série du 16/11/2026).
            var startingId = args.Game.Id;
            launcherWindows = launcherWindows ?? new LauncherWindows(events);
            launcherWindows.Watch(Stores.FromPluginId(args.Game.PluginId), startingId,
                () => session.Current?.GameId != startingId || session.Current?.Phase == "running",
                // Tant que le jeu n'a pas démarré : Epic affiche « Échec du lancement » après
                // l'attente d'une autorisation Windows (UAC), plus de 2 min (Rocket League,
                // 16/11/2026) ; le message restait derrière Playscreen.
                duration: TimeSpan.FromMinutes(5));
            // La mémoire pour le jeu : les autres launchers sont fermés.
            LauncherShutdown.CloseOthers(PlayniteApi, Stores.FromPluginId(args.Game.PluginId), server?.BusyStores());
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
            memory.GameStarted();
            events.Publish("game.started", new { gameId = args.Game.Id });
        }

        public override void OnGameStopped(OnGameStoppedEventArgs args)
        {
            session.Stopped(args.Game.Id);
            memory.GameStopped();
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
