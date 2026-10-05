//! Sentinelle sous Windows : fenêtre cachée, icône dans la zone de notification (menu
//! « Quitter »), notification au démarrage, et lecture de la manette ~60 fois par seconde
//! grâce à un minuteur de la boucle de messages.

use std::cell::RefCell;
use std::ptr::{null, null_mut};
use std::time::Instant;

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE, NIF_TIP, NIIF_INFO, NIM_ADD, NIM_DELETE,
    NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
    GetCursorPos, GetMessageW, LoadIconW, PostQuitMessage, RegisterClassW, SetForegroundWindow,
    SetTimer, TrackPopupMenu, TranslateMessage, IDI_APPLICATION, MF_STRING, MSG, TPM_RETURNCMD,
    TPM_RIGHTBUTTON, WM_APP, WM_CONTEXTMENU, WM_RBUTTONUP, WM_TIMER, WNDCLASSW, WS_EX_TOOLWINDOW,
};

use crate::actions::{self, Config};
use crate::chord::{ChordDetector, DEFAULT_HOLD, META_CHORD};
use crate::input::{DefaultSource, GamepadSource};
use crate::POLL_INTERVAL;

const TIMER_ID: usize = 1;
const TRAY_ID: u32 = 1;
const WM_TRAY: u32 = WM_APP + 1;
const MENU_QUIT: usize = 1;

const TIP: &str = "Playscreen : maintiens Select + Start pour ouvrir";
const READY_TITLE: &str = "Playscreen est prêt";
const READY_TEXT: &str = "Maintiens Select (⧉) + Start (☰) pendant 1 seconde pour ouvrir Playscreen.";

struct State {
    config: Config,
    source: DefaultSource,
    detector: ChordDetector,
}

thread_local! {
    // La procédure de fenêtre est une fonction C : l'état passe par le thread.
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

pub fn run(config: Config) {
    STATE.with(|s| {
        *s.borrow_mut() = Some(State {
            config,
            source: DefaultSource,
            detector: ChordDetector::new(META_CHORD, DEFAULT_HOLD),
        })
    });

    // SAFETY : appels Win32 classiques ; chaînes terminées par un zéro et gardées en vie.
    unsafe {
        let instance = GetModuleHandleW(null());
        let class_name = wide("PlayscreenSentinel");
        let mut class: WNDCLASSW = std::mem::zeroed();
        class.lpfnWndProc = Some(window_proc);
        class.hInstance = instance;
        class.lpszClassName = class_name.as_ptr();
        RegisterClassW(&class);

        // Fenêtre jamais affichée (une fenêtre « messages seulement » ne peut pas porter
        // le menu de l'icône).
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            null_mut(),
            null_mut(),
            instance,
            null(),
        );
        if hwnd.is_null() {
            actions::log("Impossible de créer la fenêtre de la sentinelle");
            return;
        }

        let mut icon = icon_data(hwnd);
        icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_INFO;
        copy_wide(&mut icon.szInfoTitle, READY_TITLE);
        copy_wide(&mut icon.szInfo, READY_TEXT);
        icon.dwInfoFlags = NIIF_INFO;
        Shell_NotifyIconW(NIM_ADD, &icon);
        actions::log(&format!(
            "Prête ({} manette(s) XInput). Maintiens Select + Start pour ouvrir Playscreen.",
            DefaultSource::connected_count()
        ));

        SetTimer(hwnd, TIMER_ID, POLL_INTERVAL.as_millis() as u32, None);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        Shell_NotifyIconW(NIM_DELETE, &icon_data(hwnd));
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match message {
        WM_TIMER if wparam == TIMER_ID => {
            STATE.with(|s| {
                if let Some(state) = s.borrow_mut().as_mut() {
                    if state.detector.update(state.source.pressed_buttons(), Instant::now()) {
                        actions::launch_or_focus(&state.config);
                    }
                }
            });
            0
        }
        WM_TRAY => {
            let event = (lparam & 0xFFFF) as u32;
            if event == WM_RBUTTONUP || event == WM_CONTEXTMENU {
                show_menu(hwnd);
            }
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn show_menu(hwnd: HWND) {
    let menu = CreatePopupMenu();
    let label = wide("Quitter la sentinelle");
    AppendMenuW(menu, MF_STRING, MENU_QUIT, label.as_ptr());
    let mut cursor = POINT { x: 0, y: 0 };
    GetCursorPos(&mut cursor);
    // Sans cela, le menu ne se ferme pas quand on clique ailleurs.
    SetForegroundWindow(hwnd);
    let choice = TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD, cursor.x, cursor.y, 0, hwnd, null());
    DestroyMenu(menu);
    if choice as usize == MENU_QUIT {
        actions::log("Arrêt demandé depuis le menu");
        PostQuitMessage(0);
    }
}

unsafe fn icon_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut data: NOTIFYICONDATAW = std::mem::zeroed();
    data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    data.hWnd = hwnd;
    data.uID = TRAY_ID;
    data.uCallbackMessage = WM_TRAY;
    data.hIcon = LoadIconW(null_mut(), IDI_APPLICATION);
    copy_wide(&mut data.szTip, TIP);
    data
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Copie tronquée dans un tableau de taille fixe, toujours terminée par un zéro.
fn copy_wide(target: &mut [u16], text: &str) {
    let source: Vec<u16> = text.encode_utf16().take(target.len() - 1).collect();
    target[..source.len()].copy_from_slice(&source);
    target[source.len()] = 0;
}
