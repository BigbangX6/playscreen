using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Serveur HTTP local de l'API Playscreen v0 (voir api/openapi.yaml).
    /// Écoute sur 127.0.0.1 uniquement ; chaque requête doit porter le jeton.
    /// </summary>
    public class ApiServer : IDisposable
    {
        public const string ApiVersion = "0.1.0";
        public const int DefaultPort = 47800;
        private const string Prefix = "/api/v0";

        /// <summary>
        /// Origines web autorisées (CORS) : l'interface dans Tauri, et Vite en développement.
        /// Miroir de ALLOWED_ORIGINS dans api/types.ts. Le jeton reste exigé.
        /// </summary>
        private static readonly HashSet<string> AllowedOrigins = new HashSet<string>
        {
            "http://tauri.localhost", "tauri://localhost", "http://localhost:5173",
        };

        private static readonly ILogger logger = LogManager.GetLogger();

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        private readonly StoreSync sync;
        private readonly StoreLogin login;
        private readonly InstallProgress progress;
        private readonly SessionState session;
        private readonly LauncherWindows launcherWindows;
        private readonly LauncherMonitor launchers;
        private readonly SystemInfo systemInfo;
        private readonly Trophies trophies;
        private readonly string token = NewToken();
        private readonly List<Route> routes;
        private HttpListener listener;

        public int Port { get; private set; }

        public ApiServer(IPlayniteAPI api, EventHub events, StoreSync sync, SessionState session, LauncherMonitor launchers)
        {
            this.api = api;
            this.events = events;
            this.sync = sync;
            this.session = session;
            this.launchers = launchers;
            systemInfo = new SystemInfo(api);
            trophies = new Trophies(api, events);
            login = new StoreLogin(api, events, sync);
            progress = new InstallProgress(api, events);
            launcherWindows = new LauncherWindows(events);
            routes = new List<Route>
            {
                new Route("GET", @"^/status$", _ => Json(200, GetStatus())),
                new Route("GET", @"^/stores$", _ => Json(200, Stores.All.Select(sync.Describe).ToList())),
                new Route("POST", @"^/stores/([^/]+)/sync$", ctx => WithStore(ctx, (store, plugin) =>
                    sync.TryStart(store, plugin) ? new Reply(202) : Json(409, new { error = "busy" }))),
                new Route("POST", @"^/stores/([^/]+)/login$", ctx => WithStore(ctx, (store, plugin) =>
                    login.TryStart(store, plugin, ctx.Request.QueryString["method"] == "alternative")
                        ? new Reply(202) : Json(409, new { error = "busy" }))),
                new Route("GET", @"^/games$", ctx => Json(200, GetGames(ctx.Request.QueryString))),
                new Route("GET", @"^/games/([^/]+)$", ctx => WithGame(ctx, game => Json(200, GameDto.From(game, api)))),
                new Route("POST", @"^/games/([^/]+)/start$", ctx => WithGame(ctx, game =>
                    !game.IsInstalled ? Json(409, new { error = "not installed" }) : RunOnUi(() => api.StartGame(game.Id)))),
                new Route("POST", @"^/games/([^/]+)/install$", ctx => WithGame(ctx, game =>
                {
                    if (game.IsInstalled)
                    {
                        return Json(409, new { error = "already installed" });
                    }
                    var storeId = Stores.FromPluginId(game.PluginId);
                    var wasReady = launchers.Current(storeId) == LauncherMonitor.Ready;
                    var windowsBefore = launcherWindows.Snapshot(storeId);
                    logger.Info($"Playscreen: install {game.Name} ({storeId}, launcher ready: {wasReady}, {windowsBefore.Count} window(s) before)");
                    var reply = RunOnUi(() => api.InstallGame(game.Id));
                    if (storeId == "epic")
                    {
                        // L'extension Epic ouvre seulement la bibliothèque : on ouvre en plus la
                        // fenêtre d'installation du jeu (testé le 5 octobre 2026, un clic sur
                        // « Installer »). Playnite garde son suivi d'installation.
                        OpenEpicInstall(game);
                    }
                    progress.Track(game);
                    var gameId = game.Id;
                    launcherWindows.Watch(storeId, gameId, () => progress.HasProgress(gameId),
                        () => progress.Cancel(gameId), windowsBefore, () => launchers.Current(storeId) == LauncherMonitor.Ready);
                    // Demande faite pendant que le launcher démarre ou se met à jour : il
                    // l'ignore parfois (F25). On la renvoie une fois qu'il est prêt.
                    launchers.Watch(storeId, wasReady ? null : (Action)(() => ResendInstall(game.Id)));
                    return reply;
                })),
                // Epic : l'extension ouvre seulement la bibliothèque, et il n'existe pas de lien
                // de désinstallation directe (?action=uninstall ignoré, testé le 5 octobre 2026).
                new Route("POST", @"^/games/([^/]+)/uninstall$", ctx => WithGame(ctx, game =>
                {
                    if (!game.IsInstalled)
                    {
                        return Json(409, new { error = "not installed" });
                    }
                    if (Stores.FromPluginId(game.PluginId) == "xbox")
                    {
                        UninstallXbox(game);
                        return new Reply(202);
                    }
                    var reply = RunOnUi(() => api.UninstallGame(game.Id));
                    launcherWindows.Watch(Stores.FromPluginId(game.PluginId), game.Id);
                    launchers.Watch(Stores.FromPluginId(game.PluginId));
                    return reply;
                })),
                // Applications hors launcher (docs/hors-launcher.md).
                new Route("GET", @"^/apps/candidates$", _ => Json(200, CustomApps.Candidates(api))),
                new Route("POST", @"^/apps$", ctx => AddApp(ctx.Request.QueryString)),
                new Route("DELETE", @"^/games/([^/]+)$", ctx => WithGame(ctx, game =>
                {
                    if (game.PluginId != Guid.Empty)
                    {
                        return Json(409, new { error = "store game" });
                    }
                    if (session.Current?.GameId == game.Id)
                    {
                        return Json(409, new { error = "running" });
                    }
                    api.MainView.UIDispatcher.Invoke(() => api.Database.Games.Remove(game.Id));
                    events.Publish("library.updated", new { added = new string[0], updated = new string[0], removed = new[] { game.Id.ToString() } });
                    return new Reply(204);
                })),
                // L'interface revient sans qu'aucun téléchargement n'ait commencé (F30).
                new Route("POST", @"^/games/([^/]+)/install/cancel$", ctx => WithGame(ctx, game =>
                {
                    if (game.IsInstalled || progress.HasProgress(game.Id))
                    {
                        return Json(409, new { error = "downloading" });
                    }
                    progress.Cancel(game.Id);
                    return new Reply(202);
                })),
                new Route("POST", @"^/games/([^/]+)/options$", ctx => WithGame(ctx, game => SetGameOptions(game, ctx.Request.QueryString))),
                new Route("POST", @"^/games/([^/]+)/verify$", ctx => WithGame(ctx, Verify)),
                new Route("GET", @"^/games/([^/]+)/media/(cover|background|icon)$", ctx => WithGame(ctx, game => Media(game, ctx.Params[1]))),
                new Route("POST", @"^/games/([^/]+)/stop$", ctx => WithGame(ctx, game => Stop(game, ctx.Request.QueryString["force"] == "true"))),
                new Route("GET", @"^/session$", _ => Json(200, session.Current)),
                new Route("GET", @"^/system/volume$", _ => Json(200, SystemVolume.Get())),
                new Route("POST", @"^/system/volume$", ctx => SetVolume(ctx.Request.QueryString)),
                new Route("GET", @"^/launchers/settings$", _ => Json(200, LauncherSettings.List())),
                new Route("POST", @"^/launchers/settings/([^/]+)/apply$", ctx =>
                {
                    var error = LauncherSettings.Apply(ctx.Params[0]);
                    return error == null ? new Reply(204) : Json(error == "unknown" ? 404 : 409, new { error });
                }),
                new Route("GET", @"^/trophies$", _ => Json(200, trophies.Get())),
                new Route("GET", @"^/trophies/([^/]+)$", ctx => WithGame(ctx, game =>
                {
                    var list = trophies.Details(game.Id);
                    return list == null ? Json(404, new { error = "no trophies" }) : Json(200, list);
                })),
                new Route("POST", @"^/trophies/refresh$", _ =>
                    !trophies.Available ? Json(409, new { error = "SuccessStory missing" })
                    : trophies.TryRefresh() ? new Reply(202) : Json(409, new { error = "busy" })),
                new Route("GET", @"^/system$", _ => Json(200, systemInfo.Get())),
                new Route("POST", @"^/system/power$", ctx => Power(ctx.Request.QueryString["action"])),
                new Route("POST", @"^/system/quit$", _ => Quit()),
                new Route("POST", @"^/system/brightness$", ctx => SetBrightness(ctx.Request.QueryString["level"])),
                new Route("POST", @"^/system/audio-output/next$", _ =>
                {
                    var output = AudioOutputs.Next();
                    return Json(200, new { name = output?.Name });
                }),
                new Route("POST", @"^/system/media/(toggle|previous|next)$", ctx =>
                    MediaSession.Command(ctx.Params[0]) ? new Reply(202) : Json(409, new { error = "nothing playing" })),
            };
        }

        public void Start()
        {
            Port = DefaultPort;
            listener = new HttpListener();
            // À valider en phase 1 : HttpListener sans droits admin sur 127.0.0.1.
            listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            listener.Start();
            WriteEngineInfo();
            Task.Run(AcceptLoop);
        }

        private async Task AcceptLoop()
        {
            while (listener != null && listener.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                }
                catch (Exception) when (listener == null || !listener.IsListening)
                {
                    return;
                }
                _ = Task.Run(() => Handle(context));
            }
        }

        private void Handle(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;
            try
            {
                var origin = request.Headers["Origin"];
                if (origin != null && AllowedOrigins.Contains(origin))
                {
                    response.Headers["Access-Control-Allow-Origin"] = origin;
                    response.Headers["Vary"] = "Origin";
                }
                // Demande préalable du navigateur (en-tête Authorization) : pas de jeton à ce stade.
                if (request.HttpMethod == "OPTIONS")
                {
                    response.Headers["Access-Control-Allow-Methods"] = "GET, POST";
                    response.Headers["Access-Control-Allow-Headers"] = "Authorization";
                    response.Headers["Access-Control-Max-Age"] = "600";
                    Send(response, new Reply(204));
                    return;
                }

                if (!IsAuthorized(request))
                {
                    Send(response, Json(401, new { error = "unauthorized" }));
                    return;
                }

                var path = request.Url.AbsolutePath;
                if (!path.StartsWith(Prefix, StringComparison.Ordinal))
                {
                    Send(response, Json(404, new { error = "not found" }));
                    return;
                }
                path = path.Substring(Prefix.Length);

                if (request.HttpMethod == "GET" && path == "/events")
                {
                    response.StatusCode = 200;
                    response.ContentType = "text/event-stream";
                    response.Headers["Cache-Control"] = "no-cache";
                    response.SendChunked = true;
                    // Le flux reste ouvert : il est fermé par EventHub quand le client part.
                    events.Subscribe(response.OutputStream);
                    return;
                }

                foreach (var route in routes)
                {
                    if (route.Method != request.HttpMethod)
                    {
                        continue;
                    }
                    var match = route.Pattern.Match(path);
                    if (match.Success)
                    {
                        var parameters = match.Groups.Cast<Group>().Skip(1).Select(g => Uri.UnescapeDataString(g.Value)).ToArray();
                        Send(response, route.Handler(new RequestContext(request, parameters)));
                        return;
                    }
                }
                Send(response, Json(404, new { error = "not found" }));
            }
            catch (Exception e)
            {
                logger.Error(e, $"Playscreen API error on {request.HttpMethod} {request.Url}");
                try { Send(response, Json(500, new { error = e.Message })); } catch { }
            }
        }

        private StatusDto GetStatus() => new StatusDto
        {
            EngineVersion = api.ApplicationInfo.ApplicationVersion.ToString(),
            Ready = true,
        };

        /// <summary>
        /// Quitte le jeu en cours : fermeture demandée à ses fenêtres, ou de force. Playnite
        /// voit ses processus s'arrêter et envoie game.stopped.
        /// </summary>
        private Reply Stop(Playnite.SDK.Models.Game game, bool force)
        {
            if (session.Current?.GameId != game.Id)
            {
                return Json(409, new { error = "not running" });
            }
            var count = GameProcesses.Stop(game, force);
            var current = session.Current;
            if (count == 0 && current?.WindowHandle != null
                && GameWindows.Close(new IntPtr(current.WindowHandle.Value), current.ProcessId, force))
            {
                // Application hors launcher : processus hors de son dossier (GameWindows).
                count = 1;
            }
            logger.Info($"Playscreen: stop {game.Name} (force: {force}) -> {count} process(es)");
            return count > 0 ? new Reply(202) : Json(409, new { error = "no process found" });
        }

        /// <summary>
        /// Xbox : paquet retiré directement (XboxPackages), puis le jeu marqué non installé et
        /// game.uninstalled envoyé (Playnite ne le voit pas lui-même tout de suite).
        /// </summary>
        private void UninstallXbox(Playnite.SDK.Models.Game game)
        {
            var gameId = game.Id;
            var familyName = game.GameId;
            Task.Run(async () =>
            {
                try
                {
                    if (!await XboxPackages.Uninstall(familyName).ConfigureAwait(false))
                    {
                        return;
                    }
                    api.MainView.UIDispatcher.Invoke(() =>
                    {
                        var current = api.Database.Games.Get(gameId);
                        if (current != null && current.IsInstalled)
                        {
                            current.IsInstalled = false;
                            current.InstallDirectory = null;
                            api.Database.Games.Update(current);
                        }
                    });
                    events.Publish("game.uninstalled", new { gameId });
                }
                catch (Exception e)
                {
                    logger.Error(e, $"Playscreen: Xbox uninstall of {familyName} failed");
                }
            });
        }

        private Reply AddApp(System.Collections.Specialized.NameValueCollection query)
        {
            var path = query["path"];
            if (string.IsNullOrEmpty(path) || !path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
            {
                return Json(400, new { error = "existing .exe path required" });
            }
            Playnite.SDK.Models.Game game = null;
            api.MainView.UIDispatcher.Invoke(() => game = CustomApps.Add(api, query["name"], path, query["arguments"]));
            events.Publish("library.updated", new { added = new[] { game.Id.ToString() }, updated = new string[0], removed = new string[0] });
            return Json(201, GameDto.From(game, api));
        }

        /// <summary>Favori, caché (?favorite=true&amp;hidden=false) : Playnite les garde.</summary>
        private Reply SetGameOptions(Playnite.SDK.Models.Game game, System.Collections.Specialized.NameValueCollection query)
        {
            bool? favorite = bool.TryParse(query["favorite"], out var f) ? f : (bool?)null;
            bool? hidden = bool.TryParse(query["hidden"], out var h) ? h : (bool?)null;
            if (favorite == null && hidden == null)
            {
                return Json(400, new { error = "favorite or hidden required" });
            }
            api.MainView.UIDispatcher.Invoke(() =>
            {
                game.Favorite = favorite ?? game.Favorite;
                game.Hidden = hidden ?? game.Hidden;
                api.Database.Games.Update(game);
            });
            var dto = GameDto.From(game, api);
            events.Publish("game.updated", dto);
            return Json(200, dto);
        }

        /// <summary>
        /// Vérifier les fichiers du jeu dans son launcher : Steam (steam://validate) et Epic
        /// (?action=verify). Le launcher s'ouvre et affiche la vérification.
        /// </summary>
        private Reply Verify(Playnite.SDK.Models.Game game)
        {
            if (!game.IsInstalled)
            {
                return Json(409, new { error = "not installed" });
            }
            switch (Stores.FromPluginId(game.PluginId))
            {
                case "steam":
                    Process.Start($"steam://validate/{game.GameId}");
                    return new Reply(202);
                case "epic":
                    Process.Start($"com.epicgames.launcher://apps/{Uri.EscapeDataString(game.GameId)}?action=verify&silent=true");
                    return new Reply(202);
                default:
                    return Json(409, new { error = "not supported" });
            }
        }

        private static void OpenEpicInstall(Playnite.SDK.Models.Game game) =>
            Process.Start($"com.epicgames.launcher://apps/{Uri.EscapeDataString(game.GameId)}?action=install");

        /// <summary>
        /// Renvoie au launcher, devenu prêt, une demande d'installation qu'il a pu ignorer
        /// (F25, constaté le 5 octobre 2026 : Epic après sa mise à jour, Battle.net fermé). Sans
        /// passer par Playnite, qui suit déjà l'installation. Rouvrir la fenêtre ou la page du
        /// jeu est sans effet si elle est déjà ouverte.
        /// </summary>
        private void ResendInstall(Guid gameId)
        {
            var game = api.Database.Games.Get(gameId);
            if (game == null || game.IsInstalled)
            {
                return;
            }
            var storeId = Stores.FromPluginId(game.PluginId);
            logger.Info($"Playscreen: {storeId} ready, install request sent again for {game.Name}");
            if (storeId == "epic")
            {
                OpenEpicInstall(game);
            }
            else if (storeId == "battlenet")
            {
                var folder = Microsoft.Win32.Registry.GetValue(
                    @"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Battle.net",
                    "InstallLocation", null) as string;
                var exe = Path.Combine(folder ?? @"C:\Program Files (x86)\Battle.net", "Battle.net.exe");
                // Même commande que l'extension Battle.net de Playnite.
                Process.Start(exe, $"--game={progress.BattleNetUid(game)}");
            }
        }

        /// <summary>
        /// « Bureau Windows » : arrête le moteur (Playnite et la passerelle). Seule la sentinelle
        /// reste ; le méta-raccourci relance tout. Répond d'abord, puis demande à Playnite de se
        /// fermer proprement (son option --shutdown, comme le fait start-engine.cmd).
        /// </summary>
        private Reply Quit()
        {
            var exe = Process.GetCurrentProcess().MainModule.FileName;
            logger.Info("Playscreen: engine shutdown requested");
            Task.Delay(500).ContinueWith(_ => Process.Start(exe, "--shutdown"));
            return new Reply(202);
        }

        /// <summary>Répond d'abord : un arrêt immédiat couperait la réponse.</summary>
        private Reply Power(string action)
        {
            if (action != "sleep" && action != "shutdown" && action != "restart")
            {
                return Json(400, new { error = "unknown action" });
            }
            Task.Delay(500).ContinueWith(_ => SystemInfo.Power(action));
            return new Reply(202);
        }

        private Reply SetBrightness(string value)
        {
            if (!int.TryParse(value, out var level))
            {
                return Json(400, new { error = "level required" });
            }
            return SystemInfo.SetBrightness(level)
                ? Json(200, new { level = Math.Max(0, Math.Min(100, level)) })
                : Json(409, new { error = "not adjustable" });
        }

        private Reply SetVolume(System.Collections.Specialized.NameValueCollection query)
        {
            int? level = int.TryParse(query["level"], out var l) ? l : (int?)null;
            bool? muted = bool.TryParse(query["muted"], out var m) ? m : (bool?)null;
            var volume = SystemVolume.Set(level, muted);
            events.Publish("volume.changed", volume);
            return Json(200, volume);
        }

        private Reply WithStore(RequestContext ctx, Func<Stores.StoreInfo, Playnite.SDK.Plugins.LibraryPlugin, Reply> handler)
        {
            var store = Stores.All.FirstOrDefault(s => s.Id == ctx.Params[0]);
            if (store == null)
            {
                return Json(404, new { error = "unknown store" });
            }
            var plugin = sync.FindPlugin(store);
            return plugin == null ? Json(409, new { error = "plugin not installed" }) : handler(store, plugin);
        }

        private List<GameDto> GetGames(System.Collections.Specialized.NameValueCollection query)
        {
            IEnumerable<Playnite.SDK.Models.Game> games = api.Database.Games;
            if (bool.TryParse(query["installed"], out var installed))
            {
                games = games.Where(g => g.IsInstalled == installed);
            }
            var store = query["store"];
            if (!string.IsNullOrEmpty(store))
            {
                games = games.Where(g => Stores.FromPluginId(g.PluginId) == store);
            }
            return games.Select(g => GameDto.From(g, api)).ToList();
        }

        private Reply WithGame(RequestContext ctx, Func<Playnite.SDK.Models.Game, Reply> handler)
        {
            if (!Guid.TryParse(ctx.Params[0], out var id))
            {
                return Json(404, new { error = "unknown game" });
            }
            var game = api.Database.Games.Get(id);
            return game == null ? Json(404, new { error = "unknown game" }) : handler(game);
        }

        private Reply Media(Playnite.SDK.Models.Game game, string kind)
        {
            var databasePath = kind == "cover" ? game.CoverImage : kind == "background" ? game.BackgroundImage : game.Icon;
            var path = GameDto.MediaPath(api, databasePath);
            if (path == null)
            {
                return Json(404, new { error = "no media" });
            }
            return new Reply(200, MimeType(path), File.ReadAllBytes(path));
        }

        /// <summary>Les actions de jeu de Playnite doivent s'exécuter sur son thread d'interface.</summary>
        private Reply RunOnUi(Action action)
        {
            api.MainView.UIDispatcher.BeginInvoke(action);
            return new Reply(202);
        }

        private bool IsAuthorized(HttpListenerRequest request)
        {
            // Le jeton en paramètre d'URL est accepté pour EventSource (pas d'en-têtes possibles).
            return request.Headers["Authorization"] == $"Bearer {token}"
                || request.QueryString["access_token"] == token;
        }

        private void WriteEngineInfo()
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Playscreen");
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "engine.json"), Serialization.ToJson(new { port = Port, token }));
        }

        private static string NewToken()
        {
            var bytes = new byte[24];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }

        private static string MimeType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                default: return "application/octet-stream";
            }
        }

        private static Reply Json(int status, object value) =>
            new Reply(status, "application/json", Encoding.UTF8.GetBytes(Serialization.ToJson(value)));

        private static void Send(HttpListenerResponse response, Reply reply)
        {
            response.StatusCode = reply.Status;
            if (reply.ContentType != null)
            {
                response.ContentType = reply.ContentType;
            }
            if (reply.Body != null)
            {
                response.ContentLength64 = reply.Body.Length;
                response.OutputStream.Write(reply.Body, 0, reply.Body.Length);
            }
            response.Close();
        }

        public void Dispose()
        {
            var current = listener;
            listener = null;
            try { current?.Stop(); current?.Close(); } catch { }
        }

        private class Reply
        {
            public int Status { get; }
            public string ContentType { get; }
            public byte[] Body { get; }

            public Reply(int status, string contentType = null, byte[] body = null)
            {
                Status = status;
                ContentType = contentType;
                Body = body;
            }
        }

        private class RequestContext
        {
            public HttpListenerRequest Request { get; }
            public string[] Params { get; }

            public RequestContext(HttpListenerRequest request, string[] parameters)
            {
                Request = request;
                Params = parameters;
            }
        }

        private class Route
        {
            public string Method { get; }
            public Regex Pattern { get; }
            public Func<RequestContext, Reply> Handler { get; }

            public Route(string method, string pattern, Func<RequestContext, Reply> handler)
            {
                Method = method;
                Pattern = new Regex(pattern, RegexOptions.Compiled);
                Handler = handler;
            }
        }
    }
}
