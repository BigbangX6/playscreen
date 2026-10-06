//! Navigateur Playscreen : les vrais sites (Boutique, Social, Musique, Internet), chacun dans une
//! fenêtre sans bordure, en plein écran, rattachée à Playscreen (au-dessus de lui, absente de la
//! barre des tâches). Une fenêtre par fenêtre du navigateur, gardée ouverte et cachée quand on
//! revient à Playscreen : la musique et l'appel Discord continuent.
//! Le site n'est pas modifié : la manette pilote la vraie souris (mode souris de la sentinelle :
//! A clic, B Échap, stick droit molette…) et le méta-raccourci ramène Playscreen. Le script
//! injecté (browser-pad.js) affiche seulement un gros curseur.
//! (Une vue ajoutée dans la fenêtre Playscreen, `add_child`, restait vide le 6 octobre 2026.)

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const CURSOR_SCRIPT: &str = include_str!("browser-pad.js");

/// Par fenêtre : dernière adresse demandée par l'interface.
#[derive(Default)]
pub struct BrowserState {
    views: Mutex<HashMap<String, String>>,
}

fn label(window: &str) -> String {
    format!("web-{window}")
}

/// Ouvre (ou montre) la fenêtre `window` du navigateur sur `url`, en plein écran, et passe la
/// manette en souris. `user_agent` : identité donnée au site (YouTube TV : une télé), seulement
/// à la création de la fenêtre. Une fenêtre déjà ouverte sur la même adresse n'est pas rechargée.
/// Asynchrone : sous Windows, créer une fenêtre web depuis une commande synchrone la bloque.
#[tauri::command]
pub async fn browser_open(app: AppHandle, window: String, url: String, user_agent: Option<String>) -> Result<(), String> {
    // YouTube TV (identité de télé) se pilote comme avec une télécommande ; les autres sites
    // avec la souris.
    let remote = user_agent.is_some();
    let result = open(&app, &window, &url, user_agent);
    if let Err(error) = &result {
        eprintln!("[navigateur] {window} {url} : {error}");
    } else if remote {
        crate::relay::set_remote_mode();
    } else {
        crate::relay::set_mouse_mode(true);
    }
    result
}

fn open(app: &AppHandle, window: &str, url: &str, user_agent: Option<String>) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("fenêtre principale introuvable")?;
    let position = main.inner_position().map_err(|e| e.to_string())?;
    let size = main.inner_size().map_err(|e| e.to_string())?;
    let label = label(window);
    let parsed = Url::parse(url).map_err(|e| e.to_string())?;
    let state = app.state::<BrowserState>();
    let mut views = state.views.lock().unwrap();

    // Une seule fenêtre du navigateur visible à la fois.
    for other in views.keys().filter(|l| **l != label) {
        if let Some(view) = app.get_webview_window(other) {
            let _ = view.hide();
        }
    }

    if let Some(view) = app.get_webview_window(&label) {
        if views.get(&label).map(String::as_str) != Some(url) {
            views.insert(label.clone(), url.to_string());
            view.navigate(parsed).map_err(|e| e.to_string())?;
        }
        view.set_position(position).map_err(|e| e.to_string())?;
        view.set_size(size).map_err(|e| e.to_string())?;
        view.show().map_err(|e| e.to_string())?;
        view.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title("Playscreen – navigateur")
        .decorations(false)
        .skip_taskbar(true)
        .resizable(false)
        .parent(&main)
        .map_err(|e| e.to_string())?
        .initialization_script(CURSOR_SCRIPT)
        // Nouvelle fenêtre (lien « _blank », window.open) : ouverte dans la même page.
        .on_new_window({
            let app = app.clone();
            let label = label.clone();
            move |target, _features| {
                let app = app.clone();
                let label = label.clone();
                std::thread::spawn(move || {
                    if let Some(view) = app.get_webview_window(&label) {
                        let _ = view.navigate(target);
                    }
                });
                tauri::webview::NewWindowResponse::Deny
            }
        });
    if let Some(agent) = user_agent {
        builder = builder.user_agent(&agent);
    }
    let view = builder.build().map_err(|e| e.to_string())?;
    view.set_position(position).map_err(|e| e.to_string())?;
    view.set_size(size).map_err(|e| e.to_string())?;
    let _ = view.set_focus();
    views.insert(label, url.to_string());
    Ok(())
}

/// Cache le navigateur (retour à Playscreen) ; les pages restent chargées. La manette
/// redevient une manette.
#[tauri::command]
pub fn browser_hide(app: AppHandle) {
    let state = app.state::<BrowserState>();
    let mut any_visible = false;
    for label in state.views.lock().unwrap().keys() {
        if let Some(view) = app.get_webview_window(label) {
            any_visible |= view.is_visible().unwrap_or(false);
            let _ = view.hide();
        }
    }
    if any_visible {
        crate::relay::set_mouse_mode(false);
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
}
