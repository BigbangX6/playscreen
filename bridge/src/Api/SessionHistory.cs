using System;
using System.Collections.Generic;
using System.IO;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Durée de la dernière partie de chaque jeu (« Joué hier, 1 h 12 » sur l'accueil).
    /// Playnite ne garde que le temps total : on note chaque game.stopped dans
    /// %LOCALAPPDATA%\Playscreen\sessions.json.
    /// </summary>
    internal static class SessionHistory
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly object sync = new object();
        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Playscreen", "sessions.json");
        private static Dictionary<Guid, ulong> last;

        public static ulong? Last(Guid gameId)
        {
            lock (sync)
            {
                Load();
                return last.TryGetValue(gameId, out var seconds) ? seconds : (ulong?)null;
            }
        }

        public static void Record(Guid gameId, ulong seconds)
        {
            lock (sync)
            {
                Load();
                last[gameId] = seconds;
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                    File.WriteAllText(FilePath, Serialization.ToJson(last));
                }
                catch (Exception e)
                {
                    logger.Error(e, "Playscreen: cannot save sessions.json");
                }
            }
        }

        private static void Load()
        {
            if (last != null)
            {
                return;
            }
            last = new Dictionary<Guid, ulong>();
            try
            {
                if (File.Exists(FilePath))
                {
                    last = Serialization.FromJson<Dictionary<Guid, ulong>>(File.ReadAllText(FilePath)) ?? last;
                }
            }
            catch (Exception e)
            {
                logger.Error(e, "Playscreen: cannot read sessions.json");
            }
        }
    }
}
