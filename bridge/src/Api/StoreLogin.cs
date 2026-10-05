using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using Playnite.SDK;
using Playnite.SDK.Plugins;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Connexion à un store : déclenche la connexion de l'extension (le bouton « Connexion »
    /// de ses réglages), agrandit sa fenêtre, puis enregistre les réglages et revérifie la
    /// connexion quand la fenêtre se ferme. Une seule connexion à la fois.
    /// </summary>
    public class StoreLogin
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(250);
        // Sans fenêtre après ce délai, l'extension a abandonné (erreur, déjà connecté…).
        private static readonly TimeSpan NoWindowTimeout = TimeSpan.FromSeconds(20);
        private static readonly TimeSpan MaxDuration = TimeSpan.FromMinutes(15);
        private const int ConnectionChecks = 4;
        private static readonly TimeSpan ConnectionCheckDelay = TimeSpan.FromSeconds(3);

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        private readonly StoreSync sync;
        private readonly object gate = new object();
        private string current;

        public StoreLogin(IPlayniteAPI api, EventHub events, StoreSync sync)
        {
            this.api = api;
            this.events = events;
            this.sync = sync;
        }

        /// <summary>
        /// Faux si une connexion est déjà en cours. alternative : connexion de secours de
        /// l'extension (Epic : navigateur du système, utile pour un compte lié à Google, que
        /// Google refuse dans un navigateur intégré).
        /// </summary>
        public bool TryStart(Stores.StoreInfo store, LibraryPlugin plugin, bool alternative)
        {
            lock (gate)
            {
                if (current != null)
                {
                    return false;
                }
                current = store.Id;
            }
            // Les fenêtres de Playnite s'ouvrent sur son thread d'interface.
            var commandName = alternative ? "LoginAlternativeCommand" : "LoginCommand";
            api.MainView.UIDispatcher.BeginInvoke(new Action(() => Run(store, plugin, commandName)));
            return true;
        }

        private void Run(Stores.StoreInfo store, LibraryPlugin plugin, string commandName)
        {
            ISettings settings = null;
            ICommand command = null;
            try
            {
                // LoginCommand n'est pas dans le SDK, mais les 4 extensions l'ont.
                settings = plugin.GetSettings(false);
                command = settings?.GetType().GetProperty(commandName)?.GetValue(settings) as ICommand;
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: no {commandName} for {store.Id}");
            }
            if (command == null)
            {
                Finish(store, plugin, null);
                return;
            }

            var before = new HashSet<Window>(Application.Current.Windows.Cast<Window>());
            var opened = new List<Window>();
            var knownPopups = new HashSet<IntPtr>(NativeWindows.TitledWindowsOfThisProcess());
            var started = DateTime.Now;
            DateTime? executed = null;
            var timer = new DispatcherTimer { Interval = PollInterval };
            timer.Tick += (_, __) =>
            {
                var windows = Application.Current.Windows.Cast<Window>().ToList();
                foreach (var window in windows.Where(w => !before.Contains(w) && !opened.Contains(w)))
                {
                    opened.Add(window);
                    Enlarge(window);
                }

                // Les fenêtres surgissantes du site (connexion Google d'Epic) ne sont pas des
                // fenêtres WPF : le navigateur intégré les crée directement, toutes petites.
                var wpfHandles = new HashSet<IntPtr>(windows.Select(w => new WindowInteropHelper(w).Handle));
                foreach (var handle in NativeWindows.TitledWindowsOfThisProcess())
                {
                    if (!wpfHandles.Contains(handle) && knownPopups.Add(handle))
                    {
                        NativeWindows.MaximizeAndFocus(handle);
                    }
                }

                var now = DateTime.Now;
                var allClosed = opened.Count > 0 && !opened.Any(windows.Contains);
                var gaveUp = opened.Count == 0 && executed.HasValue && now - executed.Value > NoWindowTimeout;
                if (allClosed || gaveUp || now - started > MaxDuration)
                {
                    timer.Stop();
                    Finish(store, plugin, settings);
                }
            };
            timer.Start();

            try
            {
                // Bloque tant que la fenêtre est ouverte (Steam, Epic, Battle.net) ou rend la
                // main tout de suite (Xbox, asynchrone) : le minuteur gère les deux cas.
                command.Execute(null);
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: login for {store.Id} failed");
            }
            executed = DateTime.Now;
        }

        /// <summary>En grand et au premier plan : lisible sur une télé, QR code compris.</summary>
        private static void Enlarge(Window window)
        {
            try
            {
                if (window.ResizeMode == ResizeMode.CanResize || window.ResizeMode == ResizeMode.CanResizeWithGrip)
                {
                    window.WindowState = WindowState.Maximized;
                }
                // Au premier plan une seule fois : une fenêtre « toujours au-dessus » cacherait
                // les fenêtres surgissantes du site (connexion Google d'Epic, par exemple).
                window.Topmost = true;
                window.Activate();
                window.Topmost = false;
            }
            catch (Exception e)
            {
                logger.Error(e, "Playscreen: failed to enlarge login window");
            }
        }

        private void Finish(Stores.StoreInfo store, LibraryPlugin plugin, ISettings settings)
        {
            try
            {
                // Comme le bouton « Sauvegarder » : Steam y garde l'identifiant du compte.
                settings?.EndEdit();
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen: failed to save {store.Id} settings");
            }

            Task.Run(async () =>
            {
                // Xbox enregistre ses jetons juste après la fermeture de la fenêtre :
                // on revérifie quelques secondes avant de conclure « non connecté ».
                for (var attempt = 0; attempt < ConnectionChecks; attempt++)
                {
                    if (attempt > 0)
                    {
                        await Task.Delay(ConnectionCheckDelay);
                    }
                    sync.RefreshConnection(store, plugin);
                    if (sync.Describe(store).Connected == true)
                    {
                        break;
                    }
                }
                events.Publish("store.updated", sync.Describe(store));
                lock (gate)
                {
                    current = null;
                }
            });
        }
    }
}
