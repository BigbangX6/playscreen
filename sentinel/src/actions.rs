//! Actions déclenchées par le méta-raccourci.

use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

/// Titre de la fenêtre principale de Playscreen (doit correspondre à l'interface).
pub const PLAYSCREEN_WINDOW_TITLE: &str = "Playscreen";

pub struct Config {
    /// Exécutable de Playscreen à lancer s'il n'est pas déjà ouvert.
    pub playscreen_exe: Option<PathBuf>,
    /// Démarrage du moteur (start-engine.cmd), lancé avant Playscreen s'il est arrêté.
    pub engine: Option<PathBuf>,
    /// Titre exact de la fenêtre à ramener au premier plan.
    pub window_title: String,
    /// Méta-raccourci (« select+y » ou « select+start »).
    pub shortcut: Option<String>,
}

/// Réglages lus dans %LOCALAPPDATA%\Playscreen\sentinel.cfg (lignes « clé=valeur » : exe,
/// engine, window, shortcut). Les variables d'environnement PLAYSCREEN_EXE, PLAYSCREEN_ENGINE,
/// PLAYSCREEN_WINDOW et PLAYSCREEN_SHORTCUT passent devant (tests).
pub fn parse_config(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_ascii_lowercase(), value.trim().to_string()))
        })
        .collect()
}

impl Config {
    pub fn load() -> Self {
        let file = std::env::var_os("LOCALAPPDATA")
            .map(|d| PathBuf::from(d).join("Playscreen").join("sentinel.cfg"))
            .and_then(|f| std::fs::read_to_string(f).ok())
            .unwrap_or_default();
        let settings = parse_config(&file);
        let get = |env: &str, key: &str| {
            std::env::var(env).ok().or_else(|| settings.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()))
        };
        // Sans réglage : le paquet (dist\Playscreen) met Playscreen.exe et start-engine.cmd
        // dans le dossier parent de celui de la sentinelle (dist\Playscreen\Sentinelle).
        let beside = |name: &str| {
            let dir = std::env::current_exe().ok()?.parent()?.parent()?.to_path_buf();
            let path = dir.join(name);
            path.exists().then_some(path)
        };
        Self {
            playscreen_exe: get("PLAYSCREEN_EXE", "exe").map(PathBuf::from).or_else(|| beside("Playscreen.exe")),
            engine: get("PLAYSCREEN_ENGINE", "engine").map(PathBuf::from).or_else(|| beside("start-engine.cmd")),
            window_title: get("PLAYSCREEN_WINDOW", "window").unwrap_or_else(|| PLAYSCREEN_WINDOW_TITLE.to_string()),
            shortcut: get("PLAYSCREEN_SHORTCUT", "shortcut"),
        }
    }
}

/// Ramène Playscreen au premier plan, ou le lance (avec le moteur s'il est arrêté).
pub fn launch_or_focus(config: &Config) {
    if platform::focus_window(&config.window_title) {
        log("Playscreen ramené au premier plan");
        return;
    }
    if let Some(engine) = &config.engine {
        if !platform::process_running("Playnite.DesktopApp") {
            // start-engine.cmd sans fenêtre de console.
            match platform::start_hidden(engine) {
                Ok(()) => log(&format!("Moteur démarré : {}", engine.display())),
                Err(e) => log(&format!("Échec du démarrage du moteur {} : {e}", engine.display())),
            }
        }
    }
    match &config.playscreen_exe {
        Some(exe) => {
            platform::allow_launched_window_to_take_focus();
            match Command::new(exe).spawn() {
                Ok(_) => log(&format!("Playscreen lancé : {}", exe.display())),
                Err(e) => log(&format!("Échec du lancement de {} : {e}", exe.display())),
            }
        }
        None => log("Playscreen introuvable : « exe » absent de sentinel.cfg"),
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

    pub fn process_running(name: &str) -> bool {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
        };
        let wanted = format!("{name}.exe").to_ascii_lowercase();
        // SAFETY : instantané des processus parcouru puis fermé.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot.is_null() {
                return false;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut found = false;
            let mut ok = Process32FirstW(snapshot, &mut entry) != 0;
            while ok && !found {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                found = String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase() == wanted;
                ok = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
            found
        }
    }

    /// Lance un script (.cmd) sans fenêtre de console.
    pub fn start_hidden(path: &std::path::Path) -> std::io::Result<()> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = std::process::Command::new("cmd");
        command.arg("/c").arg(path).creation_flags(CREATE_NO_WINDOW);
        if let Some(dir) = path.parent() {
            command.current_dir(dir);
        }
        command.spawn().map(|_| ())
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

    pub fn process_running(_name: &str) -> bool {
        false
    }

    pub fn start_hidden(_path: &std::path::Path) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::parse_config;

    #[test]
    fn lit_les_reglages() {
        let settings = parse_config("# commentaire\nexe = C:\\Playscreen\\Playscreen.exe\n\nShortcut=select+start\nsans egal\n");
        assert_eq!(settings, vec![
            ("exe".to_string(), "C:\\Playscreen\\Playscreen.exe".to_string()),
            ("shortcut".to_string(), "select+start".to_string()),
        ]);
    }
}
