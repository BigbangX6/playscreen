using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Octets écrits sur le disque par un programme depuis la création de ce compteur
    /// (compteurs d'entrées-sorties de Windows). Sert à estimer une progression quand le
    /// launcher n'en publie pas.
    /// </summary>
    internal class ProcessWrites
    {
        private readonly string processName;
        // Valeur de départ par processus ; un processus apparu ensuite part de zéro.
        private readonly Dictionary<int, ulong> baselines = new Dictionary<int, ulong>();

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetProcessIoCounters(IntPtr process, out IoCounters counters);

        public ProcessWrites(string processName)
        {
            this.processName = processName;
            foreach (var entry in Read())
            {
                baselines[entry.Key] = entry.Value;
            }
        }

        public long Since()
        {
            ulong total = 0;
            foreach (var entry in Read())
            {
                baselines.TryGetValue(entry.Key, out var baseline);
                total += entry.Value - baseline;
            }
            return (long)total;
        }

        private IEnumerable<KeyValuePair<int, ulong>> Read()
        {
            var result = new List<KeyValuePair<int, ulong>>();
            foreach (var process in Process.GetProcessesByName(processName))
            {
                using (process)
                {
                    try
                    {
                        if (GetProcessIoCounters(process.Handle, out var counters))
                        {
                            result.Add(new KeyValuePair<int, ulong>(process.Id, counters.WriteTransferCount));
                        }
                    }
                    catch (Exception e) when (e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
                    {
                        // Processus terminé ou inaccessible pendant la mesure.
                    }
                }
            }
            return result;
        }
    }
}
