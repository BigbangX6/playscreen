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

/// Pendant une partie, le moteur web de l'interface rend un maximum de mémoire à Windows
/// (niveau « bas » de WebView2 : caches vidés, mémoire inutilisée relâchée) ; niveau normal
/// au retour sur Playscreen.
#[tauri::command]
fn set_memory_low(window: tauri::WebviewWindow, low: bool) -> bool {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows::core::Interface;
        let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
        window
            .with_webview(move |webview| {
                // SAFETY : appels COM sur le fil de la fenêtre, interfaces obtenues de WebView2.
                unsafe {
                    if let Ok(core) = webview.controller().CoreWebView2() {
                        if let Ok(core) = core.cast::<ICoreWebView2_19>() {
                            let _ = core.SetMemoryUsageTargetLevel(level);
                        }
                    }
                }
            })
            .is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = (window, low);
        false
    }
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

/// « Bureau Windows » : ferme Playscreen (le moteur est arrêté par l'interface). Seule la
/// sentinelle reste ; le méta-raccourci relance tout.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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

/// Souris manette oui / non (installation, désinstallation : fenêtres des launchers).
#[tauri::command]
fn set_mouse_mode(on: bool) -> bool {
    relay::set_mouse_mode(on)
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
        .invoke_handler(tauri::generate_handler![engine_info, focus_game, focus_window, quit_app, show_keyboard, hide_keyboard, start_relay, end_relay, set_mouse_mode, browser::browser_open, browser::browser_hide, browser::browser_close, sentinel_running, set_memory_low])
        // Croix de la fenêtre (barre des tâches, Alt + F4) : comme « Quitter Playscreen », le
        // moteur est arrêté aussi (sinon il restait en mémoire). L'interface s'en charge
        // (événement playscreen-close) ; si elle ne répond pas, on ferme au bout de 6 s.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri::{Emitter, Manager};
                api.prevent_close();
                let _ = window.emit("playscreen-close", ());
                let app = window.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    app.exit(0);
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("échec du démarrage de l'interface Playscreen");
}
