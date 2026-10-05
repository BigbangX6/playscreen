using System;
using System.Linq;
using System.Threading.Tasks;
using Playnite.SDK.Data;
using Windows.Media.Control;

namespace Playscreen.Bridge.Api
{
    public class NowPlayingDto
    {
        /// <summary>Application qui joue (Spotify, Chrome…), d'après son identifiant Windows.</summary>
        [SerializationPropertyName("app")] public string App { get; set; }
        [SerializationPropertyName("title")] public string Title { get; set; }
        [SerializationPropertyName("artist")] public string Artist { get; set; }
        [SerializationPropertyName("playing")] public bool Playing { get; set; }
    }

    /// <summary>
    /// Musique en cours par les commandes multimédias de Windows (celles des touches lecture /
    /// pause du clavier) : marche pour Spotify comme pour une page web qui joue du son.
    /// </summary>
    internal static class MediaSession
    {
        private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(3);

        public static NowPlayingDto Get()
        {
            var session = CurrentSession();
            if (session == null)
            {
                return null;
            }
            var properties = Wait(session.TryGetMediaPropertiesAsync().AsTask());
            var playback = session.GetPlaybackInfo();
            if (properties == null || string.IsNullOrEmpty(properties.Title))
            {
                return null;
            }
            return new NowPlayingDto
            {
                App = AppName(session.SourceAppUserModelId),
                Title = properties.Title,
                Artist = string.IsNullOrEmpty(properties.Artist) ? properties.AlbumArtist : properties.Artist,
                Playing = playback?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
            };
        }

        /// <summary>« toggle », « previous » ou « next ». Faux si rien ne joue ou commande inconnue.</summary>
        public static bool Command(string command)
        {
            var session = CurrentSession();
            if (session == null)
            {
                return false;
            }
            switch (command)
            {
                case "toggle": return Wait(session.TryTogglePlayPauseAsync().AsTask());
                case "previous": return Wait(session.TrySkipPreviousAsync().AsTask());
                case "next": return Wait(session.TrySkipNextAsync().AsTask());
                default: return false;
            }
        }

        private static GlobalSystemMediaTransportControlsSession CurrentSession()
        {
            var manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask());
            // La session « courante » de Windows, sinon la première qui joue.
            return manager?.GetCurrentSession() ?? manager?.GetSessions().FirstOrDefault();
        }

        /// <summary>Nom lisible : « Spotify.exe » ou « SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify » → « Spotify ».</summary>
        private static string AppName(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return null;
            }
            var name = id.Contains("!") ? id.Substring(id.LastIndexOf('!') + 1) : id;
            if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                name = name.Substring(0, name.Length - 4);
            }
            switch (name.ToLowerInvariant())
            {
                case "chrome": return "Chrome";
                case "msedge": return "Edge";
                case "firefox": return "Firefox";
                default: return name.Length > 0 ? char.ToUpperInvariant(name[0]) + name.Substring(1) : name;
            }
        }

        /// <summary>Les appels WinRT sont asynchrones ; le serveur HTTP de la passerelle ne l'est pas.</summary>
        private static T Wait<T>(Task<T> task) => task.Wait(Timeout) ? task.Result : default(T);
    }
}
