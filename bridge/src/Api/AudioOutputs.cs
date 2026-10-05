using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Sorties audio (télé, casque, haut-parleurs) par l'API Core Audio, comme le volume :
    /// liste des sorties actives, sortie par défaut, passage à la suivante.
    /// </summary>
    internal static class AudioOutputs
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        public class Output
        {
            public string Id;
            public string Name;
        }

        public static Output Current()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            try
            {
                // eRender (0), eMultimedia (1).
                if (enumerator.GetDefaultAudioEndpoint(0, 1, out var device) != 0)
                {
                    return null;
                }
                try
                {
                    return Describe(device);
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

        public static List<Output> All()
        {
            var result = new List<Output>();
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            try
            {
                // eRender (0), DEVICE_STATE_ACTIVE (1).
                Check(enumerator.EnumAudioEndpoints(0, 1, out var devices));
                try
                {
                    Check(devices.GetCount(out var count));
                    for (uint i = 0; i < count; i++)
                    {
                        Check(devices.Item(i, out var device));
                        try
                        {
                            result.Add(Describe(device));
                        }
                        finally
                        {
                            Marshal.ReleaseComObject(device);
                        }
                    }
                }
                finally
                {
                    Marshal.ReleaseComObject(devices);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(enumerator);
            }
            return result;
        }

        /// <summary>
        /// Passe à la sortie suivante (ordre de Windows) pour tous les usages (son, communications),
        /// comme le menu du son de Windows. Renvoie la nouvelle sortie, ou null.
        /// </summary>
        public static Output Next()
        {
            var outputs = All();
            if (outputs.Count < 2)
            {
                return Current();
            }
            var current = Current();
            var index = outputs.FindIndex(o => o.Id == current?.Id);
            var next = outputs[(index + 1) % outputs.Count];
            // IPolicyConfig n'est pas documentée, mais c'est ce qu'utilise Windows lui-même.
            var policy = (IPolicyConfig)new PolicyConfigClient();
            try
            {
                for (var role = 0; role < 3; role++)
                {
                    Check(policy.SetDefaultEndpoint(next.Id, role));
                }
            }
            finally
            {
                Marshal.ReleaseComObject(policy);
            }
            logger.Info($"Playscreen: audio output -> {next.Name}");
            return next;
        }

        private static Output Describe(IMMDevice device)
        {
            Check(device.GetId(out var id));
            var name = id;
            if (device.OpenPropertyStore(0, out var store) == 0)
            {
                try
                {
                    var key = FriendlyNameKey;
                    if (store.GetValue(ref key, out var value) == 0)
                    {
                        name = Marshal.PtrToStringUni(value.Data) ?? id;
                        PropVariantClear(ref value);
                    }
                }
                finally
                {
                    Marshal.ReleaseComObject(store);
                }
            }
            return new Output { Id = id, Name = name };
        }

        private static void Check(int hresult)
        {
            if (hresult != 0)
            {
                Marshal.ThrowExceptionForHR(hresult);
            }
        }

        /// <summary>PKEY_Device_FriendlyName.</summary>
        private static readonly PropertyKey FriendlyNameKey = new PropertyKey
        {
            FormatId = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
            PropertyId = 14,
        };

        [StructLayout(LayoutKind.Sequential)]
        private struct PropertyKey
        {
            public Guid FormatId;
            public int PropertyId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PropVariant
        {
            public ushort Type;
            public ushort Reserved1;
            public ushort Reserved2;
            public ushort Reserved3;
            public IntPtr Data;
            public IntPtr Data2;
        }

        [DllImport("ole32.dll")]
        private static extern int PropVariantClear(ref PropVariant value);

        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        private class MMDeviceEnumerator
        {
        }

        [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
        private class PolicyConfigClient
        {
        }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
            [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        }

        [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceCollection
        {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int Item(uint index, out IMMDevice device);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
            [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
            [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        }

        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IPropertyStore
        {
            [PreserveSig] int GetCount(out int count);
            [PreserveSig] int GetAt(int index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        }

        /// <summary>Interface non documentée de Windows (Windows 7 et suivants) ; seul SetDefaultEndpoint sert.</summary>
        [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IPolicyConfig
        {
            int GetMixFormat();
            int GetDeviceFormat();
            int ResetDeviceFormat();
            int SetDeviceFormat();
            int GetProcessingPeriod();
            int SetProcessingPeriod();
            int GetShareMode();
            int SetShareMode();
            int GetPropertyValue();
            int SetPropertyValue();
            [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
            int SetEndpointVisibility();
        }
    }
}
