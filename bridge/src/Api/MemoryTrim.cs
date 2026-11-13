using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime;
using System.Runtime.InteropServices;
using System.Threading;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Pendant une partie, Playscreen rend sa mémoire au jeu : 20 s après le démarrage puis
    /// toutes les 5 minutes, le moteur (Playnite, son navigateur intégré) et l'interface
    /// (Playscreen.exe et son moteur web WebView2) vident leur « ensemble de travail ». Les
    /// pages inutilisées repartent à Windows ; celles qui resservent reviennent toutes seules.
    /// Mesuré le 13 novembre 2026 : environ 890 Mo en mémoire avant, 230 Mo 30 s après.
    /// </summary>
    internal class MemoryTrim
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan FirstDelay = TimeSpan.FromSeconds(20);
        private static readonly TimeSpan Every = TimeSpan.FromMinutes(5);

        private readonly object gate = new object();
        private Timer timer;

        public void GameStarted()
        {
            lock (gate)
            {
                timer?.Dispose();
                timer = new Timer(_ => Trim(), null, FirstDelay, Every);
            }
        }

        public void GameStopped()
        {
            lock (gate)
            {
                timer?.Dispose();
                timer = null;
            }
        }

        private static void Trim()
        {
            try
            {
                // Mémoire .NET de Playnite d'abord : compactée, elle peut vraiment être rendue.
                GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
                GC.Collect(2, GCCollectionMode.Forced, true, true);
                var count = 0;
                foreach (var pid in Targets())
                {
                    var handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
                    if (handle == IntPtr.Zero)
                    {
                        continue;
                    }
                    if (SetProcessWorkingSetSize(handle, new IntPtr(-1), new IntPtr(-1)))
                    {
                        count++;
                    }
                    CloseHandle(handle);
                }
                logger.Info($"Playscreen: memory trimmed in {count} process(es) during the game");
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: memory trim failed: {e.Message}");
            }
        }

        /// <summary>Playnite et ses sous-processus, Playscreen.exe et les siens (WebView2).</summary>
        private static IEnumerable<int> Targets()
        {
            var own = Process.GetCurrentProcess().Id;
            var parents = new Dictionary<int, int>();
            var names = new Dictionary<int, string>();
            var snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snapshot == new IntPtr(-1))
            {
                yield break;
            }
            try
            {
                var entry = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32)) };
                for (var ok = Process32First(snapshot, ref entry); ok; ok = Process32Next(snapshot, ref entry))
                {
                    parents[(int)entry.th32ProcessID] = (int)entry.th32ParentProcessID;
                    names[(int)entry.th32ProcessID] = entry.szExeFile ?? "";
                }
            }
            finally
            {
                CloseHandle(snapshot);
            }
            var roots = new HashSet<int> { own };
            foreach (var pair in names)
            {
                if (pair.Value.Equals("Playscreen.exe", StringComparison.OrdinalIgnoreCase))
                {
                    roots.Add(pair.Key);
                }
            }
            foreach (var pid in names.Keys)
            {
                // Le processus lui-même ou un descendant d'une racine (6 générations au plus).
                var current = pid;
                for (var depth = 0; depth < 7; depth++)
                {
                    if (roots.Contains(current))
                    {
                        yield return pid;
                        break;
                    }
                    if (!parents.TryGetValue(current, out current) || current == 0)
                    {
                        break;
                    }
                }
            }
        }

        private const uint TH32CS_SNAPPROCESS = 0x2;
        private const uint PROCESS_SET_QUOTA = 0x0100;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PROCESSENTRY32
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW")]
        private static extern bool Process32First(IntPtr snapshot, ref PROCESSENTRY32 entry);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32NextW")]
        private static extern bool Process32Next(IntPtr snapshot, ref PROCESSENTRY32 entry);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr minimum, IntPtr maximum);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);
    }
}
