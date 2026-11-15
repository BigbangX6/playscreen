//! Sentinelle Playscreen (voir docs/decisions.md, D6).
//! Tourne en permanence, sans fenêtre, et écoute le méta-raccourci (Select + Y par défaut,
//! réglage PLAYSCREEN_SHORTCUT) pour lancer ou ramener Playscreen.

// Pas de console en version finale sous Windows.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod actions;
#[cfg(windows)]
mod browser_watch;
mod chord;
#[cfg(windows)]
mod hint;
mod input;
// Utilisés par la boucle Windows (tray.rs) ; hors Windows, seulement par les tests.
#[cfg_attr(not(windows), allow(dead_code))]
mod mouse;
#[cfg_attr(not(windows), allow(dead_code))]
mod nav;
#[cfg_attr(not(windows), allow(dead_code))]
mod taskbar;
#[cfg(windows)]
mod sdl;
mod touch_keyboard;
#[cfg(windows)]
mod tray;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// ~60 Hz : quand Playscreen est ouvert, ou en mode souris (curseur fluide).
pub const POLL_ACTIVE: Duration = Duration::from_millis(16);
/// Veille (Playscreen fermé) : 20 lectures par seconde suffisent pour Select + Y.
pub const POLL_IDLE: Duration = Duration::from_millis(50);
/// Veille sans aucune manette branchée : on regarde seulement si une arrive.
pub const POLL_NO_PAD: Duration = Duration::from_millis(500);

/// Rythme de lecture courant (millisecondes), partagé avec le fil de SDL.
static POLL_MS: AtomicU64 = AtomicU64::new(16);

pub fn poll_interval() -> Duration {
    Duration::from_millis(POLL_MS.load(Ordering::Relaxed))
}

pub fn set_poll_interval(interval: Duration) {
    POLL_MS.store(interval.as_millis() as u64, Ordering::Relaxed);
}

#[cfg(windows)]
fn main() {
    let config = actions::Config::load();
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
    // `--quit` : arrête proprement la sentinelle qui tourne (barre des tâches rétablie) ;
    // utilisé par la désinstallation.
    if std::env::args().any(|arg| arg == "--quit") {
        std::process::exit(if tray::send_quit() { 0 } else { 1 });
    }
    // `--open` (raccourci « Playscreen » du menu Démarrer) : ouvre Playscreen, et garde la
    // sentinelle en marche pour Select + Y.
    let open = std::env::args().any(|arg| arg == "--open");
    // Une seule sentinelle : si elle tourne déjà, on lui transmet la demande et on s'arrête.
    if tray::already_running() {
        if open {
            tray::send_open();
        }
        return;
    }
    if open {
        actions::launch_or_focus(&config);
    }
    tray::run(config);
}

/// Hors Windows : même boucle, sans icône ni notification (aucune manette n'est lue).
#[cfg(not(windows))]
fn main() {
    use chord::{ChordDetector, Shortcut};
    use input::{DefaultSource, GamepadSource};
    use std::time::Instant;

    let config = actions::Config::load();
    let mut source = DefaultSource;
    let shortcut = Shortcut::parse(config.shortcut.as_deref());
    let mut detector = ChordDetector::new(shortcut.chord, shortcut.hold);
    actions::log("Prête. Maintiens Select + Start pour ouvrir Playscreen.");
    loop {
        if detector.update(source.pad().buttons, Instant::now()) {
            actions::launch_or_focus(&config);
        }
        std::thread::sleep(POLL_IDLE);
    }
}
