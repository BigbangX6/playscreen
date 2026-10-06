//! Lecture des manettes par SDL2 (manettes Switch, PlayStation, Xbox, génériques), même sans
//! focus. SDL2.dll est chargée au démarrage si elle est à côté de la sentinelle ; sinon on
//! reste sur XInput (manettes Xbox seulement). Exemple : la GameSir Nova 2 Lite, en mode
//! Switch ou PS4, n'est pas vue par XInput (constaté le 6 octobre 2026).
//!
//! SDL tourne dans son propre fil : SDL_PumpEvents lit la file de messages Windows du fil
//! appelant, ce qui perturberait la boucle de messages de la sentinelle.

use std::ffi::{c_char, c_int, c_void, CStr};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::mouse::PadState;

type SetHint = unsafe extern "C" fn(*const c_char, *const c_char) -> c_int;
type Init = unsafe extern "C" fn(u32) -> c_int;
type Void = unsafe extern "C" fn();
type NumJoysticks = unsafe extern "C" fn() -> c_int;
type IsGameController = unsafe extern "C" fn(c_int) -> c_int;
type Open = unsafe extern "C" fn(c_int) -> *mut c_void;
type GetAttached = unsafe extern "C" fn(*mut c_void) -> c_int;
type GetButton = unsafe extern "C" fn(*mut c_void, c_int) -> u8;
type GetAxis = unsafe extern "C" fn(*mut c_void, c_int) -> i16;
type Close = unsafe extern "C" fn(*mut c_void);
type Name = unsafe extern "C" fn(*mut c_void) -> *const c_char;
type JoystickInstance = unsafe extern "C" fn(*mut c_void) -> *mut c_void;
type InstanceId = unsafe extern "C" fn(*mut c_void) -> i32;
type DeviceInstanceId = unsafe extern "C" fn(c_int) -> i32;

const SDL_INIT_GAMECONTROLLER: u32 = 0x0000_2000;

// Boutons et axes SDL_GameController.
const BUTTONS: [(c_int, u16); 15] = [
    (0, 0x1000),  // A
    (1, 0x2000),  // B
    (2, 0x4000),  // X
    (3, 0x8000),  // Y
    (4, 0x0020),  // BACK (Select)
    (5, 0x0400),  // GUIDE
    (6, 0x0010),  // START
    (7, 0x0040),  // LEFTSTICK
    (8, 0x0080),  // RIGHTSTICK
    (9, 0x0100),  // LEFTSHOULDER
    (10, 0x0200), // RIGHTSHOULDER
    (11, 0x0001), // DPAD_UP
    (12, 0x0002), // DPAD_DOWN
    (13, 0x0004), // DPAD_LEFT
    (14, 0x0008), // DPAD_RIGHT
];

struct Api {
    num_joysticks: NumJoysticks,
    is_game_controller: IsGameController,
    open: Open,
    get_attached: GetAttached,
    get_button: GetButton,
    get_axis: GetAxis,
    close: Close,
    name: Name,
    joystick: JoystickInstance,
    instance_id: InstanceId,
    device_instance_id: DeviceInstanceId,
    pump: Void,
}

/// État de toutes les manettes, partagé avec la sentinelle.
#[derive(Clone, Default)]
pub struct Shared {
    state: Arc<Mutex<(PadState, usize)>>,
}

impl Shared {
    /// Boutons de toutes les manettes réunis ; sticks de la première qui les bouge.
    pub fn pad(&self) -> PadState {
        self.state.lock().map(|s| s.0).unwrap_or_default()
    }

    pub fn count(&self) -> usize {
        self.state.lock().map(|s| s.1).unwrap_or(0)
    }
}

/// Démarre SDL dans son fil. None si SDL2.dll est absente ou ne démarre pas.
pub fn start() -> Option<Shared> {
    let shared = Shared::default();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let thread_shared = shared.clone();
    std::thread::spawn(move || {
        let api = match load() {
            Some(api) => api,
            None => {
                let _ = ready_tx.send(false);
                return;
            }
        };
        let _ = ready_tx.send(true);
        run(api, thread_shared);
    });
    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(true) => Some(shared),
        _ => None,
    }
}

