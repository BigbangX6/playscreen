//! Actions déclenchées par le méta-raccourci.

use std::path::PathBuf;
use std::process::Command;

/// Titre de la fenêtre principale de Playscreen (doit correspondre à l'interface).
pub const PLAYSCREEN_WINDOW_TITLE: &str = "Playscreen";

pub struct Config {
    /// Exécutable de Playscreen à lancer s'il n'est pas déjà ouvert.
    pub playscreen_exe: Option<PathBuf>,
}

impl Config {
    pub fn from_env() -> Self {
        Self { playscreen_exe: std::env::var_os("PLAYSCREEN_EXE").map(PathBuf::from) }
    }
}

/// Ramène Playscreen au premier plan, ou le lance s'il n'est pas ouvert.
pub fn launch_or_focus(config: &Config) {
    if platform::focus_window(PLAYSCREEN_WINDOW_TITLE) {
        log("Playscreen ramené au premier plan");
        return;
    }
    match &config.playscreen_exe {
        Some(exe) => match Command::new(exe).spawn() {
            Ok(_) => log(&format!("Playscreen lancé : {}", exe.display())),
            Err(e) => log(&format!("Échec du lancement de {} : {e}", exe.display())),
        },
        None => log("Playscreen introuvable : PLAYSCREEN_EXE n'est pas défini"),
    }
}

pub fn log(message: &str) {
    eprintln!("[sentinel] {message}");
}

#[cfg(windows)]
mod platform {
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    /// Phase 4 : Windows limite SetForegroundWindow pour un processus en arrière-plan.
    /// Il faudra des techniques éprouvées (AttachThreadInput, simulation de touche Alt…),
    /// à valider sur matériel réel.
    pub fn focus_window(title: &str) -> bool {
        unsafe {
            let Ok(hwnd) = FindWindowW(None, &HSTRING::from(title)) else {
                return false;
            };
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            SetForegroundWindow(hwnd).as_bool()
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn focus_window(_title: &str) -> bool {
        false
    }
}
