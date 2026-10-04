//! Sentinelle Playscreen (voir docs/decisions.md, D6).
//! Tourne en permanence, sans fenêtre, et écoute le méta-raccourci
//! Select + Start maintenus 1 s pour lancer ou ramener Playscreen.

// Pas de console en version finale sous Windows.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod actions;
mod chord;
mod input;

use std::thread::sleep;
use std::time::{Duration, Instant};

use chord::{ChordDetector, DEFAULT_HOLD, META_CHORD};
use input::{DefaultSource, GamepadSource};

/// ~60 Hz : assez réactif, coût CPU négligeable.
const POLL_INTERVAL: Duration = Duration::from_millis(16);

fn main() {
    let config = actions::Config::from_env();
    let mut source = DefaultSource;
    let mut detector = ChordDetector::new(META_CHORD, DEFAULT_HOLD);

    // Phase 4 : remplacer par une notification Windows avec les pictogrammes de la manette.
    actions::log("Prête. Maintiens Select + Start pour ouvrir Playscreen.");

    loop {
        if detector.update(source.pressed_buttons(), Instant::now()) {
            actions::launch_or_focus(&config);
        }
        sleep(POLL_INTERVAL);
    }
}
