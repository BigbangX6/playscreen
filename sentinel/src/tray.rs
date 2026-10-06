//! Sentinelle sous Windows : fenêtre cachée, icône dans la zone de notification (menu
//! « Quitter »), notification au démarrage, et lecture de la manette ~60 fois par seconde
//! grâce à un minuteur de la boucle de messages. En mode souris (relais), la manette pilote
//! aussi la souris de Windows, jusqu'au prochain Select + Start.

use std::cell::RefCell;
use std::ptr::{null, null_mut};
use std::time::Instant;

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE, NIF_TIP, NIIF_INFO, NIM_ADD, NIM_DELETE,
    NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, VK_CONTROL, VK_DOWN, VK_ESCAPE, VK_LEFT, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
    FindWindowW, GetCursorPos, GetMessageW, LoadIconW, PostMessageW, PostQuitMessage, RegisterClassW,
    SetCursorPos, SetForegroundWindow, SetProcessDPIAware, SetTimer, TrackPopupMenu, TranslateMessage, IDI_APPLICATION, MF_STRING, MSG,
    TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_APP, WM_CONTEXTMENU, WM_RBUTTONUP, WM_TIMER, WNDCLASSW,
    WS_EX_TOOLWINDOW,
};

use crate::actions::{self, Config};
use crate::chord::{ChordDetector, Shortcut};
use crate::input::{DefaultSource, GamepadSource};
use crate::mouse::{Key, MouseMapper, MouseStep};
use crate::nav::{NavKey, NavMapper};
use crate::taskbar::Taskbar;
use crate::touch_keyboard;
use crate::POLL_INTERVAL;

const TIMER_ID: usize = 1;
const TRAY_ID: u32 = 1;
const WM_TRAY: u32 = WM_APP + 1;
const MENU_QUIT: usize = 1;
/// Message envoyé par `--mouse` / `--mouse-off` (ou par Playscreen) : wparam 1 = entrer, 0 = sortir.
const WM_MOUSE_MODE: u32 = WM_APP + 2;
const CLASS_NAME: &str = "PlayscreenSentinel";

const READY_TITLE: &str = "Playscreen est prêt";

struct State {
    config: Config,
    source: DefaultSource,
    detector: ChordDetector,
    shortcut: Shortcut,
    taskbar: Taskbar,
    ticks: u32,
    /// Manette → touches pour Playscreen au premier plan ; None si Playscreen n'est pas devant.
    nav: Option<(NavMapper, Instant)>,
    /// Mode télécommande (YouTube TV) : les mêmes touches, pour la fenêtre au premier plan.
    remote: bool,
    /// Clavier manette de Windows affiché : il lit la manette lui-même, on n'envoie rien.
    keyboard_open: bool,
    /// Mode souris actif : suivi des boutons et heure du pas précédent.
    mouse: Option<(MouseMapper, Instant)>,
}

