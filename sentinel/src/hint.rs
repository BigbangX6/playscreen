//! Bulle d'aide du mode souris : en bas à droite de l'écran, elle rappelle les touches
//! (comme la carte du relais de Playscreen, mêmes couleurs) à chaque passage en mode souris,
//! puis s'efface toute seule après quelques secondes. Fenêtre Windows dessinée à la main
//! (GDI) : rien à charger, jamais de focus, les clics passent au travers.

#[cfg(windows)]
pub use imp::show;

#[cfg(not(windows))]
pub fn show() {}

#[cfg(windows)]
mod imp {
    use std::cell::Cell;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{
        BeginPaint, CreateFontW, CreateRoundRectRgn, CreateSolidBrush, DeleteObject, DrawTextW, Ellipse, EndPaint,
        FillRect, SelectObject, SetBkMode, SetTextColor, SetWindowRgn, DT_CENTER, DT_LEFT, DT_SINGLELINE, DT_VCENTER,
        HFONT, PAINTSTRUCT, TRANSPARENT,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, KillTimer, RegisterClassW, SetLayeredWindowAttributes, SetTimer, SetWindowPos,
        ShowWindow, SystemParametersInfoW, HWND_TOPMOST, LWA_ALPHA, SPI_GETWORKAREA, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        SW_HIDE, WM_PAINT, WM_TIMER, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
        WS_EX_TRANSPARENT, WS_POPUP,
    };

    const CLASS: &str = "PlayscreenMouseHint";
    const TIMER_HOLD: usize = 1;
    const TIMER_FADE: usize = 2;
/// Tant qu'elle est affichée, la bulle repasse devant : les pages du navigateur de Playscreen
/// (plein écran, toujours devant) la recouvraient juste après son apparition (16/11/2026).
const TIMER_RAISE: usize = 3;
const RAISE_MS: u32 = 250;
    /// Affichée en entier pendant 5 s, puis fondu d'environ une demi-seconde.
    const HOLD_MS: u32 = 5000;
    const FADE_STEP_MS: u32 = 30;
    const OPAQUE: u8 = 240;

