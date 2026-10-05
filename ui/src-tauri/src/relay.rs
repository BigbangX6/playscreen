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
#[cfg(windows)]
pub fn set_mouse_mode(on: bool) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, PostMessageW, WM_APP};
    // Même valeur que WM_MOUSE_MODE dans sentinel/src/tray.rs.
    const WM_MOUSE_MODE: u32 = WM_APP + 2;
    let class_name: Vec<u16> = "PlayscreenSentinel".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY : chaîne terminée par un zéro ; message simple sans pointeur.
    unsafe {
        let hwnd = FindWindowW(class_name.as_ptr(), std::ptr::null());
        !hwnd.is_null() && PostMessageW(hwnd, WM_MOUSE_MODE, on as usize, 0) != 0
    }
}

#[cfg(not(windows))]
pub fn set_mouse_mode(_on: bool) -> bool {
    false
}
