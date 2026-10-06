//! Détection du méta-raccourci : par défaut Select + Y, dès l'appui (choix de la personne,
//! 6 octobre 2026 : Select + Start maintenus fait changer de mode certaines manettes, comme la
//! GameSir Nova 2 Lite : Switch → PS4 → Xbox). Select + Start reste possible en réglage.
//! Logique pure, indépendante de Windows, testée unitairement.

use std::time::{Duration, Instant};

/// Boutons de manette, au format XInput (les autres sources s'y ramènent).
pub mod buttons {
    pub const START: u16 = 0x0010;
    /// « Select », « View » (Xbox) ou « Create/Share » (PlayStation).
    pub const BACK: u16 = 0x0020;
    pub const Y: u16 = 0x8000;
}

pub const META_CHORD: u16 = buttons::START | buttons::BACK;

/// Combinaison du méta-raccourci et durée de maintien.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Shortcut {
    pub chord: u16,
    pub hold: Duration,
    pub label: &'static str,
}

/// Select + Y, sans maintien : le choix par défaut.
pub const SELECT_Y: Shortcut = Shortcut { chord: buttons::BACK | buttons::Y, hold: Duration::ZERO, label: "Select + Y" };
/// Select + Start, maintenus une demi-seconde (avant le changement de mode de certaines manettes).
pub const SELECT_START: Shortcut =
    Shortcut { chord: META_CHORD, hold: Duration::from_millis(500), label: "Select + Start (maintenus)" };

impl Shortcut {
    /// « select+y » ou « select+start » (réglage PLAYSCREEN_SHORTCUT) ; Select + Y sinon.
    pub fn parse(text: Option<&str>) -> Shortcut {
        match text.map(|t| t.trim().to_ascii_lowercase()) {
            Some(t) if t == "select+start" => SELECT_START,
            _ => SELECT_Y,
        }
    }
}

/// Déclenche une seule fois par appui maintenu : il faut relâcher pour réarmer.
#[derive(Debug)]
pub struct ChordDetector {
    chord: u16,
    hold: Duration,
    pressed_since: Option<Instant>,
    fired: bool,
}

impl ChordDetector {
    pub fn new(chord: u16, hold: Duration) -> Self {
        Self { chord, hold, pressed_since: None, fired: false }
    }

    /// `pressed` : boutons enfoncés, toutes manettes confondues.
    /// Retourne `true` au moment exact où le raccourci est validé.
    pub fn update(&mut self, pressed: u16, now: Instant) -> bool {
        if pressed & self.chord != self.chord {
            self.pressed_since = None;
            self.fired = false;
            return false;
        }
        let since = *self.pressed_since.get_or_insert(now);
        if !self.fired && now.duration_since(since) >= self.hold {
            self.fired = true;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn select_y_declenche_des_l_appui() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(SELECT_Y.chord, SELECT_Y.hold);
        assert!(!d.update(buttons::BACK, t0), "Select seul ne suffit pas");
        assert!(d.update(buttons::BACK | buttons::Y, t0));
        assert!(!d.update(buttons::BACK | buttons::Y, t0 + ms(500)), "une seule fois par appui");
    }

    #[test]
    fn reglage_du_raccourci() {
        assert_eq!(Shortcut::parse(None), SELECT_Y);
        assert_eq!(Shortcut::parse(Some(" Select+Start ")), SELECT_START);
        assert_eq!(Shortcut::parse(Some("n'importe quoi")), SELECT_Y);
    }

    #[test]
    fn declenche_apres_la_duree_de_maintien() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(META_CHORD, ms(1000));
        assert!(!d.update(META_CHORD, t0));
        assert!(!d.update(META_CHORD, t0 + ms(999)));
        assert!(d.update(META_CHORD, t0 + ms(1000)));
    }

    #[test]
    fn ne_declenche_qu_une_fois_par_appui() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(META_CHORD, ms(1000));
        d.update(META_CHORD, t0);
        assert!(d.update(META_CHORD, t0 + ms(1000)));
        assert!(!d.update(META_CHORD, t0 + ms(5000)));
        // Relâcher puis réappuyer réarme.
        d.update(0, t0 + ms(5001));
        d.update(META_CHORD, t0 + ms(6000));
        assert!(d.update(META_CHORD, t0 + ms(7000)));
    }

    #[test]
    fn un_seul_bouton_ne_suffit_pas() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(META_CHORD, ms(1000));
        d.update(buttons::START, t0);
        assert!(!d.update(buttons::START, t0 + ms(2000)));
        d.update(buttons::BACK, t0 + ms(2001));
        assert!(!d.update(buttons::BACK, t0 + ms(4000)));
    }

    #[test]
    fn relacher_avant_la_fin_annule() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(META_CHORD, ms(1000));
        d.update(META_CHORD, t0);
        d.update(buttons::START, t0 + ms(800));
        assert!(!d.update(META_CHORD, t0 + ms(1200)));
        assert!(d.update(META_CHORD, t0 + ms(2200)));
    }

    #[test]
    fn d_autres_boutons_enfonces_n_empechent_pas() {
        let t0 = Instant::now();
        let mut d = ChordDetector::new(META_CHORD, ms(1000));
        let with_a = META_CHORD | 0x1000;
        d.update(with_a, t0);
        assert!(d.update(with_a, t0 + ms(1000)));
    }
}
