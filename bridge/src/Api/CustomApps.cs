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

        /// <summary>Raccourcis .lnk vers un .exe du menu Démarrer (tous les utilisateurs et le sien), par nom.</summary>
        public static List<AppCandidateDto> Candidates(IPlayniteAPI api)
        {
            var known = new HashSet<string>(
                api.Database.Games.Where(g => g.PluginId == Guid.Empty)
                    .SelectMany(g => g.GameActions ?? new ObservableCollection<GameAction>())
                    .Where(a => a.Type == GameActionType.File && !string.IsNullOrEmpty(a.Path))
                    .Select(a => a.Path),
                StringComparer.OrdinalIgnoreCase);
            var folders = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
                Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
            };
            var shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            var result = new Dictionary<string, AppCandidateDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var file in folders.Where(Directory.Exists).SelectMany(f => SafeFiles(f, "*.lnk")))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                if (Excluded.Any(e => name.IndexOf(e, StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    continue;
                }
                try
                {
                    var link = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { file });
                    var target = link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null) as string;
                    var arguments = link.GetType().InvokeMember("Arguments", BindingFlags.GetProperty, null, link, null) as string;
                    // Outils de Windows (invite de commandes, éditeur du registre…) : pas des jeux.
                    if (string.IsNullOrEmpty(target) || !target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(target)
                        || target.StartsWith(WindowsFolder, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    var key = target + "|" + arguments;
                    if (!result.ContainsKey(key))
                    {
                        result[key] = new AppCandidateDto { Name = name, Path = target, Arguments = arguments ?? "", Added = known.Contains(target) };
                    }
                }
                catch (Exception e)
                {
                    logger.Warn($"Playscreen: cannot read shortcut {file}: {e.Message}");
                }
            }
            return result.Values.OrderBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
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

        /// <summary>Ajoute l'exécutable à la bibliothèque (installé, avec son icône). Doit tourner sur le fil de Playnite.</summary>
        public static Game Add(IPlayniteAPI api, string name, string path, string arguments)
        {
            var game = new Game(string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(path) : name.Trim())
            {
                IsInstalled = true,
                InstallDirectory = Path.GetDirectoryName(path),
                Added = DateTime.Now,
                GameActions = new ObservableCollection<GameAction>
                {
                    new GameAction
                    {
                        Name = "Lancer",
                        Type = GameActionType.File,
                        Path = path,
                        Arguments = string.IsNullOrWhiteSpace(arguments) ? null : arguments,
                        WorkingDir = Path.GetDirectoryName(path),
                        IsPlayAction = true,
                    },
                },
            };
            api.Database.Games.Add(game);
            try
            {
                // Icône de l'exécutable, enregistrée dans les fichiers du jeu.
                var png = Path.Combine(Path.GetTempPath(), $"playscreen-{game.Id}.png");
                using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(path))
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
