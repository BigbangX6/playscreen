using System;
using System.Runtime.InteropServices;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Volume principal de Windows (sortie audio par défaut), par l'API Core Audio
    /// (IAudioEndpointVolume). Sans droits admin.
    /// </summary>
    internal static class SystemVolume
    {
        /// <summary>
        /// Surveille le volume (lu chaque seconde) et publie volume.changed quand il change
        /// ailleurs que dans Playscreen (touches du clavier, mélangeur de Windows, casque…).
        /// </summary>
        public static void Watch(EventHub events)
        {
            System.Threading.Tasks.Task.Run(async () =>
            {
                VolumeDto last = null;
                while (true)
                {
                    try
                    {
                        var current = Get();
                        if (last != null && (current.Level != last.Level || current.Muted != last.Muted))
                        {
                            events.Publish("volume.changed", current);
                        }
                        last = current;
                    }
                    catch (Exception)
                    {
                        // Pas de sortie audio pour l'instant (casque débranché…) : on réessaie.
                        last = null;
                    }
                    await System.Threading.Tasks.Task.Delay(1000).ConfigureAwait(false);
                }
            });
        }

        public static VolumeDto Get()
        {
            var endpoint = Endpoint();
            try
            {
                Check(endpoint.GetMasterVolumeLevelScalar(out var level));
                Check(endpoint.GetMute(out var muted));
                return new VolumeDto { Level = (int)Math.Round(level * 100), Muted = muted };
            }
            finally
            {
                Marshal.ReleaseComObject(endpoint);
            }
        }

        public static VolumeDto Set(int? level, bool? muted)
        {
            var endpoint = Endpoint();
            try
            {
                var context = Guid.Empty;
                if (level.HasValue)
                {
                    Check(endpoint.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, level.Value)) / 100f, ref context));
                }
                if (muted.HasValue)
                {
                    Check(endpoint.SetMute(muted.Value, ref context));
                }
            }
            finally
            {
                Marshal.ReleaseComObject(endpoint);
            }
            return Get();
        }

        private static IAudioEndpointVolume Endpoint()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            try
            {
                // eRender (0) = sortie, eMultimedia (1) = périphérique par défaut pour le son.
                Check(enumerator.GetDefaultAudioEndpoint(0, 1, out var device));
                try
                {
                    var iid = typeof(IAudioEndpointVolume).GUID;
                    // CLSCTX_ALL = 23
                    Check(device.Activate(ref iid, 23, IntPtr.Zero, out var endpoint));
                    return (IAudioEndpointVolume)endpoint;
                }
                finally
                {
                    Marshal.ReleaseComObject(device);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(enumerator);
            }
        }

        private static void Check(int hresult)
        {
            if (hresult != 0)
            {
                Marshal.ThrowExceptionForHR(hresult);
            }
        }

        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        private class MMDeviceEnumerator
        {
        }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            int NotImpl1();
            [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        }

        [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioEndpointVolume
        {
            // L'ordre des méthodes doit suivre exactement celui de l'interface COM.
            int RegisterControlChangeNotify(IntPtr notify);
            int UnregisterControlChangeNotify(IntPtr notify);
            int GetChannelCount(out int count);
            [PreserveSig] int SetMasterVolumeLevel(float levelDb, ref Guid context);
            [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
            [PreserveSig] int GetMasterVolumeLevel(out float levelDb);
            [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
            int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid context);
            int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
            int GetChannelVolumeLevel(uint channel, out float levelDb);
            int GetChannelVolumeLevelScalar(uint channel, out float level);
            [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
            [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
        }
    }
}
