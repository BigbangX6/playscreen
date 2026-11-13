using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Playnite.SDK;

namespace Playscreen.Bridge.Api
{
    /// <summary>
    /// Reconnexion de Steam sans identifiants (accord de la personne, 13 novembre 2026) : le
    /// programme Steam de ce PC garde sa session web dans son navigateur intégré
    /// (%LOCALAPPDATA%\Steam\htmlcache, cookie steamLoginSecure valable ~24 h après la dernière
    /// ouverture de Steam). Quand l'extension Steam de Playnite n'est plus connectée, on recopie
    /// ces cookies dans le navigateur intégré de Playnite. Tout reste sur le PC : rien n'est
    /// journalisé ni écrit ailleurs. Le fichier est verrouillé tant que Steam tourne : l'import
    /// se fait quand Steam est fermé (au démarrage de Playscreen, en général).
    /// </summary>
    internal static class SteamSession
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly string[] Hosts = { "store.steampowered.com", "steamcommunity.com", "help.steampowered.com", "checkout.steampowered.com", "login.steampowered.com" };

        /// <summary>Vrai si des cookies de session ont été recopiés.</summary>
        public static bool TryImport(IPlayniteAPI api)
        {
            var cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Steam", "htmlcache");
            var database = Path.Combine(cache, "Default", "Network", "Cookies");
            var localState = Path.Combine(cache, "Local State");
            if (!File.Exists(database) || !File.Exists(localState))
            {
                return false;
            }
            var copy = Path.Combine(Path.GetTempPath(), $"playscreen-steam-{Guid.NewGuid():N}.db");
            try
            {
                var key = MasterKey(localState);
                if (key == null)
                {
                    return false;
                }
                try
                {
                    File.Copy(database, copy);
                }
                catch (IOException)
                {
                    logger.Info("Playscreen: Steam session not imported (Steam is running, cookies locked)");
                    return false;
                }
                var cookies = ReadCookies(copy, key);
                if (!cookies.Any(c => c.Name == "steamLoginSecure"))
                {
                    logger.Info("Playscreen: no Steam session found in the Steam client");
                    return false;
                }
                api.MainView.UIDispatcher.Invoke(() =>
                {
                    using (var view = api.WebViews.CreateOffscreenView())
                    {
                        foreach (var cookie in cookies)
                        {
                            view.SetCookies("https://" + cookie.Domain.TrimStart('.'), cookie);
                        }
                    }
                });
                logger.Info($"Playscreen: Steam session imported from the Steam client ({cookies.Count} cookies)");
                return true;
            }
            catch (Exception e)
            {
                logger.Warn($"Playscreen: Steam session import failed: {e.GetType().Name}");
                return false;
            }
            finally
            {
                try { File.Delete(copy); } catch (IOException) { }
            }
        }

        /// <summary>Clé AES du navigateur de Steam, protégée par Windows pour cet utilisateur (DPAPI).</summary>
        private static byte[] MasterKey(string localState)
        {
            var text = File.ReadAllText(localState);
            var match = System.Text.RegularExpressions.Regex.Match(text, "\"encrypted_key\"\\s*:\\s*\"([^\"]+)\"");
            if (!match.Success)
            {
                return null;
            }
            var protectedKey = Convert.FromBase64String(match.Groups[1].Value);
            // Préfixe « DPAPI » (5 octets).
            return ProtectedData.Unprotect(protectedKey.Skip(5).ToArray(), null, DataProtectionScope.CurrentUser);
        }

