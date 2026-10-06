//! Relais : Playscreen passe la main à une fenêtre de Windows ou d'un launcher (Paramètres
//! Windows, activation d'une clé Steam, magasins des launchers) et la manette devient une
//! souris (sentinelle). On revient avec le méta-raccourci (Select + Y) ; la fenêtre ouverte
//! est alors fermée (Paramètres) ou réduite (launchers) : pas de fenêtres qui traînent.

const STEAM: &[&str] = &["steamwebhelper"];
const EPIC: &[&str] = &["EpicGamesLauncher"];
const XBOX: &[&str] = &["XboxPcApp"];
const BATTLENET: &[&str] = &["Battle.net"];

/// Ce qu'ouvre chaque relais : adresse, et processus de la fenêtre à mettre en grand.
/// Cibles avec paramètre : `steam-workshop:<appid>`, `game-properties:<store>:<id>`,
/// `launcher-settings-<store>`, `install-<launcher>` (voir `install`).
fn target(target: &str) -> Option<(String, &'static [&'static str])> {
    let fixed = |uri: &str, processes: &'static [&'static str]| Some((uri.to_string(), processes));
    match target {
        "windows-settings" => return fixed("ms-settings:", &["SystemSettings"]),
        "activate-key" => return fixed("steam://open/activateproduct", &[]),
        "store-steam" => return fixed("steam://store", STEAM),
        "store-epic" => return fixed("com.epicgames.launcher://store", EPIC),
        "store-xbox" => return fixed("msxbox://", XBOX),
        // battlenet://shop ouvre l'accueil de Battle.net (6 octobre 2026) : la consigne dit
        // de choisir « Boutique ».
        "store-battlenet" => return fixed("battlenet://shop", BATTLENET),
        "launcher-settings-steam" => return fixed("steam://open/settings", STEAM),
        "launcher-settings-epic" => return fixed("com.epicgames.launcher://settings", EPIC),
        // Pas de lien vers leurs paramètres : la fenêtre principale (roue / menu en haut).
        "launcher-settings-xbox" => return fixed("msxbox://", XBOX),
        "launcher-settings-battlenet" => return fixed("battlenet://", BATTLENET),
        _ => {}
    }
    if let Some(app_id) = target.strip_prefix("steam-workshop:").filter(|id| is_id(id)) {
        return Some((format!("steam://url/SteamWorkshopPage/{app_id}"), STEAM));
    }
    let (store, id) = target.strip_prefix("game-properties:")?.split_once(':')?;
    if !is_id(id) {
        return None;
    }
    match store {
        "steam" => Some((format!("steam://gameproperties/{id}"), STEAM)),
        // Epic, Xbox, Battle.net : pas de lien vers les propriétés d'un jeu ; sa page dans la
        // bibliothèque (Epic) ou la fenêtre principale.
        "epic" => Some(("com.epicgames.launcher://library".to_string(), EPIC)),
        "xbox" => Some(("msxbox://".to_string(), XBOX)),
        "battlenet" => Some(("battlenet://".to_string(), BATTLENET)),
        _ => None,
    }
}

/// Identifiant de jeu sûr à mettre dans une adresse (pas d'espace ni de caractère spécial).
fn is_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

/// Launchers installables : identifiant winget et page officielle (même liste que
/// `LAUNCHERS` dans ui/src/screens/spaces.ts).
fn launcher(id: &str) -> Option<(&'static str, &'static str)> {
    Some(match id {
        "steam" => ("Valve.Steam", "https://store.steampowered.com/about/"),
        "epic" => ("EpicGames.EpicGamesLauncher", "https://store.epicgames.com/fr/download"),
        "xbox" => ("9MV0B5HZVK9Z", "https://www.xbox.com/fr-FR/apps/xbox-app-for-pc"),
        "battlenet" => ("Blizzard.BattleNet", "https://download.battle.net/fr-fr/desktop"),
        "gog" => ("GOG.Galaxy", "https://www.gog.com/fr/galaxy"),
        "ea" => ("ElectronicArts.EADesktop", "https://www.ea.com/fr-fr/ea-app"),
        "ubisoft" => ("Ubisoft.Connect", "https://www.ubisoft.com/fr-fr/ubisoft-connect/download"),
        "amazon" => ("Amazon.Games", "https://gaming.amazon.com/home"),
        _ => return None,
    })
}

