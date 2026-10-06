using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Diffuse les événements aux clients abonnés à GET /events (Server-Sent Events).
    /// </summary>
    public class EventHub : IDisposable
    {
        private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(15);

        private readonly object sync = new object();
        private readonly List<Stream> subscribers = new List<Stream>();
        private readonly Timer keepAlive;

        public EventHub()
        {
            keepAlive = new Timer(_ => Broadcast(": keep-alive\n\n"), null, KeepAliveInterval, KeepAliveInterval);
        }

        public void Subscribe(Stream stream)
        {
            lock (sync)
            {
                subscribers.Add(stream);
            }
            Write(stream, ": connected\n\n");
        }

        public void Publish(string type, object data)
        {
            Broadcast($"event: {type}\ndata: {Serialization.ToJson(data)}\n\n");
        }

        private void Broadcast(string message)
        {
            List<Stream> snapshot;
            lock (sync)
            {
                snapshot = new List<Stream>(subscribers);
            }
            foreach (var stream in snapshot)
            {
                Write(stream, message);
            }
        }

        private void Write(Stream stream, string message)
        {
            try
            {
                var bytes = Encoding.UTF8.GetBytes(message);
                lock (stream)
                {
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush();
                }
            }
            catch (Exception)
            {
                // Client parti : on l'oublie.
                lock (sync)
                {
                    subscribers.Remove(stream);
                }
                try { stream.Dispose(); } catch { }
            }
        }

        public void Dispose()
        {
            keepAlive.Dispose();
            lock (sync)
            {
                foreach (var stream in subscribers)
                {
                    try { stream.Dispose(); } catch { }
                }
                subscribers.Clear();
            }
        }
    }
}
