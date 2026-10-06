//! Clavier tactile de Windows, à la disposition « manette » (« Boîtier de commande » en
//! français) : se pilote à la manette (X efface, Y espace, Start valide, B ferme). Windows
//! garde la dernière disposition choisie. Ouvert quand un champ de texte a le focus.
//! Copie de ui/src-tauri/src/touch_keyboard.rs, plus `toggle` (Y en mode souris).

// La sentinelle n'utilise que `toggle` ; le reste est gardé identique à la copie de Tauri.
#![allow(dead_code)]

/// Ouvre le clavier s'il est fermé. Faux si Windows ne l'a pas.
pub fn show() -> bool {
    set_visible(true)
}

/// Ouvre ou ferme le clavier (Y en mode souris).
pub fn toggle() {
    let visible = is_visible();
    let ok = set_visible(!visible);
    crate::actions::log(&format!("Clavier manette : {} ({})", if visible { "fermeture" } else { "ouverture" }, if ok { "ok" } else { "échec" }));
}

/// Le clavier est-il affiché ? (Il lit alors la manette lui-même.)
#[cfg(windows)]
pub fn is_visible() -> bool {
    std::thread::spawn(imp::visible).join().unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_visible() -> bool {
    false
}

/// Ferme le clavier s'il est ouvert.
pub fn hide() -> bool {
    set_visible(false)
}

#[cfg(windows)]
fn set_visible(visible: bool) -> bool {
    // COM dans un fil à part : celui de l'appelant peut déjà être initialisé autrement.
    std::thread::spawn(move || imp::set_visible(visible)).join().unwrap_or(false)
}

#[cfg(not(windows))]
fn set_visible(_visible: bool) -> bool {
    false
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use std::ptr::null_mut;
    use windows_sys::core::GUID;
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, CLSCTX_LOCAL_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetDesktopWindow;

    /// UIHostNoLaunch / ITipInvocation : bascule le clavier (ouvert ↔ fermé).
    const CLSID_UI_HOST_NO_LAUNCH: GUID = GUID::from_u128(0x4ce576fa_83dc_4f88_951c_9d0782b4e376);
    const IID_TIP_INVOCATION: GUID = GUID::from_u128(0x37c994e7_432b_4834_a2f7_dce1f13b834b);
    /// FrameworkInputPane : position du clavier (vide s'il est fermé).
    const CLSID_FRAMEWORK_INPUT_PANE: GUID = GUID::from_u128(0xd5120aa3_46ba_44c5_822d_ca8092c1fc72);
    const IID_FRAMEWORK_INPUT_PANE: GUID = GUID::from_u128(0x5752238b_24f0_495a_82f1_2fd593056796);

    const TAB_TIP: &str = r"C:\Program Files\Common Files\microsoft shared\ink\TabTip.exe";

    type Release = unsafe extern "system" fn(*mut c_void) -> u32;

    /// Méthodes COM dans l'ordre de l'interface (IUnknown d'abord).
    #[repr(C)]
    struct TipInvocationVtbl {
        query_interface: usize,
        add_ref: usize,
        release: Release,
        toggle: unsafe extern "system" fn(*mut c_void, HWND) -> i32,
    }

    #[repr(C)]
    struct FrameworkInputPaneVtbl {
        query_interface: usize,
        add_ref: usize,
        release: Release,
        advise: usize,
        advise_with_hwnd: usize,
        unadvise: usize,
        location: unsafe extern "system" fn(*mut c_void, *mut RECT) -> i32,
    }

    unsafe fn create(clsid: &GUID, iid: &GUID) -> *mut c_void {
        let mut object = null_mut();
        let hr = CoCreateInstance(clsid, null_mut(), CLSCTX_INPROC_SERVER | CLSCTX_LOCAL_SERVER, iid, &mut object);
        if hr < 0 {
            null_mut()
        } else {
            object
        }
    }

    unsafe fn is_visible() -> bool {
        let pane = create(&CLSID_FRAMEWORK_INPUT_PANE, &IID_FRAMEWORK_INPUT_PANE);
        if pane.is_null() {
            return false;
        }
        let vtbl = *(pane as *mut *const FrameworkInputPaneVtbl);
        let mut rect: RECT = std::mem::zeroed();
        let ok = ((*vtbl).location)(pane, &mut rect) >= 0;
        ((*vtbl).release)(pane);
        ok && rect.bottom > rect.top
    }

    unsafe fn toggle() -> bool {
        let mut tip = create(&CLSID_UI_HOST_NO_LAUNCH, &IID_TIP_INVOCATION);
        if tip.is_null() {
            // Le service du clavier ne tourne pas encore : on le démarre, puis on réessaie.
            if std::process::Command::new(TAB_TIP).spawn().is_err() {
                return false;
            }
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                tip = create(&CLSID_UI_HOST_NO_LAUNCH, &IID_TIP_INVOCATION);
                if !tip.is_null() {
                    break;
                }
            }
            if tip.is_null() {
                return false;
            }
        }
        let vtbl = *(tip as *mut *const TipInvocationVtbl);
        let ok = ((*vtbl).toggle)(tip, GetDesktopWindow()) >= 0;
        ((*vtbl).release)(tip);
        ok
    }

    pub fn visible() -> bool {
        // SAFETY : COM initialisé et libéré dans ce fil.
        unsafe {
            CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let visible = is_visible();
            CoUninitialize();
            visible
        }
    }

    pub fn set_visible(visible: bool) -> bool {
        // SAFETY : COM initialisé et libéré dans ce fil ; interfaces relâchées après usage.
        unsafe {
            CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            // Juste après Entrée, le clavier se réorganise et paraît fermé un instant : on
            // revérifie quelques fois avant de conclure qu'il n'y a rien à faire.
            let mut result = true;
            for attempt in 0..4 {
                if is_visible() != visible {
                    result = toggle();
                    break;
                }
                if visible || attempt == 3 {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            CoUninitialize();
            result
        }
    }
}
