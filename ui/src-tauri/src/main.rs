//! Coque Tauri de l'interface Playscreen (voir docs/decisions.md, D3 et D10).
//! Une seule fenêtre, plein écran sans bordure, titrée « Playscreen » (la sentinelle la
//! retrouve par ce titre). L'interface elle-même est dans ui/src (React).

// Pas de console en version finale sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod game_window;
mod relay;
mod touch_keyboard;

/// Met au premier plan une fenêtre de launcher signalée par le moteur (launcher.prompt).
#[tauri::command]
fn focus_window(handle: i64) -> bool {
    game_window::bring_to_front(handle)
}

use std::path::PathBuf;

/// Remet au premier plan la fenêtre du jeu installé dans `install_directory`.
/// Faux si aucune fenêtre du jeu n'est trouvée (le jeu a été fermé entre-temps, par ex.).
#[tauri::command]
fn focus_game(install_directory: String) -> bool {
    game_window::focus(&install_directory)
}

/// Port et jeton du moteur, écrits par la passerelle (ou le faux moteur) dans
/// %LOCALAPPDATA%\Playscreen\engine.json. Relu à chaque appel : le jeton change à
/// chaque démarrage du moteur.
#[tauri::command]
fn engine_info() -> Result<serde_json::Value, String> {
    let base = std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA introuvable")?;
    let path = PathBuf::from(base).join("Playscreen").join("engine.json");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// « Bureau Windows » : réduit la fenêtre (Playscreen reste en mémoire). La sentinelle la
/// restaure avec Select + Start.
#[tauri::command]
fn hide_to_desktop(window: tauri::WebviewWindow) -> bool {
    window.minimize().is_ok()
}

/// Clavier manette de Windows : ouvert quand un champ de texte a le focus, fermé ensuite.
#[tauri::command]
fn show_keyboard() -> bool {
    touch_keyboard::show()
}

#[tauri::command]
fn hide_keyboard() -> bool {
    touch_keyboard::hide()
}

/// Relais (Paramètres Windows, activation d'une clé) : ouvre la cible, manette en mode souris.
#[tauri::command]
fn start_relay(target: String) -> bool {
    relay::start(&target)
}

/// Fin du relais : la manette redevient une manette, la fenêtre ouverte est fermée ou réduite.
#[tauri::command]
fn end_relay(target: String) -> bool {
    relay::end(&target)
}

/// La sentinelle tourne-t-elle ? Elle lit alors la manette pour l'interface (toutes les
/// manettes) et l'interface ne la lit plus elle-même, pour éviter les doubles appuis.
#[tauri::command]
fn sentinel_running() -> bool {
    relay::sentinel_running()
}

fn main() {
    tauri::Builder::default()
        .manage(browser::BrowserState::default())
        .invoke_handler(tauri::generate_handler![engine_info, focus_game, focus_window, hide_to_desktop, show_keyboard, hide_keyboard, start_relay, end_relay, browser::browser_open, browser::browser_hide, sentinel_running])
        .run(tauri::generate_context!())
        .expect("échec du démarrage de l'interface Playscreen");
}
