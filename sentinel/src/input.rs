//! Lecture des manettes en arrière-plan.
//! Windows : SDL2 si SDL2.dll est à côté de la sentinelle (toutes les manettes : Switch,
//! PlayStation, Xbox…), sinon XInput (manettes Xbox et compatibles). Les deux marchent sans
//! focus. Hors Windows : aucune manette (pour compiler et tester la logique partout).

use crate::mouse::PadState;

pub trait GamepadSource {
    /// Boutons de toutes les manettes réunis (format XInput), sticks et gâchettes.
    fn pad(&mut self) -> PadState;
}

#[cfg(windows)]
pub use windows_source::Source as DefaultSource;

#[cfg(not(windows))]
pub use null::NullSource as DefaultSource;

#[cfg(windows)]
mod windows_source {
    use super::GamepadSource;
    use crate::mouse::PadState;
    use windows_sys::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE, XUSER_MAX_COUNT};

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
                Source::XInput => format!("XInput, {} manette(s)", xinput_count()),
            }
        }
    }

    fn xinput_count() -> usize {
        (0..XUSER_MAX_COUNT)
            .filter(|&slot| {
                // SAFETY : structure C sans pointeur, valide une fois remplie de zéros.
                let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                unsafe { XInputGetState(slot, &mut state) == 0 }
            })
            .count()
    }

    impl GamepadSource for Source {
        fn pad(&mut self) -> PadState {
            match self {
                Source::Sdl(shared) => shared.pad(),
                Source::XInput => {
                    let mut pad = PadState::default();
                    let mut sticks_taken = false;
                    for slot in 0..XUSER_MAX_COUNT {
                        // SAFETY : structure C sans pointeur, valide une fois remplie de zéros.
                        let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                        // 0 = ERROR_SUCCESS ; sinon manette absente sur ce slot.
                        if unsafe { XInputGetState(slot, &mut state) } != 0 {
                            continue;
                        }
                        let g = state.Gamepad;
                        pad.buttons |= g.wButtons;
                        if !sticks_taken {
                            pad.left_x = g.sThumbLX;
                            pad.left_y = g.sThumbLY;
                            pad.right_x = g.sThumbRX;
                            pad.right_y = g.sThumbRY;
                            // Gâchettes XInput : 0 à 255 ; PadState : 0 à 32767.
                            pad.left_trigger = g.bLeftTrigger as u16 * 128;
                            pad.right_trigger = g.bRightTrigger as u16 * 128;
                            sticks_taken = true;
                        }
                    }
                    pad
                }
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
    }
}
