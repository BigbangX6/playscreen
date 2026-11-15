//! Langue des textes de la sentinelle (notification, bulle d'aide, menu) : celle choisie à
//! l'installation ou dans les Paramètres de Playscreen (%LOCALAPPDATA%\Playscreen\language),
//! sinon celle de Windows. Relue à chaque affichage : un changement prend effet tout de suite.

/// Vrai si les textes doivent être en anglais.
pub fn english() -> bool {
    let saved = std::env::var_os("LOCALAPPDATA")
        .map(|dir| std::path::PathBuf::from(dir).join("Playscreen").join("language"))
        .and_then(|file| std::fs::read_to_string(file).ok())
        .map(|text| text.trim().trim_start_matches('\u{feff}').to_ascii_lowercase());
    match saved.as_deref() {
        Some("en") => true,
        Some("fr") => false,
        _ => !windows_is_french(),
    }
}

/// Le texte français ou anglais selon la langue.
pub fn pick(fr: &'static str, en: &'static str) -> &'static str {
    if english() {
        en
    } else {
        fr
    }
}

#[cfg(windows)]
fn windows_is_french() -> bool {
    // Langue de l'interface de Windows : identifiant principal 0x0C = français.
    // SAFETY : fonction sans argument.
    let id = unsafe { windows_sys::Win32::Globalization::GetUserDefaultUILanguage() };
    id & 0x3FF == 0x0C
}

#[cfg(not(windows))]
fn windows_is_french() -> bool {
    true
}
