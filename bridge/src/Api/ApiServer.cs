using System;
using System.Collections.Generic;
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

        private static readonly ILogger logger = LogManager.GetLogger();

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        private readonly string token = NewToken();
        private readonly List<Route> routes;
        private HttpListener listener;

        public int Port { get; private set; }

        public ApiServer(IPlayniteAPI api, EventHub events)
        {
            this.api = api;
            this.events = events;
            routes = new List<Route>
            {
                new Route("GET", @"^/status$", _ => Json(200, GetStatus())),
                new Route("GET", @"^/stores$", _ => Json(200, GetStores())),
                new Route("POST", @"^/stores/([^/]+)/sync$", _ => NotImplemented("sync (phase 2)")),
                new Route("POST", @"^/stores/([^/]+)/login$", _ => NotImplemented("login (phase 3)")),
                new Route("GET", @"^/games$", ctx => Json(200, GetGames(ctx.Request.QueryString))),
                new Route("GET", @"^/games/([^/]+)$", ctx => WithGame(ctx, game => Json(200, GameDto.From(game, api)))),
                new Route("POST", @"^/games/([^/]+)/start$", ctx => WithGame(ctx, game =>
                    !game.IsInstalled ? Json(409, new { error = "not installed" }) : RunOnUi(() => api.StartGame(game.Id)))),
                new Route("POST", @"^/games/([^/]+)/install$", ctx => WithGame(ctx, game =>
                    game.IsInstalled ? Json(409, new { error = "already installed" }) : RunOnUi(() => api.InstallGame(game.Id)))),
                new Route("POST", @"^/games/([^/]+)/uninstall$", ctx => WithGame(ctx, game =>
                    !game.IsInstalled ? Json(409, new { error = "not installed" }) : RunOnUi(() => api.UninstallGame(game.Id)))),
                new Route("GET", @"^/games/([^/]+)/media/(cover|background|icon)$", ctx => WithGame(ctx, game => Media(game, ctx.Params[1]))),
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

        private List<StoreDto> GetStores()
        {
            var pluginIds = new HashSet<Guid>(api.Addons.Plugins.Select(p => p.Id));
            var games = api.Database.Games.ToList();
            return Stores.All.Select(store =>
            {
                var pluginId = BuiltinExtensions.GetIdFromExtension(store.Extension);
                return new StoreDto
                {
                    Id = store.Id,
                    Name = store.Name,
                    PluginInstalled = pluginIds.Contains(pluginId),
                    LauncherInstalled = null, // phase 2
                    Connected = null,         // phase 2
                    GameCount = games.Count(g => g.PluginId == pluginId),
                };
            }).ToList();
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

        private static Reply NotImplemented(string what) => Json(501, new { error = $"not implemented: {what}" });

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
