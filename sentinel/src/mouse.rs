//! Mode souris (relais, mode assisté) : la manette pilote la souris de Windows.
//! Stick gauche : déplacer (lent près du centre, rapide au bord) ; A : clic gauche (maintenir
//! pour glisser) ; B : clic droit ; stick droit : défiler ; Y : clavier manette de Windows.
//! Logique pure, indépendante de Windows, testée unitairement.

use crate::chord::buttons;

/// État d'une manette au format XInput (sticks de -32768 à 32767).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PadState {
    pub buttons: u16,
    pub left_x: i16,
    pub left_y: i16,
    pub right_x: i16,
    pub right_y: i16,
}

/// Ce que la souris doit faire pendant ce pas.
#[derive(Debug, Default, PartialEq)]
pub struct MouseStep {
    /// Déplacement en pixels (y vers le bas, comme l'écran).
    pub dx: i32,
    pub dy: i32,
    /// Molette : crans de 120 (vertical : positif = vers le haut ; horizontal : vers la droite).
    pub wheel: i32,
    pub hwheel: i32,
    pub left_down: bool,
    pub left_up: bool,
    pub right_down: bool,
    pub right_up: bool,
    pub toggle_keyboard: bool,
}

/// Zone morte des sticks : en dessous, la manette au repos ne doit pas faire bouger la souris.
const DEADZONE: f32 = 0.18;
/// Vitesse maximale du curseur (pixels par seconde, stick au bord).
const MAX_SPEED: f32 = 1400.0;
/// Défilement maximal (crans de molette par seconde, stick au bord).
const MAX_SCROLL: f32 = 12.0;
const WHEEL_DELTA: f32 = 120.0;

pub mod pad {
    pub const A: u16 = 0x1000;
    pub const B: u16 = 0x2000;
    pub const Y: u16 = 0x8000;
}

/// Garde ce qui doit survivre d'un pas à l'autre : boutons précédents, fractions de pixel.
#[derive(Debug, Default)]
pub struct MouseMapper {
    previous: u16,
    rest_x: f32,
    rest_y: f32,
    rest_wheel: f32,
    rest_hwheel: f32,
}

/// -1 à 1 après zone morte, avec une courbe (précis près du centre).
fn axis(value: i16) -> f32 {
    let v = (value as f32 / 32767.0).clamp(-1.0, 1.0);
    let magnitude = v.abs();
    if magnitude < DEADZONE {
        return 0.0;
    }
    let scaled = (magnitude - DEADZONE) / (1.0 - DEADZONE);
    scaled.powf(2.2) * v.signum()
}

impl MouseMapper {
    pub fn new() -> Self {
        Self::default()
    }

    /// `seconds` : temps écoulé depuis le pas précédent.
    pub fn step(&mut self, state: PadState, seconds: f32) -> MouseStep {
        let mut step = MouseStep::default();

        self.rest_x += axis(state.left_x) * MAX_SPEED * seconds;
        // Stick vers le haut = y positif chez XInput, mais vers le haut de l'écran = y négatif.
        self.rest_y -= axis(state.left_y) * MAX_SPEED * seconds;
        step.dx = self.rest_x.trunc() as i32;
        step.dy = self.rest_y.trunc() as i32;
        self.rest_x -= step.dx as f32;
        self.rest_y -= step.dy as f32;

        self.rest_wheel += axis(state.right_y) * MAX_SCROLL * WHEEL_DELTA * seconds;
        self.rest_hwheel += axis(state.right_x) * MAX_SCROLL * WHEEL_DELTA * seconds;
        step.wheel = self.rest_wheel.trunc() as i32;
        step.hwheel = self.rest_hwheel.trunc() as i32;
        self.rest_wheel -= step.wheel as f32;
        self.rest_hwheel -= step.hwheel as f32;

        let pressed = |b: u16| state.buttons & b != 0 && self.previous & b == 0;
        let released = |b: u16| state.buttons & b == 0 && self.previous & b != 0;
        step.left_down = pressed(pad::A);
        step.left_up = released(pad::A);
        step.right_down = pressed(pad::B);
        step.right_up = released(pad::B);
        // Y avec Select ou Start enfoncé ne compte pas : on ne veut pas gêner le méta-raccourci.
        step.toggle_keyboard = pressed(pad::Y) && state.buttons & (buttons::START | buttons::BACK) == 0;
        self.previous = state.buttons;
        step
    }

    /// Boutons encore enfoncés à la sortie du mode : à relâcher pour ne pas laisser un clic bloqué.
    pub fn release_all(&mut self) -> MouseStep {
        let step = MouseStep {
            left_up: self.previous & pad::A != 0,
            right_up: self.previous & pad::B != 0,
            ..MouseStep::default()
        };
        *self = Self::default();
        step
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stick(x: i16, y: i16) -> PadState {
        PadState { left_x: x, left_y: y, ..PadState::default() }
    }

    #[test]
    fn la_manette_au_repos_ne_bouge_pas_la_souris() {
        let mut m = MouseMapper::new();
        let step = m.step(stick(3000, -3000), 1.0);
        assert_eq!((step.dx, step.dy), (0, 0));
    }

    #[test]
    fn stick_au_bord_va_a_la_vitesse_maximale() {
        let mut m = MouseMapper::new();
        let step = m.step(stick(32767, 0), 0.5);
        assert_eq!(step.dx, (MAX_SPEED * 0.5) as i32);
        // Vers le haut du stick = vers le haut de l'écran.
        let step = m.step(stick(0, 32767), 0.5);
        assert_eq!(step.dy, -((MAX_SPEED * 0.5) as i32));
    }

    #[test]
    fn les_petits_mouvements_s_accumulent() {
        let mut m = MouseMapper::new();
        let total: i32 = (0..100).map(|_| m.step(stick(9000, 0), 0.016).dx).sum();
        assert!(total > 0, "un stick à peine poussé finit par déplacer le curseur");
    }

    #[test]
    fn a_clique_a_l_appui_et_relache_au_relachement() {
        let mut m = MouseMapper::new();
        let down = m.step(PadState { buttons: pad::A, ..PadState::default() }, 0.016);
        assert!(down.left_down && !down.left_up);
        let held = m.step(PadState { buttons: pad::A, ..PadState::default() }, 0.016);
        assert!(!held.left_down && !held.left_up, "maintenir A permet de glisser");
        let up = m.step(PadState::default(), 0.016);
        assert!(up.left_up);
    }

    #[test]
    fn y_ouvre_le_clavier_mais_pas_pendant_le_meta_raccourci() {
        let mut m = MouseMapper::new();
        assert!(m.step(PadState { buttons: pad::Y, ..PadState::default() }, 0.016).toggle_keyboard);
        m.step(PadState::default(), 0.016);
        let chord = buttons::START | buttons::BACK | pad::Y;
        assert!(!m.step(PadState { buttons: chord, ..PadState::default() }, 0.016).toggle_keyboard);
    }

    #[test]
    fn sortir_du_mode_relache_les_boutons() {
        let mut m = MouseMapper::new();
        m.step(PadState { buttons: pad::A | pad::B, ..PadState::default() }, 0.016);
        let step = m.release_all();
        assert!(step.left_up && step.right_up);
    }

    #[test]
    fn stick_droit_defile() {
        let mut m = MouseMapper::new();
        let step = m.step(PadState { right_y: 32767, ..PadState::default() }, 1.0);
        assert_eq!(step.wheel, (MAX_SCROLL * WHEEL_DELTA) as i32);
    }
}
