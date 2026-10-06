//! Relais : Playscreen passe la main à une fenêtre de Windows ou d'un launcher (Paramètres
//! Windows, activation d'une clé Steam) et la manette devient une souris (sentinelle). On
//! revient avec Select + Start.

/// Adresse ouverte pour chaque relais connu de l'interface.
fn target_uri(target: &str) -> Option<&'static str> {
    match target {
        "windows-settings" => Some("ms-settings:"),
        "activate-key" => Some("steam://open/activateproduct"),
        _ => None,
    }
}

/// Ouvre la cible puis passe la sentinelle en mode souris. Faux si la cible est inconnue
/// ou si la sentinelle ne tourne pas (la fenêtre s'ouvre quand même).
pub fn start(target: &str) -> bool {
    let Some(uri) = target_uri(target) else {
        return false;
    };
    // explorer ouvre les adresses ms-settings: et steam:// comme un double clic.
    if std::process::Command::new("explorer.exe").arg(uri).spawn().is_err() {
        return false;
    }
    set_mouse_mode(true)
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