        private static List<HttpCookie> ReadCookies(string databasePath, byte[] key)
        {
            var result = new List<HttpCookie>();
            if (sqlite3_open_v2(Encoding.UTF8.GetBytes(databasePath + "\0"), out var db, SQLITE_OPEN_READONLY, IntPtr.Zero) != 0)
            {
                return result;
            }
            try
            {
                var sql = "select host_key, name, path, expires_utc, is_secure, is_httponly, encrypted_value from cookies where host_key in ("
                    + string.Join(",", Hosts.Select(h => $"'{h}','.{h}'")) + ")";
                if (sqlite3_prepare_v2(db, Encoding.UTF8.GetBytes(sql + "\0"), -1, out var statement, IntPtr.Zero) != 0)
                {
                    return result;
                }
                try
                {
                    while (sqlite3_step(statement) == SQLITE_ROW)
                    {
                        var host = Text(statement, 0);
                        var encrypted = Blob(statement, 6);
                        var value = Decrypt(encrypted, key, host);
                        if (value == null)
                        {
                            continue;
                        }
                        var expires = sqlite3_column_int64(statement, 3);
                        result.Add(new HttpCookie
                        {
                            Domain = host,
                            Name = Text(statement, 1),
                            Path = Text(statement, 2),
                            Value = value,
                            Secure = sqlite3_column_int64(statement, 4) != 0,
                            HttpOnly = sqlite3_column_int64(statement, 5) != 0,
                            // Cookie de session (0) : on lui donne une journée, comme Steam.
                            Expires = expires > 0 ? new DateTime(1601, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddTicks(expires * 10) : DateTime.UtcNow.AddDays(1),
                        });
                    }
                }
                finally
                {
                    sqlite3_finalize(statement);
                }
            }
            finally
            {
                sqlite3_close(db);
            }
            return result;
        }

        /// <summary>« v10 » + nonce (12 octets) + chiffré + étiquette (16 octets), AES-256-GCM.</summary>
        private static string Decrypt(byte[] data, byte[] key, string host)
        {
            if (data == null || data.Length < 3 + 12 + 16 || data[0] != 'v' || data[1] != '1' || data[2] != '0')
            {
                return null;
            }
            var nonce = data.Skip(3).Take(12).ToArray();
            var cipher = data.Skip(15).Take(data.Length - 15 - 16).ToArray();
            var tag = data.Skip(data.Length - 16).ToArray();
            var plain = AesGcmDecrypt(key, nonce, cipher, tag);
            if (plain == null)
            {
                return null;
            }
            // Chromium récent : empreinte SHA-256 du domaine devant la valeur.
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(host));
                if (plain.Length >= 32 && plain.Take(32).SequenceEqual(hash))
                {
                    plain = plain.Skip(32).ToArray();
                }
            }
            return Encoding.UTF8.GetString(plain);
        }

        private static string Text(IntPtr statement, int column)
        {
            var pointer = sqlite3_column_text(statement, column);
            var length = sqlite3_column_bytes(statement, column);
            if (pointer == IntPtr.Zero || length <= 0)
            {
                return "";
            }
            var bytes = new byte[length];
            Marshal.Copy(pointer, bytes, 0, length);
            return Encoding.UTF8.GetString(bytes);
        }

        private static byte[] Blob(IntPtr statement, int column)
        {
            var pointer = sqlite3_column_blob(statement, column);
            var length = sqlite3_column_bytes(statement, column);
            if (pointer == IntPtr.Zero || length <= 0)
            {
                return null;
            }
            var bytes = new byte[length];
            Marshal.Copy(pointer, bytes, 0, length);
            return bytes;
        }

        // ——— AES-GCM par BCrypt (pas disponible dans .NET Framework 4.6.2) ———

        private static byte[] AesGcmDecrypt(byte[] key, byte[] nonce, byte[] cipher, byte[] tag)
        {
            if (BCryptOpenAlgorithmProvider(out var algorithm, "AES", null, 0) != 0)
            {
                return null;
            }
            try
            {
                var mode = Encoding.Unicode.GetBytes("ChainingModeGCM\0");
                if (BCryptSetProperty(algorithm, "ChainingMode", mode, mode.Length, 0) != 0
                    || BCryptGenerateSymmetricKey(algorithm, out var keyHandle, IntPtr.Zero, 0, key, key.Length, 0) != 0)
                {
                    return null;
                }
                var nonceHandle = GCHandle.Alloc(nonce, GCHandleType.Pinned);
                var tagHandle = GCHandle.Alloc(tag, GCHandleType.Pinned);
                try
                {
                    var info = new BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO
                    {
                        cbSize = Marshal.SizeOf(typeof(BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO)),
                        dwInfoVersion = 1,
                        pbNonce = nonceHandle.AddrOfPinnedObject(),
                        cbNonce = nonce.Length,
                        pbTag = tagHandle.AddrOfPinnedObject(),
                        cbTag = tag.Length,
                    };
                    var plain = new byte[cipher.Length];
                    var status = BCryptDecrypt(keyHandle, cipher, cipher.Length, ref info, null, 0, plain, plain.Length, out var written, 0);
                    return status == 0 ? plain.Take(written).ToArray() : null;
                }
                finally
                {
                    nonceHandle.Free();
                    tagHandle.Free();
                    BCryptDestroyKey(keyHandle);
                }
            }
            finally
            {
                BCryptCloseAlgorithmProvider(algorithm, 0);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO
        {
            public int cbSize;
            public int dwInfoVersion;
            public IntPtr pbNonce;
            public int cbNonce;
            public IntPtr pbAuthData;
            public int cbAuthData;
            public IntPtr pbTag;
            public int cbTag;
            public IntPtr pbMacContext;
            public int cbMacContext;
            public int cbAAD;
            public long cbData;
            public int dwFlags;
        }

        [DllImport("bcrypt.dll", CharSet = CharSet.Unicode)]
        private static extern uint BCryptOpenAlgorithmProvider(out IntPtr algorithm, string algId, string implementation, uint flags);

        [DllImport("bcrypt.dll", CharSet = CharSet.Unicode)]
        private static extern uint BCryptSetProperty(IntPtr handle, string property, byte[] input, int inputSize, uint flags);

        [DllImport("bcrypt.dll")]
        private static extern uint BCryptGenerateSymmetricKey(IntPtr algorithm, out IntPtr key, IntPtr keyObject, int keyObjectSize, byte[] secret, int secretSize, uint flags);

        [DllImport("bcrypt.dll")]
        private static extern uint BCryptDecrypt(IntPtr key, byte[] input, int inputSize, ref BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO paddingInfo, byte[] iv, int ivSize, byte[] output, int outputSize, out int written, uint flags);

        [DllImport("bcrypt.dll")]
        private static extern uint BCryptDestroyKey(IntPtr key);

        [DllImport("bcrypt.dll")]
        private static extern uint BCryptCloseAlgorithmProvider(IntPtr algorithm, uint flags);

        // ——— SQLite (sqlite3.x86.dll, fournie avec Playnite) ———

        private const int SQLITE_OPEN_READONLY = 1;
        private const int SQLITE_ROW = 100;

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int bytes, out IntPtr statement, IntPtr tail);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_step(IntPtr statement);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr sqlite3_column_text(IntPtr statement, int column);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr sqlite3_column_blob(IntPtr statement, int column);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_column_bytes(IntPtr statement, int column);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern long sqlite3_column_int64(IntPtr statement, int column);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_finalize(IntPtr statement);

        [DllImport("sqlite3.x86.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_close(IntPtr db);
    }
}
