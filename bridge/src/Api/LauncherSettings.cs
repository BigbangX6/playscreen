using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    public class LauncherSettingDto
    {
        [SerializationPropertyName("id")] public string Id { get; set; }
        [SerializationPropertyName("store")] public string Store { get; set; }
        [SerializationPropertyName("label")] public string Label { get; set; }
        /// <summary>Valeur actuelle telle qu'écrite par le launcher, ou null si absente.</summary>
        [SerializationPropertyName("value")] public string Value { get; set; }
        [SerializationPropertyName("recommended")] public string Recommended { get; set; }
        [SerializationPropertyName("applied")] public bool Applied { get; set; }
        /// <summary>Le launcher tourne : il réécrirait le fichier en quittant, on ne peut pas régler.</summary>
        [SerializationPropertyName("launcherRunning")] public bool LauncherRunning { get; set; }
    }

    /// <summary>
    /// Réglages des launchers qui leur font rendre la main à Playscreen (docs/launchers.md) :
    /// lus dans leurs fichiers, et réglés sur la valeur recommandée, launcher fermé (sinon il
    /// réécrit son fichier en quittant). Seule la ligne du réglage est modifiée : ces fichiers
    /// contiennent aussi des données de connexion, jamais lues ni copiées ici.
    /// </summary>
    internal static class LauncherSettings
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        private abstract class Setting
        {
            public string Id;
            public string Store;
            public string Label;
            public string Recommended;
            public string[] Processes;
            public abstract string Read();
            public abstract bool Write(string value);
        }

        /// <summary>Clé d'une section de premier niveau de localconfig.vdf (Steam).</summary>
        private class SteamVdfSetting : Setting
        {
            public string Section;
            public string Key;

            private static string FilePath()
            {
                using (var steam = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
                using (var active = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam\ActiveProcess"))
                {
                    var root = steam?.GetValue("SteamPath") as string;
                    var user = active?.GetValue("ActiveUser") as int?;
                    if (string.IsNullOrEmpty(root) || !(user > 0))
                    {
                        // Steam fermé : ActiveUser repasse à 0. On prend le compte utilisé en dernier
                        // (son localconfig.vdf, réécrit par Steam en quittant, est le plus récent).
                        var userdata = root == null ? null : Path.Combine(root, "userdata");
                        if (userdata == null || !Directory.Exists(userdata))
                        {
                            return null;
                        }
                        return Directory.GetDirectories(userdata)
                            .Select(d => Path.Combine(d, "config", "localconfig.vdf"))
                            .Where(File.Exists)
                            .OrderByDescending(File.GetLastWriteTimeUtc)
                            .FirstOrDefault();
                    }
                    return Path.Combine(root, "userdata", user.ToString(), "config", "localconfig.vdf");
                }
            }

            private Regex Line => new Regex("^(\\t\\t\"" + Regex.Escape(Key) + "\"\\t\\t\")([^\"]*)(\")\\r?$", RegexOptions.Multiline);

            public override string Read()
            {
                var path = FilePath();
                if (path == null || !File.Exists(path))
                {
                    return null;
                }
                var match = Line.Match(File.ReadAllText(path));
                return match.Success ? match.Groups[2].Value : null;
            }

            public override bool Write(string value)
            {
                var path = FilePath();
                if (path == null || !File.Exists(path))
                {
                    return false;
                }
                var text = File.ReadAllText(path);
                var line = Line;
                if (line.IsMatch(text))
                {
                    text = line.Replace(text, m => m.Groups[1].Value + value + m.Groups[3].Value, 1);
                }
                else
                {
                    // Clé absente : ajoutée en tête de sa section (« \t"system"\n\t{ »).
                    var section = new Regex("^(\\t\"" + Regex.Escape(Section) + "\"\\r?\\n\\t\\{\\r?\\n)", RegexOptions.Multiline);
                    if (!section.IsMatch(text))
                    {
                        return false;
                    }
                    text = section.Replace(text, m => m.Groups[1].Value + "\t\t\"" + Key + "\"\t\t\"" + value + "\"\n", 1);
                }
                File.WriteAllText(path, text);
                return true;
            }
        }

        /// <summary>Clé de la section « Client » de Battle.net.config (JSON en clair).</summary>
        private class BattleNetSetting : Setting
        {
            public string Key;

            private static string FilePath() => Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Battle.net", "Battle.net.config");

            private Regex Line => new Regex("(\"" + Regex.Escape(Key) + "\"\\s*:\\s*\")([^\"]*)(\")");

            public override string Read()
            {
                var path = FilePath();
                if (!File.Exists(path))
                {
                    return null;
                }
                var match = Line.Match(File.ReadAllText(path));
                return match.Success ? match.Groups[2].Value : null;
            }

            public override bool Write(string value)
            {
                var path = FilePath();
                if (!File.Exists(path))
                {
                    return false;
                }
                var text = File.ReadAllText(path);
                if (Line.IsMatch(text))
                {
                    text = Line.Replace(text, m => m.Groups[1].Value + value + m.Groups[3].Value, 1);
                }
                else
                {
                    var client = new Regex("(\"Client\"\\s*:\\s*\\{)");
                    if (!client.IsMatch(text))
                    {
                        return false;
                    }
                    text = client.Replace(text, m => m.Groups[1].Value + "\n    \"" + Key + "\": \"" + value + "\",", 1);
                }
                File.WriteAllText(path, text);
                return true;
            }
        }

        private static readonly Setting[] All =
        {
            new SteamVdfSetting
            {
                Id = "steam.bigPictureOverlay", Store = "steam",
                Label = "Overlay Big Picture quand un contrôleur est utilisé (menu manette de Steam en jeu)",
                Section = "system", Key = "EnableSCTenFootOverlayCheckNew", Recommended = "1",
                Processes = new[] { "steam" },
            },
            new SteamVdfSetting
            {
                Id = "steam.newsPopups", Store = "steam",
                Label = "Fenêtre « nouveautés de mes jeux » au démarrage de Steam",
                Section = "News", Key = "NotifyAvailableGames", Recommended = "0",
                Processes = new[] { "steam" },
            },
            new BattleNetSetting
            {
                Id = "battlenet.gameLaunch", Store = "battlenet",
                Label = "Au lancement d'un jeu : réduire Battle.net dans la zone de notification",
                Key = "GameLaunchWindowBehavior", Recommended = "3",
                Processes = new[] { "Battle.net" },
            },
            new BattleNetSetting
            {
                Id = "battlenet.startMinimized", Store = "battlenet",
                Label = "Démarrer Battle.net réduit",
                Key = "AutoStartMinimized", Recommended = "true",
                Processes = new[] { "Battle.net" },
            },
        };

        private static bool IsRunning(Setting setting) =>
            setting.Processes.Any(name =>
            {
                var processes = Process.GetProcessesByName(name);
                foreach (var process in processes)
                {
                    process.Dispose();
                }
                return processes.Length > 0;
            });

        private static LauncherSettingDto Describe(Setting setting)
        {
            string value = null;
            try
            {
                value = setting.Read();
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: cannot read {setting.Id}: {e.Message}");
            }
            return new LauncherSettingDto
            {
                Id = setting.Id,
                Store = setting.Store,
                Label = setting.Label,
                Value = value,
                Recommended = setting.Recommended,
                Applied = value == setting.Recommended,
                LauncherRunning = IsRunning(setting),
            };
        }

        public static List<LauncherSettingDto> List() => All.Select(Describe).ToList();

        /// <summary>
        /// Règle sur la valeur recommandée. « running » si le launcher tourne (il faut le
        /// fermer d'abord), « unknown » si le réglage n'existe pas, null si c'est fait.
        /// </summary>
        public static string Apply(string id)
        {
            var setting = All.FirstOrDefault(s => s.Id == id);
            if (setting == null)
            {
                return "unknown";
            }
            if (IsRunning(setting))
            {
                return "running";
            }
            if (!setting.Write(setting.Recommended))
            {
                return "not found";
            }
            logger.Info($"Playscreen: {id} set to {setting.Recommended}");
            return null;
        }
    }
}
