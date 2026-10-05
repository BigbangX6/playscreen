using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    public class SystemDto
    {
        [SerializationPropertyName("network")] public NetworkDto Network { get; set; }
        [SerializationPropertyName("controllerBattery")] public int? ControllerBattery { get; set; }
        [SerializationPropertyName("brightness")] public int? Brightness { get; set; }
        [SerializationPropertyName("audioOutput")] public string AudioOutput { get; set; }
        [SerializationPropertyName("disks")] public List<DiskDto> Disks { get; set; }
        [SerializationPropertyName("media")] public NowPlayingDto Media { get; set; }
    }

    public class NetworkDto
    {
        /// <summary>« wifi », « ethernet » ou « none ».</summary>
        [SerializationPropertyName("kind")] public string Kind { get; set; }
        [SerializationPropertyName("name")] public string Name { get; set; }
    }

    public class DiskDto
    {
        [SerializationPropertyName("letter")] public string Letter { get; set; }
        [SerializationPropertyName("label")] public string Label { get; set; }
        [SerializationPropertyName("totalBytes")] public long TotalBytes { get; set; }
        [SerializationPropertyName("freeBytes")] public long FreeBytes { get; set; }
        [SerializationPropertyName("gamesBytes")] public long GamesBytes { get; set; }
    }

    /// <summary>
    /// Ce que l'interface affiche du PC en dehors des jeux (centre rapide, paramètres) :
    /// réseau, batterie de la manette, luminosité, disques ; et l'alimentation. Sans droits
    /// admin. Chaque valeur vaut null si elle n'existe pas sur ce PC (l'interface la cache).
    /// </summary>
    internal class SystemInfo
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan NetworkCacheDuration = TimeSpan.FromSeconds(10);
        private static readonly Regex SsidLine = new Regex(@"^\s*SSID\s*:\s*(.+)$", RegexOptions.Multiline);

        private readonly IPlayniteAPI api;
        private NetworkDto network;
        private DateTime networkReadAt;

        public SystemInfo(IPlayniteAPI api)
        {
            this.api = api;
        }

        public SystemDto Get() => new SystemDto
        {
            Network = Safe(Network),
            ControllerBattery = Safe(ControllerBattery),
            Brightness = Safe(Brightness),
            AudioOutput = Safe(() => AudioOutputs.Current()?.Name),
            Disks = Safe(Disks),
            Media = Safe(MediaSession.Get),
        };

        /// <summary>Une valeur illisible ne doit pas empêcher de lire les autres.</summary>
        private static T Safe<T>(Func<T> read)
        {
            try
            {
                return read();
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: system info failed ({read.Method.Name}): {e.Message}");
                return default(T);
            }
        }

        // ——— Réseau ———

        /// <summary>
        /// Connexion active : câble si une carte Ethernet a une passerelle (Windows la préfère),
        /// sinon Wi-Fi avec son nom (netsh, lu au plus toutes les 10 s). Cartes virtuelles
        /// (Parsec, Hyper-V, VPN) ignorées.
        /// </summary>
        private NetworkDto Network()
        {
            if (network != null && DateTime.Now - networkReadAt < NetworkCacheDuration)
            {
                return network;
            }
            var up = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && !IsVirtual(n) &&
                    n.GetIPProperties().GatewayAddresses.Any(g => !g.Address.Equals(System.Net.IPAddress.Any)))
                .ToList();
            if (up.Any(n => n.NetworkInterfaceType == NetworkInterfaceType.Ethernet || n.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet))
            {
                network = new NetworkDto { Kind = "ethernet", Name = null };
            }
            else if (up.Any(n => n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211))
            {
                network = new NetworkDto { Kind = "wifi", Name = WifiName() };
            }
            else
            {
                network = new NetworkDto { Kind = "none", Name = null };
            }
            networkReadAt = DateTime.Now;
            return network;
        }

        private static bool IsVirtual(NetworkInterface adapter)
        {
            var text = (adapter.Description + " " + adapter.Name).ToLowerInvariant();
            return new[] { "virtual", "hyper-v", "parsec", "vpn", "tap-", "wan miniport", "loopback", "bluetooth", "vethernet" }
                .Any(text.Contains);
        }

        private static string WifiName()
        {
            var info = new ProcessStartInfo("netsh", "wlan show interfaces")
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            };
            using (var process = Process.Start(info))
            {
                var output = process.StandardOutput.ReadToEnd();
                process.WaitForExit(3000);
                var match = SsidLine.Match(output);
                return match.Success ? match.Groups[1].Value.Trim() : null;
            }
        }

        // ——— Manette ———

        /// <summary>
        /// Batterie de la première manette XInput sans fil (0 à 100, par paliers : Windows ne
        /// donne que vide, faible, moyen, plein). Null si aucune manette ou manette filaire.
        /// </summary>
        private static int? ControllerBattery()
        {
            for (uint user = 0; user < 4; user++)
            {
                if (XInputGetBatteryInformation(user, BatteryDevTypeGamepad, out var battery) != 0)
                {
                    continue; // Pas de manette à cet emplacement.
                }
                if (battery.Type == BatteryTypeDisconnected || battery.Type == BatteryTypeWired || battery.Type == BatteryTypeUnknown)
                {
                    continue;
                }
                switch (battery.Level)
                {
                    case 0: return 5;
                    case 1: return 25;
                    case 2: return 60;
                    default: return 100;
                }
            }
            return null;
        }

        private const byte BatteryDevTypeGamepad = 0;
        private const byte BatteryTypeDisconnected = 0;
        private const byte BatteryTypeWired = 1;
        private const byte BatteryTypeUnknown = 0xFF;

        [StructLayout(LayoutKind.Sequential)]
        private struct XInputBattery
        {
            public byte Type;
            public byte Level;
        }

        [DllImport("xinput1_4.dll")]
        private static extern int XInputGetBatteryInformation(uint userIndex, byte devType, out XInputBattery battery);

        // ——— Luminosité ———

        /// <summary>Écran intégré (portable, console portable) par WMI. Null pour une télé ou un écran externe.</summary>
        private static int? Brightness()
        {
            using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active=TRUE"))
            {
                foreach (ManagementObject monitor in searcher.Get())
                {
                    using (monitor)
                    {
                        return Convert.ToInt32(monitor["CurrentBrightness"]);
                    }
                }
            }
            return null;
        }

        public static bool SetBrightness(int level)
        {
            level = Math.Max(0, Math.Min(100, level));
            using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active=TRUE"))
            {
                foreach (ManagementObject monitor in searcher.Get())
                {
                    using (monitor)
                    {
                        monitor.InvokeMethod("WmiSetBrightness", new object[] { 1u, (byte)level });
                        return true;
                    }
                }
            }
            return false;
        }

        // ——— Disques ———

        /// <summary>Disques internes, avec la place prise par les jeux installés dessus (taille connue de Playnite).</summary>
        private List<DiskDto> Disks()
        {
            var gamesByDrive = api.Database.Games
                .Where(g => g.IsInstalled && !string.IsNullOrEmpty(g.InstallDirectory) && g.InstallSize.HasValue)
                .GroupBy(g => SafeRoot(g.InstallDirectory))
                .ToDictionary(g => g.Key, g => g.Sum(x => (long)x.InstallSize.Value), StringComparer.OrdinalIgnoreCase);
            return DriveInfo.GetDrives()
                // Disques virtuels exclus (Google Drive se présente comme un disque FAT32).
                .Where(d => d.DriveType == DriveType.Fixed && d.IsReady && RealFormats.Contains(d.DriveFormat))
                .Select(d => new DiskDto
                {
                    Letter = d.Name.Substring(0, 1),
                    Label = string.IsNullOrEmpty(d.VolumeLabel) ? "Disque local" : d.VolumeLabel,
                    TotalBytes = d.TotalSize,
                    FreeBytes = d.AvailableFreeSpace,
                    GamesBytes = gamesByDrive.TryGetValue(d.Name.Substring(0, 1), out var bytes) ? bytes : 0,
                })
                .ToList();
        }

        private static readonly HashSet<string> RealFormats = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "NTFS", "ReFS", "exFAT" };

        private static string SafeRoot(string directory)
        {
            try
            {
                return Path.GetPathRoot(directory).Substring(0, 1).ToUpperInvariant();
            }
            catch (Exception)
            {
                return "";
            }
        }

        // ——— Alimentation ———

        /// <summary>Veille, arrêt ou redémarrage immédiats. Faux si l'action est inconnue.</summary>
        public static bool Power(string action)
        {
            logger.Info($"Playscreen: power {action}");
            switch (action)
            {
                case "sleep":
                    // Veille (pas l'hibernation), sans désactiver les réveils programmés.
                    SetSuspendState(false, false, false);
                    return true;
                case "shutdown":
                    StartHidden("shutdown", "/s /t 0");
                    return true;
                case "restart":
                    StartHidden("shutdown", "/r /t 0");
                    return true;
                default:
                    return false;
            }
        }

        private static void StartHidden(string file, string arguments) =>
            Process.Start(new ProcessStartInfo(file, arguments) { UseShellExecute = false, CreateNoWindow = true })?.Dispose();

        [DllImport("powrprof.dll", SetLastError = true)]
        private static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);
    }
}
