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
        EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE,
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
            _ => 1,
        }
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
        if IsIconic(search.found) != 0 {
            ShowWindow(search.found, SW_RESTORE);
        }
        SetForegroundWindow(search.found) != 0
    }
}

#[cfg(not(windows))]
pub fn focus(_install_directory: &str) -> bool {
    false
}
