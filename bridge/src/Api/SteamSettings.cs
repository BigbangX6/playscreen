using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Réglage Steam « Ouvrir l'overlay Big Picture quand un contrôleur est utilisé » (Paramètres →
    /// En jeu) : en jeu, la sur-impression Steam pensée pour la manette (D11). Il est rangé par
    /// compte Steam, dans userdata\&lt;compte&gt;\config\localconfig.vdf, section
    /// UserLocalConfigStore → system → EnableSCTenFootOverlayCheckNew (trouvé le 15 novembre 2026
    /// en comparant le fichier avant et après le clic). Steam réécrit ce fichier en quittant :
    /// on n'y touche que Steam fermé, et seulement cette ligne.
    /// </summary>
    internal static class SteamSettings
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private const string Key = "EnableSCTenFootOverlayCheckNew";

        public static void EnableControllerOverlay()
        {
            try
            {
                if (Process.GetProcessesByName("steam").Length > 0)
                {
                    return;
                }
                var steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string;
                var userdata = steam == null ? null : Path.Combine(steam.Replace('/', '\\'), "userdata");
                if (userdata == null || !Directory.Exists(userdata))
                {
                    return;
                }
                foreach (var account in Directory.GetDirectories(userdata))
                {
                    var file = Path.Combine(account, "config", "localconfig.vdf");
                    if (File.Exists(file))
                    {
                        EnableIn(file);
                    }
                }
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: Steam controller overlay setting not applied: {e.GetType().Name}");
            }
        }

        private static void EnableIn(string file)
        {
            var text = File.ReadAllText(file, Encoding.UTF8);
            // Section « system » de premier niveau (une tabulation), dans UserLocalConfigStore.
            var section = Regex.Match(text, "\\n\\t\"system\"\\r?\\n\\t\\{\\r?\\n(?<body>.*?)\\n\\t\\}", RegexOptions.Singleline);
            if (!section.Success)
            {
                return;
            }
            var body = section.Groups["body"];
            var line = Regex.Match(body.Value, "^\\t\\t\"" + Key + "\"\\t\\t\"(?<value>[^\"]*)\"", RegexOptions.Multiline);
            string updated;
            if (line.Success)
            {
                if (line.Groups["value"].Value == "1")
                {
                    return;
                }
                var at = body.Index + line.Groups["value"].Index;
                updated = text.Substring(0, at) + "1" + text.Substring(at + line.Groups["value"].Length);
            }
            else
            {
                var newline = text.Contains("\r\n") ? "\r\n" : "\n";
                updated = text.Substring(0, body.Index) + "\t\t\"" + Key + "\"\t\t\"1\"" + newline + text.Substring(body.Index);
            }
            File.Copy(file, file + ".playscreen.bak", true);
            File.WriteAllText(file, updated, new UTF8Encoding(false));
            logger.Info("Playscreen: Steam controller overlay enabled for a Steam account");
        }
    }
}
