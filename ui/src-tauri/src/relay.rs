//! Relais : Playscreen passe la main à une fenêtre de Windows ou d'un launcher (Paramètres
//! Windows, activation d'une clé Steam, magasins des launchers) et la manette devient une
//! souris (sentinelle). On revient avec le méta-raccourci (Select + Y) ; la fenêtre ouverte
//! est alors fermée (Paramètres) ou réduite (launchers) : pas de fenêtres qui traînent.

/// Ce qu'ouvre chaque relais : adresse, et processus de la fenêtre à mettre en grand.
fn target(target: &str) -> Option<(&'static str, &'static [&'static str])> {
    match target {
        "windows-settings" => Some(("ms-settings:", &["SystemSettings"])),
        "activate-key" => Some(("steam://open/activateproduct", &[])),
        "store-steam" => Some(("steam://store", &["steamwebhelper"])),
        "store-epic" => Some(("com.epicgames.launcher://store", &["EpicGamesLauncher"])),
        "store-xbox" => Some(("msxbox://", &["XboxPcApp"])),
        // battlenet://shop ouvre l'accueil de Battle.net (6 octobre 2026) : la consigne dit
        // de choisir « Boutique ».
        "store-battlenet" => Some(("battlenet://shop", &["Battle.net"])),
        _ => None,
    }
}

/// Ouvre la cible, la met en grand au premier plan dès qu'elle apparaît, et passe la
/// sentinelle en mode souris. Faux si la cible est inconnue ou si la sentinelle ne tourne pas.
pub fn start(name: &str) -> bool {
    let Some((uri, processes)) = target(name) else {
        return false;
    };
    // explorer ouvre les adresses ms-settings:, steam:// … comme un double clic.
    if std::process::Command::new("explorer.exe").arg(uri).spawn().is_err() {
        return false;
    }
    if !processes.is_empty() {
        std::thread::spawn(move || windows::bring_up(processes));
    }
    set_mouse_mode(true)
}

/// Retour sur Playscreen : manette normale, Paramètres fermés, launcher réduit.
pub fn end(name: &str) -> bool {
    if let Some((_, processes)) = target(name) {
        if name == "windows-settings" {
            windows::close(processes);
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
        EnumWindows, GetWindow, GetWindowRect, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
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
}