#[cfg(windows)]
fn load() -> Option<Api> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    // À côté de l'exécutable de la sentinelle (pas dans le dossier courant).
    let dll = std::env::current_exe().ok()?.with_file_name("SDL2.dll");
    let wide: Vec<u16> = dll.as_os_str().to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY : chemin terminé par un zéro ; les fonctions sont prises avec leur signature
    // C documentée par SDL2.
    unsafe {
        let module = LoadLibraryW(wide.as_ptr());
        if module.is_null() {
            return None;
        }
        macro_rules! get {
            ($name:literal, $type:ty) => {{
                let f = GetProcAddress(module, concat!($name, "\0").as_ptr())?;
                std::mem::transmute::<unsafe extern "system" fn() -> isize, $type>(f)
            }};
        }
        let set_hint = get!("SDL_SetHint", SetHint);
        let init = get!("SDL_Init", Init);
        // Lire les manettes même quand une autre fenêtre a le focus.
        set_hint(c"SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS".as_ptr(), c"1".as_ptr());
        if init(SDL_INIT_GAMECONTROLLER) != 0 {
            return None;
        }
        Some(Api {
            num_joysticks: get!("SDL_NumJoysticks", NumJoysticks),
            is_game_controller: get!("SDL_IsGameController", IsGameController),
            open: get!("SDL_GameControllerOpen", Open),
            get_attached: get!("SDL_GameControllerGetAttached", GetAttached),
            get_button: get!("SDL_GameControllerGetButton", GetButton),
            get_axis: get!("SDL_GameControllerGetAxis", GetAxis),
            close: get!("SDL_GameControllerClose", Close),
            name: get!("SDL_GameControllerName", Name),
            joystick: get!("SDL_GameControllerGetJoystick", JoystickInstance),
            instance_id: get!("SDL_JoystickInstanceID", InstanceId),
            device_instance_id: get!("SDL_JoystickGetDeviceInstanceID", DeviceInstanceId),
            pump: get!("SDL_PumpEvents", Void),
        })
    }
}

#[cfg(not(windows))]
fn load() -> Option<Api> {
    None
}

fn run(api: Api, shared: Shared) {
    // (contrôleur ouvert, identifiant d'instance SDL)
    let mut open: Vec<(*mut c_void, i32)> = Vec::new();
    let mut tick = 0u32;
    loop {
        // SAFETY : fonctions SDL appelées depuis le seul fil qui utilise SDL.
        unsafe {
            (api.pump)();
            // Manettes branchées ou débranchées : vérifié deux fois par seconde.
            if tick.is_multiple_of(30) {
                open.retain(|&(c, _)| {
                    let attached = (api.get_attached)(c) != 0;
                    if !attached {
                        (api.close)(c);
                        crate::actions::log("Manette débranchée (SDL)");
                    }
                    attached
                });
                for index in 0..(api.num_joysticks)() {
                    let id = (api.device_instance_id)(index);
                    if (api.is_game_controller)(index) == 0 || open.iter().any(|&(_, i)| i == id) {
                        continue;
                    }
                    let controller = (api.open)(index);
                    if controller.is_null() {
                        continue;
                    }
                    let name = (api.name)(controller);
                    let name = if name.is_null() { "?".into() } else { CStr::from_ptr(name).to_string_lossy() };
                    crate::actions::log(&format!("Manette branchée (SDL) : {name}"));
                    let instance = (api.instance_id)((api.joystick)(controller));
                    open.push((controller, instance));
                }
            }
            let mut pad = PadState::default();
            let mut sticks_taken = false;
            for &(c, _) in &open {
                for (button, bit) in BUTTONS {
                    if (api.get_button)(c, button) != 0 {
                        pad.buttons |= bit;
                    }
                }
                // SDL : y vers le bas ; XInput (format de PadState) : y vers le haut.
                let lx = (api.get_axis)(c, 0);
                let ly = (api.get_axis)(c, 1).saturating_neg();
                let rx = (api.get_axis)(c, 2);
                let ry = (api.get_axis)(c, 3).saturating_neg();
                let moved = [lx, ly, rx, ry].iter().any(|v| v.unsigned_abs() > 6000);
                if !sticks_taken && moved {
                    pad.left_x = lx;
                    pad.left_y = ly;
                    pad.right_x = rx;
                    pad.right_y = ry;
                    sticks_taken = true;
                }
                pad.left_trigger = pad.left_trigger.max((api.get_axis)(c, 4).max(0) as u16);
                pad.right_trigger = pad.right_trigger.max((api.get_axis)(c, 5).max(0) as u16);
            }
            if let Ok(mut state) = shared.state.lock() {
                *state = (pad, open.len());
            }
        }
        tick = tick.wrapping_add(1);
        std::thread::sleep(crate::POLL_INTERVAL);
    }
}