/// Installe un launcher avec winget, sans fenêtre (Windows demande son autorisation) ; en cas
/// d'échec (winget absent, autorisation refusée), ouvre sa page officielle.
fn install(id: &str) -> bool {
    let Some((package, page)) = launcher(id) else {
        return false;
    };
    let source = if package.starts_with("9") { "msstore" } else { "winget" };
    std::thread::spawn(move || {
        let mut command = std::process::Command::new("winget");
        command.args(["install", "--id", package, "--exact", "--source", source, "--silent"])
            .args(["--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let ok = command.status().map(|status| status.success()).unwrap_or(false);
        eprintln!("[relais] winget {package} : {}", if ok { "installé" } else { "échec, page officielle" });
        if !ok {
            let _ = std::process::Command::new("explorer.exe").arg(page).spawn();
        }
    });
    true
}

/// Ouvre la cible, la met en grand au premier plan dès qu'elle apparaît, et passe la
/// sentinelle en mode souris. Faux si la cible est inconnue ou si la sentinelle ne tourne pas.
pub fn start(name: &str) -> bool {
    if let Some(id) = name.strip_prefix("install-") {
        return install(id) && set_mouse_mode(true);
    }
    let Some((uri, processes)) = target(name) else {
        return false;
    };
    // explorer ouvre les adresses ms-settings:, steam:// … comme un double clic.
    if std::process::Command::new("explorer.exe").arg(&uri).spawn().is_err() {
        return false;
    }
    // Les paramètres de Steam et les propriétés d'un jeu sont des fenêtres à part, déjà
    // devant : mettre la fenêtre principale en grand les cacherait.
    if !processes.is_empty() && !steam_dialog(name) {
        std::thread::spawn(move || windows::bring_up(processes));
    }
    set_mouse_mode(true)
}

/// Paramètres de Steam, propriétés d'un jeu Steam : fenêtres « Paramètres Steam » et « <jeu> »
/// à côté de la fenêtre principale « Steam ».
fn steam_dialog(name: &str) -> bool {
    name == "launcher-settings-steam" || name.starts_with("game-properties:steam:")
}

/// Retour sur Playscreen : manette normale, Paramètres fermés, launcher réduit.
pub fn end(name: &str) -> bool {
    if let Some((_, processes)) = target(name) {
        if name == "windows-settings" {
            windows::close(processes);
        } else if steam_dialog(name) {
            windows::close_except(processes, "Steam");
            windows::minimize(processes);
        } else {
            windows::minimize(processes);
        }
    }
    set_mouse_mode(false)
}

/// Prévient la sentinelle (fenêtre cachée « PlayscreenSentinel ») : mode souris oui / non.
pub fn set_mouse_mode(on: bool) -> bool {
    send_pad_mode(if on { 1 } else { 0 })
}

/// Mode télécommande (YouTube TV) : la manette envoie des flèches, Entrée et Échap à la
/// fenêtre au premier plan, sans souris.
pub fn set_remote_mode() -> bool {
    send_pad_mode(2)
}

/// 0 : manette normale ; 1 : souris ; 2 : télécommande.
#[cfg(windows)]
fn send_pad_mode(mode: usize) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, PostMessageW, WM_APP};
    // Même valeur que WM_MOUSE_MODE dans sentinel/src/tray.rs.
    const WM_MOUSE_MODE: u32 = WM_APP + 2;
    let class_name: Vec<u16> = "PlayscreenSentinel".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY : chaîne terminée par un zéro ; message simple sans pointeur.
    unsafe {
        let hwnd = FindWindowW(class_name.as_ptr(), std::ptr::null());
        !hwnd.is_null() && PostMessageW(hwnd, WM_MOUSE_MODE, mode, 0) != 0
    }
}

#[cfg(not(windows))]
fn send_pad_mode(_mode: usize) -> bool {
    false
}

#[cfg(windows)]
pub fn sentinel_running() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;
    let class_name: Vec<u16> = "PlayscreenSentinel".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY : chaîne terminée par un zéro.
    unsafe { !FindWindowW(class_name.as_ptr(), std::ptr::null()).is_null() }
}

