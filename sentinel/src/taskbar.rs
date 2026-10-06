//! Barre des tâches masquée automatiquement tant que Playscreen est ouvert : les autres
//! fenêtres (launchers, Paramètres) s'affichent alors en plein écran, sans barre par-dessus.
//! C'est la sentinelle qui s'en charge (pas Playscreen) : si Playscreen est fermé ou tué, la
//! barre revient comme l'utilisateur l'avait réglée. L'état d'origine est aussi noté dans un
//! fichier, pour le rétablir si la sentinelle elle-même est arrêtée entre-temps.

use std::path::PathBuf;

const ABS_AUTOHIDE: u32 = 0x1;

fn state_file() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Playscreen").join("taskbar-original.txt"))
}

/// Suit l'état de Playscreen et masque ou rétablit la barre.
pub struct Taskbar {
    /// État d'origine noté au masquage ; None si la barre n'est pas modifiée par nous.
    original: Option<u32>,
}

impl Taskbar {
    /// Rétablit la barre si une session précédente l'avait masquée sans la remettre.
    pub fn new() -> Self {
        let mut taskbar = Taskbar { original: None };
        if let Some(saved) = state_file().and_then(|f| std::fs::read_to_string(f).ok()).and_then(|t| t.trim().parse().ok()) {
            taskbar.original = Some(saved);
            taskbar.restore();
        }
        taskbar
    }

    /// À appeler régulièrement : `playscreen_open` dit si la fenêtre Playscreen existe.
    pub fn update(&mut self, playscreen_open: bool) {
        match (playscreen_open, self.original) {
            (true, None) => {
                let current = platform::get_state();
                self.original = Some(current);
                if let Some(file) = state_file() {
                    let _ = std::fs::write(file, current.to_string());
                }
                if current & ABS_AUTOHIDE == 0 {
                    platform::set_state(current | ABS_AUTOHIDE);
                    crate::actions::log("Barre des tâches masquée (Playscreen ouvert)");
                }
            }
            (false, Some(_)) => self.restore(),
            _ => {}
        }
    }

    /// Remet la barre comme avant (à l'arrêt de la sentinelle aussi).
    pub fn restore(&mut self) {
        if let Some(original) = self.original.take() {
            if original & ABS_AUTOHIDE == 0 {
                platform::set_state(original);
                crate::actions::log("Barre des tâches rétablie");
            }
            if let Some(file) = state_file() {
                let _ = std::fs::remove_file(file);
            }
        }
    }
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::UI::Shell::{SHAppBarMessage, ABM_GETSTATE, ABM_SETSTATE, APPBARDATA};
    use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;

    fn data() -> APPBARDATA {
        // SAFETY : structure C remplie de zéros, puis sa taille.
        let mut data: APPBARDATA = unsafe { std::mem::zeroed() };
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        let class: Vec<u16> = "Shell_TrayWnd".encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY : chaîne terminée par un zéro.
        data.hWnd = unsafe { FindWindowW(class.as_ptr(), std::ptr::null()) };
        data
    }

    pub fn get_state() -> u32 {
        let mut data = data();
        // SAFETY : APPBARDATA valide.
        unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) as u32 }
    }

    pub fn set_state(state: u32) {
        let mut data = data();
        data.lParam = state as isize;
        // SAFETY : APPBARDATA valide.
        unsafe { SHAppBarMessage(ABM_SETSTATE, &mut data) };
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn get_state() -> u32 {
        0
    }

    pub fn set_state(_state: u32) {}
}
