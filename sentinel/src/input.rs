//! Lecture des manettes en arrière-plan.
//! Windows : SDL2 si SDL2.dll est à côté de la sentinelle (toutes les manettes : Switch,
//! PlayStation, Xbox…), sinon XInput (manettes Xbox et compatibles). Les deux marchent sans
//! focus. Hors Windows : aucune manette (pour compiler et tester la logique partout).

use crate::mouse::PadState;

pub trait GamepadSource {
    /// Boutons de toutes les manettes réunis (format XInput), sticks et gâchettes.
    fn pad(&mut self) -> PadState;

    /// Une manette XInput (Xbox) est-elle branchée ? Le clavier manette de Windows ne lit
    /// que celles-là.
    #[cfg_attr(not(windows), allow(dead_code))]
    fn xinput_present(&self) -> bool;

    /// Nombre de manettes branchées (toutes méthodes de lecture réunies).
    #[cfg_attr(not(windows), allow(dead_code))]
    fn pad_count(&self) -> usize;
}

#[cfg(windows)]
pub use windows_source::Source as DefaultSource;

#[cfg(not(windows))]
pub use null::NullSource as DefaultSource;

#[cfg(windows)]
mod windows_source {
    use super::GamepadSource;
    use crate::mouse::PadState;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE, XUSER_MAX_COUNT};

    /// Emplacements XInput occupés (un bit par emplacement). Lire un emplacement vide coûte
    /// cher à Windows (recherche de périphérique) : on ne lit à chaque tour que les occupés,
    /// et les vides toutes les 2 secondes.
    static CONNECTED: AtomicU8 = AtomicU8::new(0);
    static LAST_SCAN: Mutex<Option<Instant>> = Mutex::new(None);
    const SCAN_EVERY: Duration = Duration::from_secs(2);

    fn slots_to_read() -> u8 {
        let mut last = LAST_SCAN.lock().unwrap_or_else(|e| e.into_inner());
        if last.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            *last = Some(Instant::now());
            0b1111
        } else {
            CONNECTED.load(Ordering::Relaxed)
        }
    }

    /// Lit un emplacement et met à jour la liste des occupés.
    fn read_slot(slot: u32) -> Option<XINPUT_STATE> {
        // SAFETY : structure C sans pointeur, valide une fois remplie de zéros.
        let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
        // 0 = ERROR_SUCCESS ; sinon manette absente sur cet emplacement.
        let ok = unsafe { XInputGetState(slot, &mut state) } == 0;
        if ok {
            CONNECTED.fetch_or(1 << slot, Ordering::Relaxed);
            Some(state)
        } else {
            CONNECTED.fetch_and(!(1 << slot), Ordering::Relaxed);
            None
        }
    }

    pub enum Source {
        Sdl(crate::sdl::Shared),
        XInput,
    }

    impl Source {
        /// SDL si possible, XInput sinon.
        pub fn new() -> Self {
            match crate::sdl::start() {
                Some(shared) => Source::Sdl(shared),
                None => Source::XInput,
            }
        }

        /// Pour le journal : méthode de lecture et manettes branchées.
        pub fn describe(&self) -> String {
            match self {
                Source::Sdl(shared) => format!("SDL, {} manette(s)", shared.count()),
                Source::XInput => {
                    xinput_pad();
                    format!("XInput, {} manette(s)", xinput_count())
                }
            }
        }
    }

    /// Manettes XInput connues (mis à jour par les lectures, au plus 2 secondes de retard).
    fn xinput_count() -> usize {
        CONNECTED.load(Ordering::Relaxed).count_ones() as usize
    }

    /// Toutes les manettes XInput réunies (boutons, gâchettes) ; sticks de celle qu'on bouge.
    fn xinput_pad() -> PadState {
        let mut pad = PadState::default();
        let mut sticks_taken = false;
        let slots = slots_to_read();
        for slot in 0..XUSER_MAX_COUNT {
            if slots & (1 << slot) == 0 {
                continue;
            }
            let Some(state) = read_slot(slot) else {
                continue;
            };
            let g = state.Gamepad;
            pad.buttons |= g.wButtons;
            // Sticks de la première manette qu'on bouge (une autre peut être posée à côté).
            let moved = [g.sThumbLX, g.sThumbLY, g.sThumbRX, g.sThumbRY].iter().any(|v| v.unsigned_abs() > 6000);
            if !sticks_taken && moved {
                pad.left_x = g.sThumbLX;
                pad.left_y = g.sThumbLY;
                pad.right_x = g.sThumbRX;
                pad.right_y = g.sThumbRY;
                sticks_taken = true;
            }
            // Gâchettes XInput : 0 à 255 ; PadState : 0 à 32767.
            pad.left_trigger = pad.left_trigger.max(g.bLeftTrigger as u16 * 128);
            pad.right_trigger = pad.right_trigger.max(g.bRightTrigger as u16 * 128);
        }
        pad
    }

    impl GamepadSource for Source {
        fn pad(&mut self) -> PadState {
            let x = xinput_pad();
            match self {
                // SDL et XInput réunis : SDL ne lit pas toujours une manette XInput en
                // arrière-plan (GameSir en mode Xbox, 6 octobre 2026), XInput ne lit pas les
                // manettes Switch ou PS4.
                Source::Sdl(shared) => {
                    let mut pad = shared.pad();
                    pad.buttons |= x.buttons;
                    let still = [pad.left_x, pad.left_y, pad.right_x, pad.right_y].iter().all(|v| v.unsigned_abs() < 6000);
                    if still {
                        pad.left_x = x.left_x;
                        pad.left_y = x.left_y;
                        pad.right_x = x.right_x;
                        pad.right_y = x.right_y;
                    }
                    pad.left_trigger = pad.left_trigger.max(x.left_trigger);
                    pad.right_trigger = pad.right_trigger.max(x.right_trigger);
                    pad
                }
                Source::XInput => x,
            }
        }

        fn xinput_present(&self) -> bool {
            xinput_count() > 0
        }

        fn pad_count(&self) -> usize {
            match self {
                Source::Sdl(shared) => shared.count().max(xinput_count()),
                Source::XInput => xinput_count(),
            }
        }
    }
}

#[cfg(not(windows))]
mod null {
    use super::GamepadSource;
    use crate::mouse::PadState;

    /// Hors Windows : aucune manette.
    pub struct NullSource;

    impl GamepadSource for NullSource {
        fn pad(&mut self) -> PadState {
            PadState::default()
        }

        fn xinput_present(&self) -> bool {
            false
        }

        fn pad_count(&self) -> usize {
            0
        }
    }
}
