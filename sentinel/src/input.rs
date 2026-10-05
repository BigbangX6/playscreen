//! Lecture des manettes en arrière-plan.
//! Windows : XInput (manettes Xbox et compatibles), qui fonctionne même sans focus.
//! À venir : DualSense / Switch Pro via HID ou SDL (phase 4).

/// Retourne les boutons enfoncés, toutes manettes confondues (format XInput).
pub trait GamepadSource {
    fn pressed_buttons(&mut self) -> u16;
}

#[cfg(windows)]
pub use xinput::XInputSource as DefaultSource;

#[cfg(not(windows))]
pub use null::NullSource as DefaultSource;

#[cfg(windows)]
mod xinput {
    use super::GamepadSource;
    use windows_sys::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE, XUSER_MAX_COUNT};

    pub struct XInputSource;

    impl XInputSource {
        /// Nombre de manettes XInput branchées (pour le journal).
        pub fn connected_count() -> usize {
            (0..XUSER_MAX_COUNT)
                .filter(|&slot| {
                    // SAFETY : voir pressed_buttons.
                    let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                    unsafe { XInputGetState(slot, &mut state) == 0 }
                })
                .count()
        }
    }

    impl XInputSource {
        /// État complet (sticks compris) de la première manette branchée : mode souris.
        pub fn first_pad() -> Option<crate::mouse::PadState> {
            (0..XUSER_MAX_COUNT).find_map(|slot| {
                // SAFETY : voir pressed_buttons.
                let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                if unsafe { XInputGetState(slot, &mut state) } != 0 {
                    return None;
                }
                let pad = state.Gamepad;
                Some(crate::mouse::PadState {
                    buttons: pad.wButtons,
                    left_x: pad.sThumbLX,
                    left_y: pad.sThumbLY,
                    right_x: pad.sThumbRX,
                    right_y: pad.sThumbRY,
                })
            })
        }
    }

    impl GamepadSource for XInputSource {
        fn pressed_buttons(&mut self) -> u16 {
            let mut pressed = 0u16;
            for slot in 0..XUSER_MAX_COUNT {
                // SAFETY : structure C sans pointeur, valide une fois remplie de zéros.
                let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                // 0 = ERROR_SUCCESS ; sinon manette absente sur ce slot.
                if unsafe { XInputGetState(slot, &mut state) } == 0 {
                    pressed |= state.Gamepad.wButtons;
                }
            }
            pressed
        }
    }
}

#[cfg(not(windows))]
mod null {
    use super::GamepadSource;

    /// Hors Windows : aucune manette (permet de compiler et tester la logique partout).
    pub struct NullSource;

    impl GamepadSource for NullSource {
        fn pressed_buttons(&mut self) -> u16 {
            0
        }
    }
}
