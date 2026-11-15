//! Pages ouvertes dans le navigateur par un jeu ou un launcher (« Demande de permission »
//! d'Epic, F29) : hors de Playscreen, donc hors de portée de la manette. Quand Playscreen
//! est ouvert, une nouvelle fenêtre de navigateur est mise devant et la manette y devient une
//! souris (avec la bulle d'aide) ; à sa fermeture, la manette redevient une manette.
//! Les fenêtres déjà ouvertes à l'ouverture de Playscreen (le Chrome de travail) sont ignorées.

use std::collections::HashSet;

/// Navigateurs reconnus (nom de l'exécutable, en minuscules).
const BROWSERS: [&str; 6] = ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"];

#[derive(Default)]
pub struct BrowserWatch {
    /// Fenêtres de navigateur déjà vues (ignorées).
    known: HashSet<isize>,
    /// Fenêtre ouverte pendant Playscreen, pilotée en mode souris.
    pub active: Option<isize>,
    watching: bool,
}

/// Ce que la boucle de la sentinelle doit faire.
#[derive(Debug, PartialEq, Eq)]
pub enum Change {
    None,
    /// Nouvelle fenêtre mise devant : passer en mode souris.
    Opened,
    /// La fenêtre suivie est fermée : quitter le mode souris.
    Closed,
}

impl BrowserWatch {
    /// À appeler environ une fois par seconde. `open` : Playscreen tourne et une manette est
    /// branchée ; `mouse_busy` : le mode souris est déjà utilisé pour autre chose.
    pub fn update(&mut self, open: bool, mouse_busy: bool) -> Change {
        if !open {
            // Rien à surveiller : pas de parcours des fenêtres (sentinelle au repos).
            self.watching = false;
            self.known.clear();
            return if self.active.take().is_some() { Change::Closed } else { Change::None };
        }
        let windows = platform::browser_windows();
        if !self.watching {
            // Playscreen vient de s'ouvrir : les fenêtres présentes ne sont pas pour nous.
            self.watching = true;
            self.known = windows.into_iter().collect();
            return Change::None;
        }
        if let Some(active) = self.active {
            if !windows.contains(&active) {
                self.active = None;
                self.known.retain(|w| windows.contains(w));
                return Change::Closed;
            }
        }
        let fresh: Vec<isize> = windows.iter().copied().filter(|w| !self.known.contains(w)).collect();
        self.known = windows.into_iter().collect();
        match fresh.first() {
            Some(&window) if self.active.is_none() && !mouse_busy => {
                platform::bring_to_front(window);
                self.active = Some(window);
                Change::Opened
            }
            _ => Change::None,
        }
    }

    /// Le mode souris a été quitté autrement (Select + Y, Select + X) : on ne suit plus la fenêtre.
    pub fn forget(&mut self) {
        self.active = None;
    }
}

#[cfg(windows)]
mod platform {
    use super::BROWSERS;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER,
        SW_RESTORE, WS_EX_TOOLWINDOW,
    };

    /// Fenêtres principales visibles des navigateurs (titrées, sans propriétaire).
    pub fn browser_windows() -> Vec<isize> {
        let mut found: Vec<isize> = Vec::new();
        // SAFETY : EnumWindows appelle `collect` avec le pointeur vers `found`, vivant pendant l'appel.
        unsafe {
            EnumWindows(Some(collect), &mut found as *mut Vec<isize> as LPARAM);
        }
        found
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = &mut *(lparam as *mut Vec<isize>);
        if IsWindowVisible(hwnd) == 0
            || !GetWindow(hwnd, GW_OWNER).is_null()
            || GetWindowTextLengthW(hwnd) == 0
            || (GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) != 0
        {
            return 1;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if is_browser(pid) {
            found.push(hwnd as isize);
        }
        1
    }

    unsafe fn is_browser(pid: u32) -> bool {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return false;
        }
        let mut buffer = [0u16; 512];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut size) != 0;
        CloseHandle(process);
        if !ok {
            return false;
        }
        let path = String::from_utf16_lossy(&buffer[..size as usize]).to_ascii_lowercase();
        let name = path.rsplit('\\').next().unwrap_or("");
        BROWSERS.contains(&name)
    }

    /// Met la fenêtre devant (même contournement que actions::focus_window).
    pub fn bring_to_front(window: isize) {
        let hwnd = window as HWND;
        // SAFETY : appels Win32 sur une fenêtre d'un autre processus, sans pointeur conservé.
        unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            let foreground = GetForegroundWindow();
            let foreground_thread = GetWindowThreadProcessId(foreground, null_mut());
            let current_thread = GetCurrentThreadId();
            let attached = foreground_thread != 0
                && foreground_thread != current_thread
                && AttachThreadInput(current_thread, foreground_thread, 1) != 0;
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
            if attached {
                AttachThreadInput(current_thread, foreground_thread, 0);
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn browser_windows() -> Vec<isize> {
        Vec::new()
    }
    pub fn bring_to_front(_window: isize) {}
}
