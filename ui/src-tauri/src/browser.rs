//! Navigateur manette : les vrais sites (Boutique, Social, Musique, Internet), chacun dans une
//! fenêtre sans bordure posée sous la barre du navigateur de l'interface et rattachée à
//! Playscreen (toujours au-dessus de lui, absente de la barre des tâches). Une fenêtre par
//! fenêtre du navigateur, gardée ouverte et cachée quand on revient à Playscreen : la musique
//! et l'appel Discord continuent. La manette y est gérée par browser-pad.js.
//! (Une vue ajoutée dans la fenêtre Playscreen, `add_child`, restait vide le 6 octobre 2026.)

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Url, WebviewUrl, WebviewWindowBuilder};

const PAD_SCRIPT: &str = include_str!("browser-pad.js");
const ZOOM_STEP: f64 = 0.1;

/// Par vue : dernière adresse demandée par l'interface, et zoom.
#[derive(Default)]
pub struct BrowserState {
    views: Mutex<HashMap<String, (String, f64)>>,
}

fn label(window: &str) -> String {
    format!("web-{window}")
}

/// Ouvre (ou montre) la fenêtre `window` du navigateur sur `url`, sous `top` pixels (la
/// barre de l'interface). Une vue déjà ouverte sur la même adresse n'est pas rechargée.
/// Asynchrone : sous Windows, créer une fenêtre web depuis une commande synchrone la bloque
/// (fenêtre blanche, jamais initialisée).
#[tauri::command]
pub async fn browser_open(app: AppHandle, window: String, url: String, top: f64) -> Result<(), String> {
    let result = open(&app, &window, &url, top);
    if let Err(error) = &result {
        eprintln!("[navigateur] {window} {url} : {error}");
    }
    result
}

fn open(app: &AppHandle, window: &str, url: &str, top: f64) -> Result<(), String> {
    let url = url.to_string();
    let main = app.get_webview_window("main").ok_or("fenêtre principale introuvable")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let origin = main.inner_position().map_err(|e| e.to_string())?;
    let inner = main.inner_size().map_err(|e| e.to_string())?;
    // `top` vient de l'interface, en pixels CSS : on le convertit en pixels de l'écran.
    let top = (top * scale).round() as i32;
    let position = PhysicalPosition::new(origin.x, origin.y + top);
    let size = PhysicalSize::new(inner.width, inner.height.saturating_sub(top as u32).max(1));
    let label = label(window);
    let state = app.state::<BrowserState>();
    let mut views = state.views.lock().unwrap();

    // Une seule fenêtre du navigateur visible à la fois.
    for other in views.keys().filter(|l| **l != label) {
        if let Some(view) = app.get_webview_window(other) {
            let _ = view.hide();
        }
    }

    if let Some(view) = app.get_webview_window(&label) {
        let entry = views.entry(label.clone()).or_insert((url.clone(), 1.0));
        if entry.0 != url {
            entry.0 = url.clone();
            view.navigate(Url::parse(&url).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        }
        view.set_position(position).map_err(|e| e.to_string())?;
        view.set_size(size).map_err(|e| e.to_string())?;
        view.show().map_err(|e| e.to_string())?;
        view.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let handle = app.clone();
    let view_label = label.clone();
    let view = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(Url::parse(&url).map_err(|e| e.to_string())?))
        .title("Playscreen – navigateur")
        .decorations(false)
        .skip_taskbar(true)
        .resizable(false)
        .parent(&main)
        .map_err(|e| e.to_string())?
        .initialization_script(PAD_SCRIPT)
        .on_navigation(move |target| {
            if target.scheme() != "playscreen" {
                return true;
            }
            let command = format!("{}{}", target.host_str().unwrap_or(""), target.path());
            handle_command(&handle, &view_label, command.trim_end_matches('/'));
            false
        })
        .build()
        .map_err(|e| e.to_string())?;
    view.set_position(position).map_err(|e| e.to_string())?;
    view.set_size(size).map_err(|e| e.to_string())?;
    let _ = view.set_focus();
    views.insert(label, (url, 1.0));
    Ok(())
}

/// Cache le navigateur (retour à Playscreen) ; les pages restent chargées.
#[tauri::command]
pub fn browser_hide(app: AppHandle) {
    hide_all(&app);
}

fn hide_all(app: &AppHandle) {
    let state = app.state::<BrowserState>();
    for label in state.views.lock().unwrap().keys() {
        if let Some(view) = app.get_webview_window(label) {
            let _ = view.hide();
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
}

/// Commandes envoyées par browser-pad.js (« playscreen://back », etc.).
fn handle_command(app: &AppHandle, label: &str, command: &str) {
    match command {
        "keyboard/show" => {
            std::thread::spawn(crate::touch_keyboard::show);
        }
        "keyboard/toggle" => {
            std::thread::spawn(crate::touch_keyboard::toggle);
        }
        "zoom/in" | "zoom/out" => {
            let state = app.state::<BrowserState>();
            let mut views = state.views.lock().unwrap();
            if let (Some(entry), Some(view)) = (views.get_mut(label), app.get_webview_window(label)) {
                let delta = if command == "zoom/in" { ZOOM_STEP } else { -ZOOM_STEP };
                entry.1 = (entry.1 + delta).clamp(0.5, 3.0);
                let _ = view.set_zoom(entry.1);
            }
        }
        _ => {
            // back, menu, tab/next, tab/previous : l'interface décide. Pour « back » et
            // « menu », la page est cachée tout de suite pour que l'interface reprenne la main.
            if command == "back" || command == "menu" {
                hide_all(app);
            }
            let _ = app.emit("browser", command.to_string());
        }
    }
}
