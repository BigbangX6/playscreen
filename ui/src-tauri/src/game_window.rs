//! « Reprendre » (menu rapide en jeu, D10) : remettre la fenêtre du jeu au premier plan.
//! C'est Playscreen qui le fait, car c'est lui qui est au premier plan à ce moment-là :
//! Windows ne laisse que le programme au premier plan donner la main à un autre.

#[cfg(windows)]
pub fn focus(install_directory: &str) -> bool {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
        GW_OWNER,
    };

    struct Search {
        directory: String,
        found: HWND,
    }

    fn executable_path(process_id: u32) -> Option<String> {
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
            ok.then(|| String::from_utf16_lossy(&buffer[..size as usize]))
        }
    }

    // Fenêtre principale d'un processus du jeu : visible, avec un titre, sans propriétaire.
    unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = &mut *(data as *mut Search);
        if IsWindowVisible(hwnd) == 0 || GetWindowTextLengthW(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
            return 1;
        }
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        match executable_path(process_id) {
            Some(path) if path.to_lowercase().starts_with(&search.directory) => {
                search.found = hwnd;
                0 // trouvée : on arrête
            }
            // Jeu du Microsoft Store (Xbox) : la fenêtre appartient à ApplicationFrameHost, le
            // jeu est dans une fenêtre enfant (Solitaire, 16/11/2026).
            Some(path) if path.to_lowercase().ends_with("\\applicationframehost.exe") => {
                let mut hosts = (search.directory.clone(), false);
                EnumChildWindows(hwnd, Some(visit_child), &mut hosts as *mut (String, bool) as LPARAM);
                if hosts.1 {
                    search.found = hwnd;
                    0
                } else {
                    1
                }
            }
            _ => 1,
        }
    }

    unsafe extern "system" fn visit_child(hwnd: HWND, data: LPARAM) -> BOOL {
        let hosts = &mut *(data as *mut (String, bool));
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if executable_path(process_id).is_some_and(|path| path.to_lowercase().starts_with(&hosts.0)) {
            hosts.1 = true;
            return 0;
        }
        1
    }

    let mut directory = install_directory.trim_end_matches('\\').to_lowercase();
    directory.push('\\');
    let mut search = Search { directory, found: null_mut() };
    // SAFETY : `search` vit pendant tout l'appel ; la fenêtre trouvée appartient au jeu.
    unsafe {
        EnumWindows(Some(visit), &mut search as *mut Search as LPARAM);
        if search.found.is_null() {
            return false;
        }
        bring_to_front(search.found as isize as i64)
    }
}

#[cfg(not(windows))]
pub fn focus(_install_directory: &str) -> bool {
    false
}

/// Met au premier plan une fenêtre donnée par son handle (fenêtre d'un launcher signalée
/// par le moteur : launcher.prompt).
#[cfg(windows)]
pub fn bring_to_front(handle: i64) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindow, SetForegroundWindow,
        ShowWindow, SW_RESTORE,
    };
    let hwnd = handle as isize as HWND;
    // SAFETY : IsWindow vérifie que le handle désigne toujours une fenêtre ; rattachement de
    // la saisie défait juste après.
    unsafe {
        if IsWindow(hwnd) == 0 {
            return false;
        }
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        // Windows refuse parfois SetForegroundWindow seul (fenêtres d'Epic et du Microsoft
        // Store restées derrière Playscreen, 16/11/2026) : même contournement que la
        // sentinelle, la saisie rattachée un instant à la fenêtre de devant.
        let foreground = GetForegroundWindow();
        let foreground_thread = GetWindowThreadProcessId(foreground, std::ptr::null_mut());
        let current_thread = GetCurrentThreadId();
        let attached = foreground_thread != 0
            && foreground_thread != current_thread
            && AttachThreadInput(current_thread, foreground_thread, 1) != 0;
        BringWindowToTop(hwnd);
        let ok = SetForegroundWindow(hwnd) != 0;
        if attached {
            AttachThreadInput(current_thread, foreground_thread, 0);
        }
        ok
    }
}

#[cfg(not(windows))]
pub fn bring_to_front(_handle: i64) -> bool {
    false
}
