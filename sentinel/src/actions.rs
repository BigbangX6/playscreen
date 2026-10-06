//! Actions déclenchées par le méta-raccourci.

use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

/// Titre de la fenêtre principale de Playscreen (doit correspondre à l'interface).
pub const PLAYSCREEN_WINDOW_TITLE: &str = "Playscreen";

pub struct Config {
    /// Exécutable de Playscreen à lancer s'il n'est pas déjà ouvert.
    pub playscreen_exe: Option<PathBuf>,
    /// Titre exact de la fenêtre à ramener au premier plan.
    pub window_title: String,
}

impl Config {
    /// PLAYSCREEN_EXE et PLAYSCREEN_WINDOW (tant que l'interface n'existe pas, on teste
    /// avec n'importe quel programme, par exemple le Bloc-notes).
    pub fn from_env() -> Self {
        Self {
            playscreen_exe: std::env::var_os("PLAYSCREEN_EXE").map(PathBuf::from),
            window_title: std::env::var("PLAYSCREEN_WINDOW").unwrap_or_else(|_| PLAYSCREEN_WINDOW_TITLE.to_string()),
        }
    }
}

/// Ramène Playscreen au premier plan, ou le lance s'il n'est pas ouvert.
pub fn launch_or_focus(config: &Config) {
    if platform::focus_window(&config.window_title) {
        log("Playscreen ramené au premier plan");
        return;
    }
    match &config.playscreen_exe {
        Some(exe) => {
            platform::allow_launched_window_to_take_focus();
            match Command::new(exe).spawn() {
                Ok(_) => log(&format!("Playscreen lancé : {}", exe.display())),
                Err(e) => log(&format!("Échec du lancement de {} : {e}", exe.display())),
            }
        }
        None => log("Playscreen introuvable : PLAYSCREEN_EXE n'est pas défini"),
    }
}

/// La fenêtre de Playscreen existe-t-elle (même réduite) ?
#[cfg(windows)]
pub fn playscreen_open(config: &Config) -> bool {
    platform::window_exists(&config.window_title)
}

/// Playscreen est-il la fenêtre au premier plan ?
#[cfg(windows)]
pub fn playscreen_in_front(config: &Config) -> bool {
    platform::foreground_is(&config.window_title)
}

/// Console (en développement) et fichier %LOCALAPPDATA%\Playscreen\sentinel.log (la
/// version finale n'a pas de console).
pub fn log(message: &str) {
    eprintln!("[sentinel] {message}");
    if let Some(dir) = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Playscreen")) {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("sentinel.log")) {
            let seconds = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(file, "{seconds} {message}");
        }
    }
}

#[cfg(windows)]
mod platform {
    use std::ptr::null_mut;

    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, BringWindowToTop, FindWindowW, GetForegroundWindow,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
        ASFW_ANY, SW_RESTORE,
    };

    /// Windows refuse SetForegroundWindow à un processus en arrière-plan (la manette n'est
    /// pas une saisie clavier pour lui). Contournement classique : rattacher un instant
    /// notre file de saisie à celle de la fenêtre au premier plan.
    pub fn focus_window(title: &str) -> bool {
        let title: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY : appels Win32 sur des fenêtres d'autres processus, sans pointeur conservé.
        unsafe {
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if hwnd.is_null() || IsWindowVisible(hwnd) == 0 {
                return false;
            }
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            with_foreground_input(|| {
                BringWindowToTop(hwnd);
                SetForegroundWindow(hwnd) != 0
            })
        }
    }

    pub fn foreground_is(title: &str) -> bool {
        let title: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY : chaîne terminée par un zéro ; comparaison de handles.
        unsafe {
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            !hwnd.is_null() && GetForegroundWindow() == hwnd
        }
    }

    pub fn window_exists(title: &str) -> bool {
        let title: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY : chaîne terminée par un zéro.
        unsafe { !FindWindowW(std::ptr::null(), title.as_ptr()).is_null() }
    }

    /// Autorise le programme lancé à passer au premier plan.
    pub fn allow_launched_window_to_take_focus() {
        // SAFETY : sans argument pointeur.
        unsafe {
            with_foreground_input(|| AllowSetForegroundWindow(ASFW_ANY) != 0);
        }
    }

    unsafe fn with_foreground_input(action: impl FnOnce() -> bool) -> bool {
        let foreground = GetForegroundWindow();
        let foreground_thread = GetWindowThreadProcessId(foreground, null_mut());
        let current_thread = GetCurrentThreadId();
        let attached = foreground_thread != 0
            && foreground_thread != current_thread
            && AttachThreadInput(current_thread, foreground_thread, 1) != 0;
        let result = action();
        if attached {
            AttachThreadInput(current_thread, foreground_thread, 0);
        }
        result
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn focus_window(_title: &str) -> bool {
        false
    }

    pub fn allow_launched_window_to_take_focus() {}
}
