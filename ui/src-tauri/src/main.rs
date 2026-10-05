//! Coque Tauri de l'interface Playscreen (voir docs/decisions.md, D3 et D10).
//! Une seule fenêtre, plein écran sans bordure, titrée « Playscreen » (la sentinelle la
//! retrouve par ce titre). L'interface elle-même est dans ui/src (React).

// Pas de console en version finale sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod game_window;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![engine_info, focus_game])
        .run(tauri::generate_context!())
        .expect("échec du démarrage de l'interface Playscreen");
}
