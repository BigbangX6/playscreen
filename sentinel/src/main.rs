//! Sentinelle Playscreen (voir docs/decisions.md, D6).
//! Tourne en permanence, sans fenêtre, et écoute le méta-raccourci (Select + Y par défaut,
//! réglage PLAYSCREEN_SHORTCUT) pour lancer ou ramener Playscreen.

// Pas de console en version finale sous Windows.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod actions;
mod chord;
mod input;
// Utilisés par la boucle Windows (tray.rs) ; hors Windows, seulement par les tests.
#[cfg_attr(not(windows), allow(dead_code))]
mod mouse;
#[cfg_attr(not(windows), allow(dead_code))]
mod taskbar;
#[cfg(windows)]
mod sdl;
mod touch_keyboard;
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
    // `--mouse` / `--mouse-off` : demande à la sentinelle qui tourne d'entrer dans le mode
    // souris ou d'en sortir (Playscreen le fait lui-même pour les relais).
    if std::env::args().any(|arg| arg == "--mouse") {
        std::process::exit(if tray::send_mouse_mode(true) { 0 } else { 1 });
    }
    if std::env::args().any(|arg| arg == "--mouse-off") {
        std::process::exit(if tray::send_mouse_mode(false) { 0 } else { 1 });
    }
    tray::run(config);
}

/// Hors Windows : même boucle, sans icône ni notification (aucune manette n'est lue).
#[cfg(not(windows))]
fn main() {
    use chord::{ChordDetector, Shortcut};
    use input::{DefaultSource, GamepadSource};
    use std::time::Instant;

    let config = actions::Config::from_env();
    let mut source = DefaultSource;
    let shortcut = Shortcut::parse(std::env::var("PLAYSCREEN_SHORTCUT").ok().as_deref());
    let mut detector = ChordDetector::new(shortcut.chord, shortcut.hold);
    actions::log("Prête. Maintiens Select + Start pour ouvrir Playscreen.");
    loop {
        if detector.update(source.pad().buttons, Instant::now()) {
            actions::launch_or_focus(&config);
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}
