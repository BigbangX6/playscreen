//! Sentinelle Playscreen (voir docs/decisions.md, D6).
//! Tourne en permanence, sans fenêtre, et écoute le méta-raccourci
//! Select + Start maintenus 1 s pour lancer ou ramener Playscreen.

// Pas de console en version finale sous Windows.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod actions;
mod chord;
mod input;
#[cfg(windows)]
mod tray;

use std::time::Duration;

/// ~60 Hz : assez réactif, coût CPU négligeable.
pub const POLL_INTERVAL: Duration = Duration::from_millis(16);

#[cfg(windows)]
fn main() {
    let config = actions::Config::from_env();
    // `--focus` : fait une fois ce que fait Select + Start, puis s'arrête (tests, scripts).
    if std::env::args().any(|arg| arg == "--focus") {
        actions::launch_or_focus(&config);
        return;
    }
    tray::run(config);
}

/// Hors Windows : même boucle, sans icône ni notification (aucune manette n'est lue).
#[cfg(not(windows))]
fn main() {
    use chord::{ChordDetector, DEFAULT_HOLD, META_CHORD};
    use input::{DefaultSource, GamepadSource};
    use std::time::Instant;

    let config = actions::Config::from_env();
    let mut source = DefaultSource;
    let mut detector = ChordDetector::new(META_CHORD, DEFAULT_HOLD);
    actions::log("Prête. Maintiens Select + Start pour ouvrir Playscreen.");
    loop {
        if detector.update(source.pressed_buttons(), Instant::now()) {
            actions::launch_or_focus(&config);
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}