#[cfg(not(windows))]
pub fn sentinel_running() -> bool {
    false
}

#[cfg(windows)]
mod windows {
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        PostMessageW, SetForegroundWindow, ShowWindow, GW_OWNER, SW_MAXIMIZE, SW_MINIMIZE, WM_CLOSE,
    };

    /// Nom de l'exécutable (sans « .exe ») du processus.
    fn process_name(process_id: u32) -> Option<String> {
        // SAFETY : handle fermé avant de sortir ; tampon de taille connue.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if handle.is_null() {
                return None;
            }
            let mut buffer = [0u16; 1024];
            let mut size = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) != 0;
            CloseHandle(handle);
            if !ok {
                return None;
            }
            let path = String::from_utf16_lossy(&buffer[..size as usize]);
            let file = path.rsplit('\\').next()?.to_string();
            Some(file.strip_suffix(".exe").unwrap_or(&file).to_string())
        }
    }

    struct Search {
        processes: &'static [&'static str],
        found: Vec<(HWND, i64)>,
    }

    fn title(hwnd: HWND) -> String {
        let mut buffer = [0u16; 256];
        // SAFETY : tampon de taille connue.
        let len = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    /// Fenêtres principales visibles (avec titre, sans propriétaire) de ces processus, avec leur aire.
    fn windows_of(processes: &'static [&'static str]) -> Vec<(HWND, i64)> {
        unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
            let search = &mut *(data as *mut Search);
            if IsWindowVisible(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() || GetWindowTextLengthW(hwnd) == 0 {
                return 1;
            }
            let mut process_id = 0;
            GetWindowThreadProcessId(hwnd, &mut process_id);
            if let Some(name) = process_name(process_id) {
                if search.processes.iter().any(|p| p.eq_ignore_ascii_case(&name)) {
                    let mut rect: RECT = std::mem::zeroed();
                    GetWindowRect(hwnd, &mut rect);
                    let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
                    search.found.push((hwnd, area));
                }
            }
            1
        }
        let mut search = Search { processes, found: Vec::new() };
        // SAFETY : `search` vit pendant toute l'énumération.
        unsafe { EnumWindows(Some(visit), &mut search as *mut Search as LPARAM) };
        search.found
    }

    /// Met en grand et au premier plan la plus grande fenêtre de ces processus, dès qu'elle
    /// apparaît (le launcher peut mettre quelques secondes à s'ouvrir).
    pub fn bring_up(processes: &'static [&'static str]) {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(15) {
            if let Some(&(hwnd, _)) = windows_of(processes).iter().max_by_key(|(_, area)| *area) {
                // SAFETY : fenêtre d'un autre processus ; Playscreen est au premier plan, il
                // peut lui donner la main.
                unsafe {
                    ShowWindow(hwnd, SW_MAXIMIZE);
                    SetForegroundWindow(hwnd);
                }
                return;
            }
            std::thread::sleep(Duration::from_millis(300));
        }
    }

    pub fn minimize(processes: &'static [&'static str]) {
        for (hwnd, _) in windows_of(processes) {
            // SAFETY : simple commande de fenêtre.
            unsafe { ShowWindow(hwnd, SW_MINIMIZE) };
        }
    }

    /// Ferme les fenêtres de ces processus sauf celle qui porte ce titre (fenêtre principale).
    pub fn close_except(processes: &'static [&'static str], main_title: &str) {
        for (hwnd, _) in windows_of(processes) {
            if title(hwnd) != main_title {
                // SAFETY : message de fermeture polie, comme la croix.
                unsafe { PostMessageW(hwnd, WM_CLOSE, 0, 0) };
            }
        }
    }

    pub fn close(processes: &'static [&'static str]) {
        for (hwnd, _) in windows_of(processes) {
            // SAFETY : message de fermeture polie, comme la croix.
            unsafe { PostMessageW(hwnd, WM_CLOSE, 0, 0) };
        }
    }
}

#[cfg(not(windows))]
mod windows {
    pub fn bring_up(_processes: &'static [&'static str]) {}
    pub fn minimize(_processes: &'static [&'static str]) {}
    pub fn close(_processes: &'static [&'static str]) {}
    pub fn close_except(_processes: &'static [&'static str], _main_title: &str) {}
}
