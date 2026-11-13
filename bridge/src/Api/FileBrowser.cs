using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace Playscreen.Bridge.Api
{
    public class FileEntryDto
    {
        [SerializationPropertyName("name")] public string Name { get; set; }
        [SerializationPropertyName("path")] public string Path { get; set; }
        /// <summary>place (raccourci de la racine), drive, folder ou file.</summary>
        [SerializationPropertyName("kind")] public string Kind { get; set; }
        /// <summary>Précision affichée en petit : taille, place libre, cible d'un raccourci.</summary>
        [SerializationPropertyName("detail")] public string Detail { get; set; }
        /// <summary>Fichier déjà dans la bibliothèque.</summary>
        [SerializationPropertyName("added")] public bool Added { get; set; }
    }

    public class FileListingDto
    {
        /// <summary>null pour la racine (lieux et disques).</summary>
        [SerializationPropertyName("path")] public string Path { get; set; }
        /// <summary>Dossier parent ; null à la racine et pour un disque (B ramène à la racine).</summary>
        [SerializationPropertyName("parent")] public string Parent { get; set; }
        [SerializationPropertyName("entries")] public List<FileEntryDto> Entries { get; set; }
    }

    /// <summary>
    /// Explorateur de fichiers pour choisir un jeu hors launcher à la manette : dossiers, puis
    /// seulement les fichiers qu'on peut lancer. Lecture seule ; l'API exige le jeton comme
    /// partout (une page web ne peut pas lister les dossiers).
    /// </summary>
    internal static class FileBrowser
    {
        public static readonly string[] Launchable = { ".exe", ".lnk", ".url", ".bat", ".cmd" };

        public static bool IsLaunchable(string path) =>
            Launchable.Contains(System.IO.Path.GetExtension(path ?? "").ToLowerInvariant());

        public static FileListingDto List(IPlayniteAPI api, string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return new FileListingDto { Path = null, Parent = null, Entries = Root() };
            }
            var full = System.IO.Path.GetFullPath(path);
            if (!Directory.Exists(full))
            {
                return null;
            }
            var known = CustomApps.KnownPaths(api);
            var entries = new List<FileEntryDto>();
            try
            {
                var dir = new DirectoryInfo(full);
                foreach (var sub in dir.GetDirectories().Where(Visible).OrderBy(d => d.Name, StringComparer.CurrentCultureIgnoreCase))
                {
                    entries.Add(new FileEntryDto { Name = sub.Name, Path = sub.FullName, Kind = "folder" });
                }
                foreach (var file in dir.GetFiles().Where(f => Visible(f) && IsLaunchable(f.Name)).OrderBy(f => f.Name, StringComparer.CurrentCultureIgnoreCase))
                {
                    entries.Add(new FileEntryDto
                    {
                        Name = file.Name,
                        Path = file.FullName,
                        Kind = "file",
                        Detail = Detail(file),
                        Added = known.Contains(file.FullName) || known.Contains(CustomApps.ResolveTarget(file.FullName)),
                    });
                }
            }
            catch (Exception e) when (e is UnauthorizedAccessException || e is IOException)
            {
                // Dossier protégé : liste vide plutôt qu'une erreur (B pour remonter).
            }
            var parent = Directory.GetParent(full);
            return new FileListingDto { Path = full, Parent = parent?.FullName, Entries = entries };
        }

        /// <summary>Lieux utiles (Bureau, Téléchargements, dossiers de jeux courants), puis les disques.</summary>
        private static List<FileEntryDto> Root()
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var places = new List<Tuple<string, string>>
            {
                Tuple.Create("Bureau", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)),
                Tuple.Create("Téléchargements", System.IO.Path.Combine(home, "Downloads")),
                Tuple.Create("Documents", Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)),
                Tuple.Create("Jeux itch.io", System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "itch", "apps")),
                Tuple.Create("Jeux", System.IO.Path.Combine(home, "Games")),
            };
            var entries = places.Where(p => Directory.Exists(p.Item2))
                .Select(p => new FileEntryDto { Name = p.Item1, Path = p.Item2, Kind = "place" })
                .ToList();
            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (!drive.IsReady || (drive.DriveType != DriveType.Fixed && drive.DriveType != DriveType.Removable))
                    {
                        continue;
                    }
                    // Dossiers de jeux à la racine des disques (C:\Games, D:\Jeux, GOG Games…).
                    foreach (var name in new[] { "Games", "Jeux", "GOG Games" })
                    {
                        var folder = System.IO.Path.Combine(drive.RootDirectory.FullName, name);
                        if (Directory.Exists(folder))
                        {
                            entries.Add(new FileEntryDto { Name = $"{name} ({drive.Name.TrimEnd('\\')})", Path = folder, Kind = "place" });
                        }
                    }
                    var label = string.IsNullOrWhiteSpace(drive.VolumeLabel) ? "Disque" : drive.VolumeLabel;
                    entries.Add(new FileEntryDto
                    {
                        Name = $"{label} ({drive.Name.TrimEnd('\\')})",
                        Path = drive.RootDirectory.FullName,
                        Kind = "drive",
                        Detail = $"{Size(drive.AvailableFreeSpace)} libres",
                    });
                }
                catch (IOException)
                {
                    // Lecteur qui disparaît pendant la lecture (clé USB retirée).
                }
            }
            return entries;
        }

        /// <summary>Sans les éléments cachés ou système, ni « $Recycle.Bin » et compagnie.</summary>
        private static bool Visible(FileSystemInfo info) =>
            (info.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0 && !info.Name.StartsWith("$");

        private static string Detail(FileInfo file)
        {
            var ext = file.Extension.ToLowerInvariant();
            if (ext == ".lnk" || ext == ".url")
            {
                var target = CustomApps.ResolveTarget(file.FullName);
                return target == file.FullName ? "Raccourci" : "Raccourci vers " + target;
            }
            return ext == ".exe" ? Size(file.Length) : "Script";
        }

        private static string Size(long bytes)
        {
            if (bytes >= 1L << 30) return (bytes / (double)(1L << 30)).ToString("0.#") + " Go";
            if (bytes >= 1L << 20) return (bytes / (double)(1L << 20)).ToString("0.#") + " Mo";
            return Math.Max(1, bytes / 1024) + " Ko";
        }
    }
}
