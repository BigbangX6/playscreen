//! Manette → touches pour l'interface Playscreen quand elle est au premier plan. La sentinelle
//! lit toutes les manettes (SDL + XInput) ; le moteur web de l'interface ne reconnaît pas
//! toutes les manettes (GameSir en mode PS4, constaté le 6 octobre 2026). L'interface comprend
//! déjà ces touches (ui/src/input/gamepad.ts) et ne lit plus la manette elle-même quand la
//! sentinelle tourne. Logique pure, testée unitairement.

use crate::chord::buttons;
use crate::mouse::PadState;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum NavKey {
    Up,
    Down,
    Left,
    Right,
    /// A
    Enter,
    /// B
    Escape,
    /// X (actions secondaires)
    X,
    /// Y (recherche)
    Y,
    /// Start (centre rapide)
    M,
    /// LB / RB (onglets)
    PageUp,
    PageDown,
}

const STICK_THRESHOLD: i16 = 16000;
const REPEAT_DELAY: f32 = 0.4;
const REPEAT: f32 = 0.12;

const BUTTONS: [(u16, NavKey); 11] = [
    (0x0001, NavKey::Up),
    (0x0002, NavKey::Down),
    (0x0004, NavKey::Left),
    (0x0008, NavKey::Right),
    (0x1000, NavKey::Enter),
    (0x2000, NavKey::Escape),
    (0x4000, NavKey::X),
    (0x8000, NavKey::Y),
    (0x0010, NavKey::M),
    (0x0100, NavKey::PageUp),
    (0x0200, NavKey::PageDown),
];

/// Directions répétées quand on les maintient (défiler une liste).
fn is_direction(key: NavKey) -> bool {
    matches!(key, NavKey::Up | NavKey::Down | NavKey::Left | NavKey::Right)
}

#[derive(Debug, Default)]
pub struct NavMapper {
    previous: u16,
    /// Direction maintenue et temps restant avant sa répétition.
    held: Option<(NavKey, f32)>,
}

impl NavMapper {
    pub fn new() -> Self {
        Self::default()
    }

    /// Le stick gauche compte comme la croix.
    fn with_stick(state: PadState) -> u16 {
        let mut b = state.buttons;
        if state.left_y > STICK_THRESHOLD {
            b |= 0x0001;
        }
        if state.left_y < -STICK_THRESHOLD {
            b |= 0x0002;
        }
        if state.left_x < -STICK_THRESHOLD {
            b |= 0x0004;
        }
        if state.left_x > STICK_THRESHOLD {
            b |= 0x0008;
        }
        b
    }

    pub fn step(&mut self, state: PadState, seconds: f32) -> Vec<NavKey> {
        let now = Self::with_stick(state);
        let mut keys = Vec::new();
        // Select enfoncé : méta-raccourci (Select + Y…), rien pour l'interface.
        if now & buttons::BACK != 0 {
            self.previous = now;
            self.held = None;
            return keys;
        }
        for (bit, key) in BUTTONS {
            if now & bit != 0 && self.previous & bit == 0 {
                keys.push(key);
                if is_direction(key) {
                    self.held = Some((key, REPEAT_DELAY));
                }
            }
        }
        if let Some((key, wait)) = self.held {
            let bit = BUTTONS.iter().find(|(_, k)| *k == key).map(|(b, _)| *b).unwrap_or(0);
            if now & bit == 0 {
                self.held = None;
            } else if !keys.contains(&key) {
                let wait = wait - seconds;
                if wait <= 0.0 {
                    keys.push(key);
                    self.held = Some((key, REPEAT));
                } else {
                    self.held = Some((key, wait));
                }
            }
        }
        self.previous = now;
        keys
    }

    /// Oublie l'état (au changement de fenêtre ou de mode) : un bouton déjà enfoncé ne
    /// comptera qu'une fois relâché puis réappuyé.
    pub fn reset(&mut self, state: PadState) {
        self.previous = Self::with_stick(state);
        self.held = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(bits: u16) -> PadState {
        PadState { buttons: bits, ..PadState::default() }
    }

    #[test]
    fn un_appui_une_touche() {
        let mut n = NavMapper::new();
        assert_eq!(n.step(b(0x1000), 0.016), vec![NavKey::Enter]);
        assert!(n.step(b(0x1000), 0.5).is_empty(), "A maintenu ne se répète pas");
        assert!(n.step(b(0), 0.016).is_empty());
        assert_eq!(n.step(b(0x2000), 0.016), vec![NavKey::Escape]);
    }

    #[test]
    fn direction_maintenue_se_repete() {
        let mut n = NavMapper::new();
        assert_eq!(n.step(b(0x0002), 0.016), vec![NavKey::Down]);
        assert!(n.step(b(0x0002), 0.1).is_empty());
        assert_eq!(n.step(b(0x0002), REPEAT_DELAY), vec![NavKey::Down]);
        assert_eq!(n.step(b(0x0002), REPEAT), vec![NavKey::Down]);
    }

    #[test]
    fn le_stick_gauche_fait_la_croix() {
        let mut n = NavMapper::new();
        let right = PadState { left_x: 30000, ..PadState::default() };
        assert_eq!(n.step(right, 0.016), vec![NavKey::Right]);
        let up = PadState { left_y: 30000, ..PadState::default() };
        n.step(PadState::default(), 0.016);
        assert_eq!(n.step(up, 0.016), vec![NavKey::Up]);
    }

    #[test]
    fn select_bloque_tout_pour_le_meta_raccourci() {
        let mut n = NavMapper::new();
        assert!(n.step(b(buttons::BACK | 0x8000), 0.016).is_empty(), "Select + Y n'est pas Y");
    }

    #[test]
    fn apres_reset_un_bouton_deja_enfonce_ne_compte_pas() {
        let mut n = NavMapper::new();
        n.reset(b(0x2000));
        assert!(n.step(b(0x2000), 0.016).is_empty());
    }
}
