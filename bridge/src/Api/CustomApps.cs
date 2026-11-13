using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Reflection;
using Playnite.SDK;
using Playnite.SDK.Data;
using Playnite.SDK.Models;

namespace Playscreen.Bridge.Api
{
    public class AppCandidateDto
    {
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("path")] public string Path { get; set; }
        [SerializationPropertyName("arguments")] public string Arguments { get; set; }
        /// <summary>Déjà dans la bibliothèque (même exécutable).</summary>
        [SerializationPropertyName("added")] public bool Added { get; set; }
        /// <summary>Où on l'a trouvé : startmenu ou desktop.</summary>
        [SerializationPropertyName("source")] public string Source { get; set; }
    }

    /// <summary>
    /// Applications et jeux hors launcher (store « other ») : un exécutable ajouté à la
    /// bibliothèque, lancé et suivi par Playnite (GameWindows pour sa fenêtre). La liste des
    /// candidats vient des raccourcis du menu Démarrer : à la manette, on choisit dans une liste
    /// plutôt que de taper un chemin. Voir docs/hors-launcher.md.
    /// </summary>
    internal static class CustomApps
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        private static readonly string WindowsFolder = Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\\";

        /// <summary>Raccourcis qui ne sont pas des applications à lancer.</summary>
        private static readonly string[] Excluded = { "uninstall", "désinstall", "desinstall", "readme", "lisez", "help", "aide", "website", "site web", "manual", "manuel" };

        /// <summary>Launchers déjà gérés par Playscreen (et Playscreen lui-même) : pas des jeux à ajouter.</summary>
        private static readonly string[] ExcludedExes = { "steam.exe", "epicgameslauncher.exe", "battle.net launcher.exe", "battle.net.exe", "xboxpcapp.exe", "playnite.desktopapp.exe", "playnite.fullscreenapp.exe", "playscreen.exe" };

        /// <summary>Exécutables (ou adresses) des applications déjà ajoutées.</summary>
        public static HashSet<string> KnownPaths(IPlayniteAPI api) => new HashSet<string>(
            api.Database.Games.Where(g => g.PluginId == Guid.Empty)
                .SelectMany(g => g.GameActions ?? new ObservableCollection<GameAction>())
                .Where(a => (a.Type == GameActionType.File || a.Type == GameActionType.URL) && !string.IsNullOrEmpty(a.Path))
                .Select(a => a.Path),
            StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Raccourcis .lnk vers un .exe du Bureau et du menu Démarrer (tous les utilisateurs et le
        /// sien), par nom. Le Bureau compte : un jeu installé à la main y laisse souvent son raccourci.
        /// </summary>
        public static List<AppCandidateDto> Candidates(IPlayniteAPI api)
        {
            var known = KnownPaths(api);
            // (dossier, source, sous-dossiers compris)
            var folders = new[]
            {
                Tuple.Create(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "desktop", false),
                Tuple.Create(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), "desktop", false),
                Tuple.Create(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "startmenu", true),
                Tuple.Create(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "startmenu", true),
            };
            var result = new Dictionary<string, AppCandidateDto>(StringComparer.OrdinalIgnoreCase);
            var files = folders.Where(f => !string.IsNullOrEmpty(f.Item1) && Directory.Exists(f.Item1))
                .SelectMany(f => (f.Item3 ? SafeFiles(f.Item1, "*.lnk") : Directory.GetFiles(f.Item1, "*.lnk")).Select(file => Tuple.Create(file, f.Item2)));
            foreach (var entry in files)
            {
                var file = entry.Item1;
                var name = Path.GetFileNameWithoutExtension(file);
                if (Excluded.Any(e => name.IndexOf(e, StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    continue;
                }
                try
                {
                    ReadShortcut(file, out var target, out var arguments);
                    // Outils de Windows (invite de commandes, éditeur du registre…) : pas des jeux.
                    if (string.IsNullOrEmpty(target) || !target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(target)
                        || target.StartsWith(WindowsFolder, StringComparison.OrdinalIgnoreCase)
                        || ExcludedExes.Contains(Path.GetFileName(target).ToLowerInvariant()))
                    {
                        continue;
                    }
                    var key = target + "|" + arguments;
                    if (!result.ContainsKey(key))
                    {
                        result[key] = new AppCandidateDto { Name = name, Path = target, Arguments = arguments ?? "", Added = known.Contains(target), Source = entry.Item2 };
                    }
                }
                catch (Exception e)
                {
                    logger.Warn($"Playscreen: cannot read shortcut {file}: {e.Message}");
                }
            }
            // Bureau d'abord (souvent les jeux installés à la main), puis menu Démarrer.
            return result.Values.OrderBy(a => a.Source == "desktop" ? 0 : 1).ThenBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        }

        /// <summary>Cible et arguments d'un raccourci .lnk (WScript.Shell).</summary>
        public static void ReadShortcut(string file, out string target, out string arguments)
        {
            var shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            var link = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { file });
            target = link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null) as string;
            arguments = link.GetType().InvokeMember("Arguments", BindingFlags.GetProperty, null, link, null) as string;
        }

        /// <summary>Adresse d'un raccourci Internet .url (ligne « URL= »), sinon null.</summary>
        public static string ReadUrl(string file)
        {
            try
            {
                return File.ReadAllLines(file).Select(l => l.Trim())
                    .Where(l => l.StartsWith("URL=", StringComparison.OrdinalIgnoreCase))
                    .Select(l => l.Substring(4)).FirstOrDefault();
            }
            catch (IOException)
            {
                return null;
            }
        }

        /// <summary>Ce que lance un fichier : la cible d'un raccourci, sinon le fichier lui-même.</summary>
        public static string ResolveTarget(string path)
        {
            try
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                if (ext == ".lnk")
                {
                    ReadShortcut(path, out var target, out _);
                    return string.IsNullOrEmpty(target) ? path : target;
                }
                if (ext == ".url")
                {
                    return ReadUrl(path) ?? path;
                }
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: cannot read shortcut {path}: {e.Message}");
            }
            return path;
        }

        /// <summary>Fichiers du dossier et de ses sous-dossiers, en sautant ceux qu'on ne peut pas lire.</summary>
        private static IEnumerable<string> SafeFiles(string folder, string pattern)
        {
            var pending = new Stack<string>();
            pending.Push(folder);
            while (pending.Count > 0)
            {
                var current = pending.Pop();
                string[] files, folders;
                try
                {
                    files = Directory.GetFiles(current, pattern);
                    folders = Directory.GetDirectories(current);
                }
                catch (Exception e) when (e is UnauthorizedAccessException || e is IOException)
                {
                    continue;
                }
                foreach (var file in files)
                {
                    yield return file;
                }
                foreach (var sub in folders)
                {
                    pending.Push(sub);
                }
            }
        }

        /// <summary>
        /// Ajoute à la bibliothèque (installé, avec son icône) un .exe, un script, un raccourci
        /// .lnk (sa cible et ses arguments) ou un raccourci Internet .url (son adresse). Null si
        /// le fichier ne mène à rien de lançable. Doit tourner sur le fil de Playnite.
        /// </summary>
        public static Game Add(IPlayniteAPI api, string name, string path, string arguments)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            var displayName = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(path) : name.Trim();
            var iconSource = path;
            GameAction action;
            if (ext == ".url")
            {
                var url = ReadUrl(path);
                if (string.IsNullOrEmpty(url))
                {
                    return null;
                }
                action = new GameAction { Name = "Lancer", Type = GameActionType.URL, Path = url, IsPlayAction = true };
                iconSource = null;
            }
            else
            {
                if (ext == ".lnk")
                {
                    ReadShortcut(path, out var target, out var linkArguments);
                    if (string.IsNullOrEmpty(target) || !File.Exists(target))
                    {
                        return null;
                    }
                    path = target;
                    iconSource = target;
                    if (string.IsNullOrWhiteSpace(arguments))
                    {
                        arguments = linkArguments;
                    }
                }
                action = new GameAction
                {
                    Name = "Lancer",
                    Type = GameActionType.File,
                    Path = path,
                    Arguments = string.IsNullOrWhiteSpace(arguments) ? null : arguments,
                    WorkingDir = Path.GetDirectoryName(path),
                    IsPlayAction = true,
                };
            }
            // Plateforme « PC (Windows) », comme les jeux des stores : sans elle, la recherche de
            // jaquette d'IGDB échoue (ArgumentNullException dans IgdbLazyMetadataProvider).
            var platform = api.Database.Platforms.FirstOrDefault(p => p.SpecificationId == "pc_windows");
            if (platform == null)
            {
                platform = new Platform("PC (Windows)") { SpecificationId = "pc_windows" };
                api.Database.Platforms.Add(platform);
            }
            var game = new Game(displayName)
            {
                PlatformIds = new List<Guid> { platform.Id },
                IsInstalled = true,
                InstallDirectory = action.Type == GameActionType.File ? Path.GetDirectoryName(path) : null,
                Added = DateTime.Now,
                GameActions = new ObservableCollection<GameAction> { action },
            };
            api.Database.Games.Add(game);
            try
            {
                if (iconSource == null)
                {
                    throw new IOException("internet shortcut, no icon");
                }
                // Icône de l'exécutable, enregistrée dans les fichiers du jeu.
                var png = Path.Combine(Path.GetTempPath(), $"playscreen-{game.Id}.png");
                using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(iconSource))
                using (var bitmap = icon.ToBitmap())
                {
                    bitmap.Save(png, System.Drawing.Imaging.ImageFormat.Png);
                }
                game.Icon = api.Database.AddFile(png, game.Id);
                File.Delete(png);
                api.Database.Games.Update(game);
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: no icon for {path}: {e.Message}");
            }
            logger.Info($"Playscreen: custom app added: {game.Name} ({path})");
            return game;
        }
    }
}
