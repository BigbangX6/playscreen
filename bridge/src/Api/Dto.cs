using System;
using System.Collections.Generic;
using System.IO;
using Playnite.SDK;
using Playnite.SDK.Data;
using Playnite.SDK.Models;

namespace Playscreen.Bridge.Api
{
    /// <summary>Correspondance entre nos identifiants de store et les extensions Playnite.</summary>
    public static class Stores
    {
        public class StoreInfo
        {
            public string Id { get; }
            public string Name { get; }
            public BuiltinExtension Extension { get; }

            public StoreInfo(string id, string name, BuiltinExtension extension)
            {
                Id = id;
                Name = name;
                Extension = extension;
            }
        }

        public static readonly IReadOnlyList<StoreInfo> All = new[]
        {
            new StoreInfo("steam", "Steam", BuiltinExtension.SteamLibrary),
            new StoreInfo("epic", "Epic Games", BuiltinExtension.EpicLibrary),
            new StoreInfo("xbox", "Xbox / Game Pass", BuiltinExtension.XboxLibrary),
            new StoreInfo("battlenet", "Battle.net", BuiltinExtension.BattleNetLibrary),
        };

        public static string FromPluginId(Guid pluginId)
        {
            var extension = BuiltinExtensions.GetExtensionFromId(pluginId);
            foreach (var store in All)
            {
                if (store.Extension == extension)
                {
                    return store.Id;
                }
            }
            return "other";
        }
    }

    public class StatusDto
    {
        [SerializationPropertyName("engine")] public string Engine { get; set; } = "playnite";
        [SerializationPropertyName("apiVersion")] public string ApiVersion { get; set; } = ApiServer.ApiVersion;
        [SerializationPropertyName("engineVersion")] public string EngineVersion { get; set; }
        [SerializationPropertyName("ready")] public bool Ready { get; set; }
    }

    public class StoreDto
    {
        [SerializationPropertyName("id")] public string Id { get; set; }
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("pluginInstalled")] public bool PluginInstalled { get; set; }
        [SerializationPropertyName("launcherInstalled")] public bool? LauncherInstalled { get; set; }
        [SerializationPropertyName("connected")] public bool? Connected { get; set; }
        [SerializationPropertyName("gameCount")] public int GameCount { get; set; }
    }

    public class VolumeDto
    {
        [SerializationPropertyName("level")] public int Level { get; set; }
        [SerializationPropertyName("muted")] public bool Muted { get; set; }
    }

    public class SessionDto
    {
        [SerializationPropertyName("gameId")] public Guid GameId { get; set; }
        [SerializationPropertyName("phase")] public string Phase { get; set; }
        [SerializationPropertyName("startedAt")] public DateTime StartedAt { get; set; }
        /// <summary>Fenêtre de l'application hors launcher (GameWindows), à mettre au premier plan.</summary>
        [SerializationPropertyName("windowHandle")] public long? WindowHandle { get; set; }
        [DontSerialize] public uint ProcessId { get; set; }
    }

    /// <summary>Partie en cours, tenue à jour par les événements de jeu de Playnite.</summary>
    public class SessionState
    {
        private readonly object sync = new object();
        private SessionDto current;

        public SessionDto Current
        {
            get { lock (sync) { return current; } }
        }

        public void Starting(Guid gameId)
        {
            lock (sync) { current = new SessionDto { GameId = gameId, Phase = "starting", StartedAt = DateTime.Now }; }
        }

        public void Started(Guid gameId)
        {
            lock (sync)
            {
                if (current?.GameId != gameId)
                {
                    current = new SessionDto { GameId = gameId, StartedAt = DateTime.Now };
                }
                current.Phase = "running";
            }
        }

        /// <summary>Faux si la partie n'est plus en cours.</summary>
        public bool SetWindow(Guid gameId, IntPtr handle, uint processId)
        {
            lock (sync)
            {
                if (current?.GameId != gameId)
                {
                    return false;
                }
                current.WindowHandle = handle.ToInt64();
                current.ProcessId = processId;
                return true;
            }
        }

        public void Stopped(Guid gameId)
        {
            lock (sync)
            {
                if (current?.GameId == gameId)
                {
                    current = null;
                }
            }
        }
    }

    public class MediaDto
    {
        [SerializationPropertyName("cover")] public bool Cover { get; set; }
        [SerializationPropertyName("background")] public bool Background { get; set; }
        [SerializationPropertyName("icon")] public bool Icon { get; set; }
    }

    public class GameDto
    {
        [SerializationPropertyName("id")] public Guid Id { get; set; }
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("sortingName")] public string SortingName { get; set; }
        [SerializationPropertyName("store")] public string Store { get; set; }
        [SerializationPropertyName("storeGameId")] public string StoreGameId { get; set; }
        [SerializationPropertyName("installed")] public bool Installed { get; set; }
        [SerializationPropertyName("installDirectory")] public string InstallDirectory { get; set; }
        [SerializationPropertyName("installSizeBytes")] public ulong? InstallSizeBytes { get; set; }
        [SerializationPropertyName("playtimeSeconds")] public ulong PlaytimeSeconds { get; set; }
        [SerializationPropertyName("lastPlayed")] public DateTime? LastPlayed { get; set; }
        [SerializationPropertyName("added")] public DateTime? Added { get; set; }
        [SerializationPropertyName("lastSessionSeconds")] public ulong? LastSessionSeconds { get; set; }
        [SerializationPropertyName("favorite")] public bool Favorite { get; set; }
        [SerializationPropertyName("hidden")] public bool Hidden { get; set; }
        [SerializationPropertyName("media")] public MediaDto Media { get; set; }

        public static GameDto From(Game game, IPlayniteAPI api) => new GameDto
        {
            Id = game.Id,
            Name = game.Name,
            SortingName = game.SortingName,
            Store = Stores.FromPluginId(game.PluginId),
            StoreGameId = game.GameId,
            Installed = game.IsInstalled,
            InstallDirectory = game.IsInstalled ? game.InstallDirectory : null,
            InstallSizeBytes = game.InstallSize,
            PlaytimeSeconds = game.Playtime,
            LastPlayed = game.LastActivity,
            Added = game.Added,
            LastSessionSeconds = SessionHistory.Last(game.Id),
            Favorite = game.Favorite,
            Hidden = game.Hidden,
            Media = new MediaDto
            {
                Cover = MediaPath(api, game.CoverImage) != null,
                Background = MediaPath(api, game.BackgroundImage) != null,
                Icon = MediaPath(api, game.Icon) != null,
            },
        };

        /// <summary>Chemin local d'une image du jeu, ou null (absente ou distante).</summary>
        public static string MediaPath(IPlayniteAPI api, string databasePath)
        {
            if (string.IsNullOrEmpty(databasePath) || databasePath.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
            var path = api.Database.GetFullFilePath(databasePath);
            return File.Exists(path) ? path : null;
        }
    }
}
