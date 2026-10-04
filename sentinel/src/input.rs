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
    use windows::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE, XUSER_MAX_COUNT};

    pub struct XInputSource;

    impl GamepadSource for XInputSource {
        fn pressed_buttons(&mut self) -> u16 {
            let mut pressed = 0u16;
            for slot in 0..XUSER_MAX_COUNT {
                let mut state = XINPUT_STATE::default();
                // 0 = ERROR_SUCCESS ; sinon manette absente sur ce slot.
                if unsafe { XInputGetState(slot, &mut state) } == 0 {
                    pressed |= state.Gamepad.wButtons.0;
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