thread_local! {
    // La procédure de fenêtre est une fonction C : l'état passe par le thread.
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

pub fn run(config: Config) {
    let shortcut = Shortcut::parse(config.shortcut.as_deref());
    let source = DefaultSource::new();
    let description = source.describe();
    STATE.with(|s| {
        *s.borrow_mut() = Some(State {
            config,
            source,
            detector: ChordDetector::new(shortcut.chord, shortcut.hold),
            shortcut,
            taskbar: Taskbar::new(),
            ticks: 0,
            nav: None,
            remote: false,
            keyboard_open: false,
            mouse: None,
        })
    });

    // SAFETY : appels Win32 classiques ; chaînes terminées par un zéro et gardées en vie.
    unsafe {
        // Coordonnées réelles de l'écran (affichage à 125 %, etc.) pour le mode souris.
        SetProcessDPIAware();
        let instance = GetModuleHandleW(null());
        let class_name = wide(CLASS_NAME);
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
        copy_wide(&mut icon.szInfo, &format!("Appuie sur {} pour ouvrir Playscreen.", shortcut.label));
        icon.dwInfoFlags = NIIF_INFO;
        Shell_NotifyIconW(NIM_ADD, &icon);
        actions::log(&format!("Prête ({description}). {} pour ouvrir Playscreen.", shortcut.label));

        SetTimer(hwnd, TIMER_ID, POLL_INTERVAL.as_millis() as u32, None);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        Shell_NotifyIconW(NIM_DELETE, &icon_data(hwnd));
        STATE.with(|s| {
            if let Some(state) = s.borrow_mut().as_mut() {
                state.taskbar.restore();
            }
        });
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match message {
        WM_TIMER if wparam == TIMER_ID => {
            STATE.with(|s| {
                if let Some(state) = s.borrow_mut().as_mut() {
                    let now = Instant::now();
                    // Barre des tâches : vérifiée environ une fois par seconde.
                    state.ticks = state.ticks.wrapping_add(1);
                    if state.ticks.is_multiple_of(60) {
                        let open = actions::playscreen_open(&state.config);
                        state.taskbar.update(open);
                    }
                    let pad = state.source.pad();
                    // Clavier : vérifié environ 4 fois par seconde.
                    if state.ticks.is_multiple_of(15) {
                        let was_open = state.keyboard_open;
                        // Le clavier ne lit lui-même que les manettes XInput ; avec une manette
                        // Switch ou PS4, on garde la souris pour cliquer sur ses touches.
                        state.keyboard_open = touch_keyboard::is_visible() && state.source.xinput_present();
                        if was_open && !state.keyboard_open {
                            // Clavier refermé : un bouton encore enfoncé ne compte pas.
                            if let Some((mapper, _)) = state.mouse.as_mut() {
                                *mapper = MouseMapper::new();
                                mapper.step(pad, 0.0);
                            }
                            state.nav = None;
                        }
                    }
                    if state.detector.update(pad.buttons, now) {
                        // Le méta-raccourci termine aussi le mode souris : retour à Playscreen.
                        if let Some((mut mapper, _)) = state.mouse.take() {
                            send_mouse(&mapper.release_all());
                            actions::log(&format!("Mode souris terminé ({})", state.shortcut.label));
                        }
                        state.remote = false;
                        actions::launch_or_focus(&state.config);
                    } else if state.keyboard_open {
                        // Le clavier manette de Windows lit la manette lui-même.
                    } else if let Some((mapper, last)) = state.mouse.as_mut() {
                        let step = mapper.step(pad, now.duration_since(*last).as_secs_f32());
                        send_mouse(&step);
                        if step.toggle_keyboard {
                            std::thread::spawn(touch_keyboard::toggle);
                        }
                        *last = now;
                        state.nav = None;
                    } else if state.remote || actions::playscreen_in_front(&state.config) {
                        let (nav, last) = state.nav.get_or_insert_with(|| {
                            let mut nav = NavMapper::new();
                            nav.reset(pad);
                            (nav, now)
                        });
                        let keys = nav.step(pad, now.duration_since(*last).as_secs_f32());
                        *last = now;
                        send_nav(&keys);
                    } else {
                        state.nav = None;
                    }
                }
            });
            0
        }
        WM_MOUSE_MODE => {
            STATE.with(|s| {
                if let Some(state) = s.borrow_mut().as_mut() {
                    // Quitter le mode précédent (relâcher un clic encore enfoncé).
                    if let Some((mut mapper, _)) = state.mouse.take() {
                        send_mouse(&mapper.release_all());
                    }
                    state.remote = false;
                    state.nav = None;
                    match wparam {
                        1 => {
                            state.mouse = Some((MouseMapper::new(), Instant::now()));
                            actions::log("Mode souris activé");
                        }
                        2 => {
                            state.remote = true;
                            actions::log("Mode télécommande activé");
                        }
                        _ => actions::log("Manette normale"),
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
    copy_wide(&mut data.szTip, "Playscreen : la manette ouvre Playscreen");
    data
}

/// Envoie à Windows ce que la manette fait faire à la souris.
fn send_mouse(step: &MouseStep) {
    let mut inputs = Vec::new();
    let mouse = |flags: u32, dx: i32, dy: i32, data: i32| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 { mi: MOUSEINPUT { dx, dy, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    };
    let mut push = |input: INPUT| inputs.push(input);
    if step.dx != 0 || step.dy != 0 {
        // Position calculée nous-mêmes : un déplacement relatif subirait en plus
        // l'accélération du pointeur de Windows (curseur impossible à viser).
        let mut cursor = POINT { x: 0, y: 0 };
        // SAFETY : simple lecture / écriture de la position du curseur.
        unsafe {
            GetCursorPos(&mut cursor);
            SetCursorPos(cursor.x + step.dx, cursor.y + step.dy);
        }
    }
    if step.left_down {
        push(mouse(MOUSEEVENTF_LEFTDOWN, 0, 0, 0));
    }
    if step.left_up {
        push(mouse(MOUSEEVENTF_LEFTUP, 0, 0, 0));
    }
    if step.right_down {
        push(mouse(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0));
    }
    if step.right_up {
        push(mouse(MOUSEEVENTF_RIGHTUP, 0, 0, 0));
    }
    if step.wheel != 0 {
        push(mouse(MOUSEEVENTF_WHEEL, 0, 0, step.wheel));
    }
    if step.hwheel != 0 {
        push(mouse(MOUSEEVENTF_HWHEEL, 0, 0, step.hwheel));
    }
    if step.zoom != 0 {
        // Ctrl + molette : zoom des pages web et de la plupart des applications.
        push(key(VK_CONTROL, false));
        push(mouse(MOUSEEVENTF_WHEEL, 0, 0, step.zoom * 120));
        push(key(VK_CONTROL, true));
    }
    if step.escape {
        push(key(VK_ESCAPE, false));
        push(key(VK_ESCAPE, true));
    }
    for k in &step.keys {
        let code = match k {
            Key::Up => VK_UP,
            Key::Down => VK_DOWN,
            Key::Left => VK_LEFT,
            Key::Right => VK_RIGHT,
            Key::Enter => VK_RETURN,
        };
        push(key(code, false));
        push(key(code, true));
    }
    if !inputs.is_empty() {
        // SAFETY : tableau de structures INPUT valides, taille exacte.
        unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    }
}

/// Touches pour l'interface Playscreen (ui/src/input/gamepad.ts les comprend déjà).
fn send_nav(keys: &[NavKey]) {
    if keys.is_empty() {
        return;
    }
    let mut inputs = Vec::new();
    for k in keys {
        let code = match k {
            NavKey::Up => VK_UP,
            NavKey::Down => VK_DOWN,
            NavKey::Left => VK_LEFT,
            NavKey::Right => VK_RIGHT,
            NavKey::Enter => VK_RETURN,
            NavKey::Escape => VK_ESCAPE,
            NavKey::X => 0x58,
            NavKey::Y => 0x59,
            NavKey::M => 0x4D,
            NavKey::PageUp => VK_PRIOR,
            NavKey::PageDown => VK_NEXT,
        };
        inputs.push(key(code, false));
        inputs.push(key(code, true));
    }
    // SAFETY : tableau de structures INPUT valides, taille exacte.
    unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
}

fn key(code: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: code, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 },
        },
    }
}

/// `--mouse` / `--mouse-off` : prévient la sentinelle déjà lancée. Faux si elle ne tourne pas.
pub fn send_mouse_mode(on: bool) -> bool {
    let class_name = wide(CLASS_NAME);
    // SAFETY : chaîne terminée par un zéro ; message simple sans pointeur.
    unsafe {
        let hwnd = FindWindowW(class_name.as_ptr(), null());
        !hwnd.is_null() && PostMessageW(hwnd, WM_MOUSE_MODE, on as usize, 0) != 0
    }
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
