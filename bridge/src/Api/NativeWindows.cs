using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Playscreen.Bridge.Api
{
    /// <summary>Fenêtres Windows natives de Playnite (hors WPF), via l'API Win32.</summary>
    internal static class NativeWindows
    {
        private const int GWL_STYLE = -16;
        // Barre de titre : exclut les infobulles, menus et autres petites fenêtres sans cadre.
        private const long WS_CAPTION = 0x00C00000;
        private const int SW_MAXIMIZE = 3;

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
        private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);

        [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
        private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int command);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        /// <summary>Fenêtres visibles avec barre de titre appartenant à Playnite.</summary>
        public static List<IntPtr> TitledWindowsOfThisProcess()
        {
            var processId = (uint)Process.GetCurrentProcess().Id;
            var result = new List<IntPtr>();
            EnumWindows((hWnd, _) =>
            {
                GetWindowThreadProcessId(hWnd, out var owner);
                if (owner == processId && IsWindowVisible(hWnd) && (GetStyle(hWnd) & WS_CAPTION) == WS_CAPTION)
                {
                    result.Add(hWnd);
                }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        public static void MaximizeAndFocus(IntPtr hWnd)
        {
            ShowWindow(hWnd, SW_MAXIMIZE);
            SetForegroundWindow(hWnd);
        }

        private static long GetStyle(IntPtr hWnd) =>
            (IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, GWL_STYLE) : GetWindowLong32(hWnd, GWL_STYLE)).ToInt64();
    }
}
