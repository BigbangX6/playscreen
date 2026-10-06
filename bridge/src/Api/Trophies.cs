using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    public class TrophyCountDto
    {
        [SerializationPropertyName("unlocked")] public int Unlocked { get; set; }
        [SerializationPropertyName("total")] public int Total { get; set; }
    }

    public class LastTrophyDto
    {
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("gameId")] public Guid GameId { get; set; }
        [SerializationPropertyName("gameName")] public string GameName { get; set; }
        [SerializationPropertyName("unlockedAt")] public DateTime UnlockedAt { get; set; }
    }

    public class TrophyDetailDto
    {
        [SerializationPropertyName("id")] public string Id { get; set; }
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("description")] public string Description { get; set; }
        [SerializationPropertyName("unlockedAt")] public DateTime? UnlockedAt { get; set; }
        [SerializationPropertyName("rarity")] public double? Rarity { get; set; }
        [SerializationPropertyName("secret")] public bool Secret { get; set; }
    }

    public class TrophiesDto
    {
        /// <summary>Par jeu (identifiant Playnite), seulement les jeux qui ont des trophées.</summary>
        [SerializationPropertyName("games")] public Dictionary<string, TrophyCountDto> Games { get; set; }
        [SerializationPropertyName("unlocked")] public int Unlocked { get; set; }
        [SerializationPropertyName("last")] public LastTrophyDto Last { get; set; }
        /// <summary>Récupération en cours (POST /trophies/refresh).</summary>
        [SerializationPropertyName("refreshing")] public bool Refreshing { get; set; }
    }

    /// <summary>
    /// Trophées (succès) des jeux, par l'extension SuccessStory livrée avec le moteur. Elle les
    /// récupère d'elle-même après chaque partie ; POST /trophies/refresh les demande pour toute
    /// la bibliothèque (RefreshNoLoader : sans fenêtre de progression). Tout passe par
    /// réflexion : SuccessStory n'a pas d'API publique.
    /// </summary>
    internal class Trophies
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private const string PluginTypeName = "SuccessStory.SuccessStory";

        private readonly IPlayniteAPI api;
        private readonly EventHub events;
        private int refreshing;

        public Trophies(IPlayniteAPI api, EventHub events)
        {
            this.api = api;
            this.events = events;
            // Premier démarrage : rien n'est encore récupéré. On laisse le temps aux
            // extensions de se connecter, puis on récupère tout en arrière-plan.
            Task.Delay(TimeSpan.FromMinutes(1)).ContinueWith(_ =>
            {
                if (Available && Get().Games.Count == 0)
                {
                    TryRefresh();
                }
            });
        }

        public bool Available => Database() != null;

        public TrophiesDto Get()
        {
            var result = new TrophiesDto { Games = new Dictionary<string, TrophyCountDto>(), Refreshing = refreshing > 0 };
            var database = Database();
            if (database == null)
            {
                return result;
            }
            var get = database.GetType().GetMethod("Get", new[] { typeof(Guid), typeof(bool), typeof(bool) });
            foreach (var game in api.Database.Games.ToList())
            {
                // onlyCache : ne rien télécharger ici, juste lire ce que SuccessStory a déjà.
                var data = get?.Invoke(database, new object[] { game.Id, true, false });
                if (data == null || !(Read<bool>(data, "HasAchievements")))
                {
                    continue;
                }
                var total = Read<int>(data, "Total");
                if (total <= 0)
                {
                    continue;
                }
                var unlocked = Read<int>(data, "Unlocked");
                result.Games[game.Id.ToString()] = new TrophyCountDto { Unlocked = unlocked, Total = total };
                result.Unlocked += unlocked;
                foreach (var item in (Read<object>(data, "Items") as IEnumerable)?.Cast<object>() ?? Enumerable.Empty<object>())
                {
                    var date = Read<DateTime?>(item, "DateUnlocked");
                    // SuccessStory met une date par défaut (année 1) aux trophées sans date connue.
                    if (date.HasValue && date.Value.Year > 2000 && (result.Last == null || date.Value > result.Last.UnlockedAt))
                    {
                        result.Last = new LastTrophyDto
                        {
                            Name = Read<string>(item, "Name"),
                            GameId = game.Id,
                            GameName = game.Name,
                            UnlockedAt = date.Value,
                        };
                    }
                }
            }
            return result;
        }

        /// <summary>
        /// Trophées d'un jeu (ce que SuccessStory a déjà en cache), ou null si le jeu n'en a pas.
        /// </summary>
        public List<TrophyDetailDto> Details(Guid gameId)
        {
            var database = Database();
            var get = database?.GetType().GetMethod("Get", new[] { typeof(Guid), typeof(bool), typeof(bool) });
            var data = get?.Invoke(database, new object[] { gameId, true, false });
            if (data == null || !Read<bool>(data, "HasAchievements"))
            {
                return null;
            }
            return ((Read<object>(data, "Items") as IEnumerable)?.Cast<object>() ?? Enumerable.Empty<object>())
                .Select(item =>
                {
                    var date = Read<DateTime?>(item, "DateUnlocked");
                    var percent = Read<float?>(item, "Percent") ?? (float?)Read<double?>(item, "Percent");
                    return new TrophyDetailDto
                    {
                        Id = Read<string>(item, "ApiName") ?? Read<string>(item, "Name"),
                        Name = Read<string>(item, "Name"),
                        Description = Read<string>(item, "Description") ?? "",
                        // Date par défaut (année 1) = pas obtenu.
                        UnlockedAt = date.HasValue && date.Value.Year > 1 ? date : null,
                        // SuccessStory met 100 quand le launcher ne donne pas la rareté.
                        Rarity = percent.HasValue && percent.Value < 100 ? Math.Round(percent.Value, 1) : (double?)null,
                        Secret = Read<bool>(item, "IsHidden"),
                    };
                })
                .ToList();
        }

        /// <summary>
        /// Récupère les trophées de tous les jeux des stores en arrière-plan, un jeu après
        /// l'autre. Faux si une récupération tourne déjà ou si SuccessStory est absent.
        /// </summary>
        public bool TryRefresh()
        {
            var database = Database();
            // RefreshNoLoader(Guid) en 3.7, RefreshNoLoader(Guid, CancellationToken) en 3.7.1.
            var refresh = database?.GetType().GetMethod("RefreshNoLoader", new[] { typeof(Guid), typeof(CancellationToken) })
                ?? database?.GetType().GetMethod("RefreshNoLoader", new[] { typeof(Guid) });
            if (refresh == null)
            {
                logger.Warn("Playscreen: SuccessStory RefreshNoLoader not found");
                return false;
            }
            if (Interlocked.CompareExchange(ref refreshing, 1, 0) != 0)
            {
                return false;
            }
            var withToken = refresh.GetParameters().Length == 2;
            EnsureSteamAccount();
            var ids = api.Database.Games.Where(g => Stores.FromPluginId(g.PluginId) != "other").Select(g => g.Id).ToList();
            Task.Run(() =>
            {
                logger.Info($"Playscreen: refreshing trophies of {ids.Count} games");
                foreach (var id in ids)
                {
                    try
                    {
                        refresh.Invoke(database, withToken ? new object[] { id, CancellationToken.None } : new object[] { id });
                    }
                    catch (Exception e)
                    {
                        logger.Warn($"Playscreen: trophies of {id} failed: {(e.InnerException ?? e).Message}");
                    }
                }
                Interlocked.Exchange(ref refreshing, 0);
                logger.Info("Playscreen: trophies refreshed");
                events.Publish("trophies.updated", new { });
            });
            return true;
        }

        /// <summary>
        /// SuccessStory ne lit les trophées Steam qu'avec un compte choisi dans ses réglages
        /// (« Steam is not configured » sinon). On choisit à sa place le compte Steam de ce PC
        /// (loginusers.vdf, comme sa liste de comptes), et on note si son profil est public.
        /// </summary>
        private void EnsureSteamAccount()
        {
            try
            {
                var plugin = api.Addons.Plugins.FirstOrDefault(p => p.GetType().FullName == PluginTypeName);
                var steamApi = plugin?.GetType().GetProperty("SteamApi")?.GetValue(plugin);
                if (steamApi == null || (bool)steamApi.GetType().GetMethod("IsConfigured", Type.EmptyTypes).Invoke(steamApi, null))
                {
                    return;
                }
                var users = (steamApi.GetType().GetMethod("GetSteamUsers", Type.EmptyTypes)?.Invoke(steamApi, null) as IEnumerable)?.Cast<object>().ToList();
                var user = users?.FirstOrDefault();
                if (user == null)
                {
                    logger.Warn("Playscreen: no local Steam user for SuccessStory");
                    return;
                }
                var accountProperty = steamApi.GetType().GetProperty("CurrentAccountInfos");
                var account = Activator.CreateInstance(accountProperty.PropertyType);
                var steamId = Read<ulong>(user, "SteamId").ToString();
                Set(account, "UserId", steamId);
                Set(account, "Pseudo", Read<string>(user, "PersonaName"));
                Set(account, "Link", $"https://steamcommunity.com/profiles/{steamId}");
                Set(account, "IsCurrent", true);
                Set(account, "DateAdded", (DateTime?)DateTime.Now);
                var isPublic = steamApi.GetType().GetMethod("CheckIsPublic", new[] { accountProperty.PropertyType })?.Invoke(steamApi, new[] { account }) as bool?;
                Set(account, "IsPrivate", isPublic != true);
                accountProperty.SetValue(steamApi, account);
                steamApi.GetType().GetMethod("SaveCurrentUser", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, Type.EmptyTypes, null)
                    ?.Invoke(steamApi, null);
                logger.Info($"Playscreen: SuccessStory Steam account set ({steamId}, public profile: {isPublic})");
            }
            catch (Exception e)
            {
                logger.Error(e, "Playscreen: cannot set SuccessStory Steam account");
            }
        }

        private static void Set(object target, string name, object value) =>
            target.GetType().GetProperty(name)?.SetValue(target, value);

        /// <summary>Base de SuccessStory (propriété PluginDatabase de l'extension), ou null.</summary>
        private object Database()
        {
            var plugin = api.Addons.Plugins.FirstOrDefault(p => p.GetType().FullName == PluginTypeName);
            if (plugin == null)
            {
                return null;
            }
            for (var type = plugin.GetType(); type != null; type = type.BaseType)
            {
                var property = type.GetProperty("PluginDatabase", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                if (property != null)
                {
                    return property.GetValue(property.GetGetMethod(true).IsStatic ? null : plugin);
                }
            }
            return null;
        }

        private static T Read<T>(object target, string name)
        {
            var value = target.GetType().GetProperty(name)?.GetValue(target);
            return value is T typed ? typed : default(T);
        }
    }
}