    // Couleurs de ui/src/theme.css (COLORREF : 0x00BBGGRR).
    const fn rgb(r: u8, g: u8, b: u8) -> u32 {
        (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
    }
    const SURFACE: u32 = rgb(0x16, 0x1c, 0x2b);
    const TEXT: u32 = rgb(0xf4, 0xf6, 0xfb);
    const MUTED: u32 = rgb(0x9a, 0xa5, 0xba);
    const DARK: u32 = rgb(0x0b, 0x0f, 0x1a);
    const PAD_A: u32 = rgb(0x3f, 0xb9, 0x3f);
    const PAD_B: u32 = rgb(0xe8, 0x42, 0x3f);
    const PAD_X: u32 = rgb(0x3a, 0x83, 0xf1);
    const PAD_Y: u32 = rgb(0xf2, 0xc2, 0x30);

    /// (lettre, fond, couleur de la lettre, action en français, en anglais), deux lignes de trois.
    const KEYS: [(&str, u32, u32, &str, &str); 6] = [
        ("L", TEXT, DARK, "Déplacer", "Move"),
        ("A", PAD_A, DARK, "Cliquer", "Click"),
        ("X", PAD_X, TEXT, "Clic droit", "Right-click"),
        ("R", TEXT, DARK, "Défiler", "Scroll"),
        ("Y", PAD_Y, DARK, "Clavier", "Keyboard"),
        ("B", PAD_B, DARK, "Échap", "Escape"),
    ];

    thread_local! {
        static WINDOW: Cell<HWND> = const { Cell::new(null_mut()) };
        static ALPHA: Cell<u8> = const { Cell::new(0) };
        static SCALE: Cell<f32> = const { Cell::new(1.0) };
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Montre la bulle (ou la remet au début si elle est déjà là). À appeler depuis le fil de
    /// la sentinelle (celui de sa boucle de messages).
    pub fn show() {
        // SAFETY : appels Win32 classiques sur le fil de la boucle de messages ; chaînes
        // terminées par un zéro et gardées en vie pendant les appels.
        unsafe {
            let mut area: RECT = std::mem::zeroed();
            SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut area as *mut RECT as *mut _, 0);
            // Taille pensée pour un écran de 1080 lignes, agrandie sur une télé 4K.
            let scale = ((area.bottom - area.top) as f32 / 1040.0).max(1.0);
            SCALE.with(|s| s.set(scale));
            let px = |v: f32| (v * scale).round() as i32;
            let (width, height, margin) = (px(540.0), px(196.0), px(28.0));

            let mut hwnd = WINDOW.with(|w| w.get());
            if hwnd.is_null() {
                let instance = GetModuleHandleW(null());
                let class_name = wide(CLASS);
                let mut class: WNDCLASSW = std::mem::zeroed();
                class.lpfnWndProc = Some(window_proc);
                class.hInstance = instance;
                class.lpszClassName = class_name.as_ptr();
                RegisterClassW(&class);
                hwnd = CreateWindowExW(
                    WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    class_name.as_ptr(),
                    class_name.as_ptr(),
                    WS_POPUP,
                    0,
                    0,
                    width,
                    height,
                    null_mut(),
                    null_mut(),
                    instance,
                    null(),
                );
                if hwnd.is_null() {
                    return;
                }
                WINDOW.with(|w| w.set(hwnd));
            }
            SetWindowRgn(hwnd, CreateRoundRectRgn(0, 0, width + 1, height + 1, px(28.0), px(28.0)), 1);
            ALPHA.with(|a| a.set(OPAQUE));
            SetLayeredWindowAttributes(hwnd, 0, OPAQUE, LWA_ALPHA);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                area.right - width - margin,
                area.bottom - height - margin,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            KillTimer(hwnd, TIMER_FADE);
            SetTimer(hwnd, TIMER_HOLD, HOLD_MS, None);
            SetTimer(hwnd, TIMER_RAISE, RAISE_MS, None);
        }
    }

    unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match message {
            WM_PAINT => {
                paint(hwnd);
                0
            }
            WM_TIMER if wparam == TIMER_HOLD => {
                KillTimer(hwnd, TIMER_HOLD);
                SetTimer(hwnd, TIMER_FADE, FADE_STEP_MS, None);
                0
            }
            WM_TIMER if wparam == TIMER_RAISE => {
                SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                0
            }
            WM_TIMER if wparam == TIMER_FADE => {
                let alpha = ALPHA.with(|a| a.get()).saturating_sub(16);
                ALPHA.with(|a| a.set(alpha));
                if alpha == 0 {
                    KillTimer(hwnd, TIMER_FADE);
                    KillTimer(hwnd, TIMER_RAISE);
                    ShowWindow(hwnd, SW_HIDE);
                } else {
                    SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
                }
                0
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }

    unsafe fn font(size: f32, bold: bool) -> HFONT {
        let face = wide("Segoe UI");
        CreateFontW(-(size.round() as i32), 0, 0, 0, if bold { 700 } else { 400 }, 0, 0, 0, 0, 0, 0, 5, 0, face.as_ptr())
    }

    unsafe fn text(hdc: windows_sys::Win32::Graphics::Gdi::HDC, value: &str, mut rect: RECT, flags: u32) {
        let mut chars: Vec<u16> = value.encode_utf16().collect();
        DrawTextW(hdc, chars.as_mut_ptr(), chars.len() as i32, &mut rect, flags | DT_SINGLELINE | DT_VCENTER);
    }

    unsafe fn paint(hwnd: HWND) {
        let scale = SCALE.with(|s| s.get());
        let px = |v: f32| (v * scale).round() as i32;
        let mut ps: PAINTSTRUCT = std::mem::zeroed();
        let hdc = BeginPaint(hwnd, &mut ps);
        let background = CreateSolidBrush(SURFACE);
        let mut all = RECT { left: 0, top: 0, right: px(540.0), bottom: px(196.0) };
        FillRect(hdc, &all, background);
        DeleteObject(background);
        SetBkMode(hdc, TRANSPARENT as i32);

        let title = font(24.0 * scale, true);
        let label = font(19.0 * scale, false);
        let glyph = font(16.0 * scale, true);
        let small = font(17.0 * scale, false);

        let old = SelectObject(hdc, title);
        SetTextColor(hdc, TEXT);
        let english = crate::lang::english();
        text(hdc, if english { "Controller mouse" } else { "Souris manette" }, RECT { left: px(26.0), top: px(16.0), right: px(520.0), bottom: px(52.0) }, DT_LEFT);

        for (index, (letter, fill, ink, action_fr, action_en)) in KEYS.iter().enumerate() {
            let action = if english { action_en } else { action_fr };
            let (column, row) = ((index % 3) as f32, (index / 3) as f32);
            let x = 26.0 + column * 170.0;
            let y = 66.0 + row * 46.0;
            let brush = CreateSolidBrush(*fill);
            let pen_old = SelectObject(hdc, brush);
            let pen = windows_sys::Win32::Graphics::Gdi::GetStockObject(windows_sys::Win32::Graphics::Gdi::NULL_PEN);
            let previous_pen = SelectObject(hdc, pen);
            Ellipse(hdc, px(x), px(y), px(x + 32.0), px(y + 32.0));
            SelectObject(hdc, previous_pen);
            SelectObject(hdc, pen_old);
            DeleteObject(brush);
            SelectObject(hdc, glyph);
            SetTextColor(hdc, *ink);
            text(hdc, letter, RECT { left: px(x), top: px(y), right: px(x + 32.0), bottom: px(y + 32.0) }, DT_CENTER);
            SelectObject(hdc, label);
            SetTextColor(hdc, TEXT);
            text(hdc, action, RECT { left: px(x + 42.0), top: px(y), right: px(x + 168.0), bottom: px(y + 32.0) }, DT_LEFT);
        }

        SelectObject(hdc, small);
        SetTextColor(hdc, MUTED);
        all = RECT { left: px(26.0), top: px(156.0), right: px(520.0), bottom: px(184.0) };
        let footer = if english {
            "Select + Y: back to Playscreen   ·   Select + X: stop the mouse"
        } else {
            "Select + Y : revenir à Playscreen   ·   Select + X : arrêter la souris"
        };
        text(hdc, footer, all, DT_LEFT);

        SelectObject(hdc, old);
        for f in [title, label, glyph, small] {
            DeleteObject(f);
        }
        EndPaint(hwnd, &ps);
    }
}
