//! Bulle d'aide du mode souris : en bas à droite de l'écran, elle rappelle les touches
//! (comme la carte du relais de Playscreen, mêmes couleurs) à chaque passage en mode souris,
//! puis s'efface toute seule après quelques secondes. Jamais de focus, les clics passent au
//! travers.
//!
//! Dessin lissé (GDI+ : ronds, coins arrondis et texte sans crénelage) dans une image avec
//! transparence par pixel, affichée par UpdateLayeredWindow. Le premier dessin (GDI simple)
//! était pixelisé à côté de Playscreen (remarque de la personne, 16 novembre 2026).

#[cfg(windows)]
pub use imp::show;

#[cfg(windows)]
pub use imp::hide;

#[cfg(not(windows))]
pub fn show() {}

#[cfg(not(windows))]
pub fn hide() {}

#[cfg(windows)]
mod imp {
    use std::cell::Cell;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject, AC_SRC_ALPHA,
        AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HBITMAP, HDC,
    };
    use windows_sys::Win32::Graphics::GdiPlus::{
        FillModeAlternate, FontStyleBold, FontStyleRegular, GdipAddPathArc, GdipClosePathFigure, GdipCreateFont,
        GdipCreateFontFamilyFromName, GdipCreateFromHDC, GdipCreatePath, GdipCreateSolidFill, GdipCreateStringFormat,
        GdipDeleteBrush, GdipDeleteFont, GdipDeleteFontFamily, GdipDeleteGraphics, GdipDeletePath,
        GdipDeleteStringFormat, GdipDrawString, GdipFillEllipse, GdipFillPath, GdipGraphicsClear,
        GdipSetSmoothingMode, GdipSetStringFormatAlign, GdipSetStringFormatLineAlign, GdipSetTextRenderingHint,
        GdiplusStartup, GdiplusStartupInput, GpBrush, GpGraphics, RectF, SmoothingModeAntiAlias,
        StringAlignmentCenter, StringAlignmentNear, TextRenderingHintAntiAliasGridFit, UnitPixel,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, KillTimer, RegisterClassW, SetTimer, SetWindowPos, ShowWindow,
        SystemParametersInfoW, UpdateLayeredWindow, HWND_TOPMOST, SPI_GETWORKAREA, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, ULW_ALPHA, WM_TIMER, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
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

    /// Taille de la bulle pour un écran de 1080 lignes (agrandie sur une télé 4K).
    const WIDTH: f32 = 540.0;
    const HEIGHT: f32 = 196.0;

    // Couleurs de ui/src/theme.css, en ARGB (GDI+).
    const fn argb(a: u8, r: u8, g: u8, b: u8) -> u32 {
        ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
    }
    const SURFACE: u32 = argb(244, 0x16, 0x1c, 0x2b);
    const TEXT: u32 = argb(255, 0xf4, 0xf6, 0xfb);
    const MUTED: u32 = argb(255, 0x9a, 0xa5, 0xba);
    const DARK: u32 = argb(255, 0x0b, 0x0f, 0x1a);
    const PAD_A: u32 = argb(255, 0x3f, 0xb9, 0x3f);
    const PAD_B: u32 = argb(255, 0xe8, 0x42, 0x3f);
    const PAD_X: u32 = argb(255, 0x3a, 0x83, 0xf1);
    const PAD_Y: u32 = argb(255, 0xf2, 0xc2, 0x30);

    /// (lettre, fond, couleur de la lettre, action en français, en anglais), deux lignes de trois.
    const KEYS: [(&str, u32, u32, &str, &str); 6] = [
        ("L", TEXT, DARK, "Déplacer", "Move"),
        ("A", PAD_A, DARK, "Cliquer", "Click"),
        ("X", PAD_X, TEXT, "Clic droit", "Right-click"),
        ("R", TEXT, DARK, "Défiler", "Scroll"),
        ("Y", PAD_Y, DARK, "Clavier", "Keyboard"),
        ("B", PAD_B, DARK, "Échap", "Escape"),
    ];

    /// Image de la bulle (gardée pendant l'affichage pour le fondu).
    struct Frame {
        dc: HDC,
        bitmap: HBITMAP,
        old: isize,
        position: POINT,
        size: SIZE,
    }

    thread_local! {
        static WINDOW: Cell<HWND> = const { Cell::new(null_mut()) };
        static ALPHA: Cell<u8> = const { Cell::new(0) };
        static FRAME: std::cell::RefCell<Option<Frame>> = const { std::cell::RefCell::new(None) };
        static GDIPLUS: Cell<bool> = const { Cell::new(false) };
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Montre la bulle (ou la remet au début si elle est déjà là). À appeler depuis le fil de
    /// la sentinelle (celui de sa boucle de messages).
    pub fn show() {
        // SAFETY : appels Win32 et GDI+ sur le fil de la boucle de messages ; chaînes terminées
        // par un zéro et gardées en vie pendant les appels ; objets créés libérés ici ou à la
        // fin du fondu.
        unsafe {
            if !GDIPLUS.with(|g| g.get()) {
                let input = GdiplusStartupInput { GdiplusVersion: 1, DebugEventCallback: 0, SuppressBackgroundThread: 0, SuppressExternalCodecs: 0 };
                let mut token = 0usize;
                if GdiplusStartup(&mut token, &input, null_mut()) != 0 {
                    return;
                }
                GDIPLUS.with(|g| g.set(true));
            }
            let mut area: RECT = std::mem::zeroed();
            SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut area as *mut RECT as *mut _, 0);
            let scale = ((area.bottom - area.top) as f32 / 1040.0).max(1.0);
            let (width, height, margin) = ((WIDTH * scale).round() as i32, (HEIGHT * scale).round() as i32, (28.0 * scale).round() as i32);

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

            release_frame();
            let Some(frame) = render(width, height, scale, POINT { x: area.right - width - margin, y: area.bottom - height - margin }) else {
                return;
            };
            FRAME.with(|f| *f.borrow_mut() = Some(frame));
            ALPHA.with(|a| a.set(255));
            present(hwnd, 255);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
            KillTimer(hwnd, TIMER_FADE);
            SetTimer(hwnd, TIMER_HOLD, HOLD_MS, None);
            SetTimer(hwnd, TIMER_RAISE, RAISE_MS, None);
        }
    }

    /// Cache la bulle tout de suite (fin du mode souris : retour sur Playscreen).
    pub fn hide() {
        let hwnd = WINDOW.with(|w| w.get());
        if hwnd.is_null() {
            return;
        }
        // SAFETY : fenêtre de ce fil ; minuteurs et image libérés comme à la fin du fondu.
        unsafe {
            KillTimer(hwnd, TIMER_HOLD);
            KillTimer(hwnd, TIMER_FADE);
            KillTimer(hwnd, TIMER_RAISE);
            ShowWindow(hwnd, SW_HIDE);
            release_frame();
        }
    }

    /// Dessine la bulle dans une image 32 bits avec transparence (prémultipliée, comme
    /// l'attend UpdateLayeredWindow ; GDI+ l'écrit ainsi dans une image 32 bits).
    unsafe fn render(width: i32, height: i32, scale: f32, position: POINT) -> Option<Frame> {
        let screen = GetDC(null_mut());
        let dc = CreateCompatibleDC(screen);
        ReleaseDC(null_mut(), screen);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..std::mem::zeroed()
        };
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
        if bitmap.is_null() {
            DeleteDC(dc);
            return None;
        }
        let old = SelectObject(dc, bitmap) as isize;

        let mut g: *mut GpGraphics = null_mut();
        GdipCreateFromHDC(dc, &mut g);
        GdipSetSmoothingMode(g, SmoothingModeAntiAlias);
        GdipSetTextRenderingHint(g, TextRenderingHintAntiAliasGridFit);
        GdipGraphicsClear(g, 0);
        let px = |v: f32| v * scale;

        // Fond : rectangle aux coins arrondis.
        let mut path = null_mut();
        GdipCreatePath(FillModeAlternate, &mut path);
        let (w, h, r) = (width as f32 - 1.0, height as f32 - 1.0, px(26.0));
        GdipAddPathArc(path, 0.0, 0.0, r, r, 180.0, 90.0);
        GdipAddPathArc(path, w - r, 0.0, r, r, 270.0, 90.0);
        GdipAddPathArc(path, w - r, h - r, r, r, 0.0, 90.0);
        GdipAddPathArc(path, 0.0, h - r, r, r, 90.0, 90.0);
        GdipClosePathFigure(path);
        fill_path(g, path, SURFACE);
        GdipDeletePath(path);

        let english = crate::lang::english();
        let family_name = wide("Segoe UI");
        let mut family = null_mut();
        GdipCreateFontFamilyFromName(family_name.as_ptr(), null_mut(), &mut family);
        let font = |size: f32, bold: bool| {
            let mut f = null_mut();
            GdipCreateFont(family, px(size), if bold { FontStyleBold } else { FontStyleRegular }, UnitPixel, &mut f);
            f
        };
        let (title, label, glyph, small) = (font(23.0, true), font(19.0, false), font(15.0, true), font(15.5, false));
        let mut left = null_mut();
        GdipCreateStringFormat(0, 0, &mut left);
        GdipSetStringFormatAlign(left, StringAlignmentNear);
        GdipSetStringFormatLineAlign(left, StringAlignmentCenter);
        let mut centered = null_mut();
        GdipCreateStringFormat(0, 0, &mut centered);
        GdipSetStringFormatAlign(centered, StringAlignmentCenter);
        GdipSetStringFormatLineAlign(centered, StringAlignmentCenter);

        let text = |value: &str, font, format, color: u32, x: f32, y: f32, w: f32, h: f32| {
            let chars: Vec<u16> = value.encode_utf16().collect();
            let mut brush = null_mut();
            GdipCreateSolidFill(color, &mut brush);
            let rect = RectF { X: px(x), Y: px(y), Width: px(w), Height: px(h) };
            GdipDrawString(g, chars.as_ptr(), chars.len() as i32, font, &rect, format, brush as *const GpBrush);
            GdipDeleteBrush(brush as *mut GpBrush);
        };

        text(if english { "Controller mouse" } else { "Souris manette" }, title, left, TEXT, 26.0, 14.0, 490.0, 40.0);
        for (index, (letter, fill, ink, action_fr, action_en)) in KEYS.iter().enumerate() {
            let (column, row) = ((index % 3) as f32, (index / 3) as f32);
            let x = 26.0 + column * 170.0;
            let y = 64.0 + row * 46.0;
            let mut brush = null_mut();
            GdipCreateSolidFill(*fill, &mut brush);
            GdipFillEllipse(g, brush as *mut GpBrush, px(x), px(y), px(32.0), px(32.0));
            GdipDeleteBrush(brush as *mut GpBrush);
            text(letter, glyph, centered, *ink, x, y + 0.5, 32.0, 32.0);
            text(if english { action_en } else { action_fr }, label, left, TEXT, x + 41.0, y, 128.0, 32.0);
        }
        let footer = if english {
            "Select + Y: back to Playscreen   ·   Select + X: stop the mouse"
        } else {
            "Select + Y : revenir à Playscreen   ·   Select + X : arrêter la souris"
        };
        text(footer, small, left, MUTED, 26.0, 154.0, 500.0, 28.0);

        for f in [title, label, glyph, small] {
            GdipDeleteFont(f);
        }
        GdipDeleteStringFormat(left);
        GdipDeleteStringFormat(centered);
        GdipDeleteFontFamily(family);
        GdipDeleteGraphics(g);
        Some(Frame { dc, bitmap, old, position, size: SIZE { cx: width, cy: height } })
    }

    unsafe fn fill_path(g: *mut GpGraphics, path: *mut windows_sys::Win32::Graphics::GdiPlus::GpPath, color: u32) {
        let mut brush = null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipFillPath(g, brush as *mut GpBrush, path);
        GdipDeleteBrush(brush as *mut GpBrush);
    }

    /// Affiche l'image de la bulle avec une opacité globale (fondu).
    unsafe fn present(hwnd: HWND, alpha: u8) {
        FRAME.with(|f| {
            if let Some(frame) = f.borrow().as_ref() {
                let source = POINT { x: 0, y: 0 };
                let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha, AlphaFormat: AC_SRC_ALPHA as u8 };
                UpdateLayeredWindow(hwnd, null_mut(), &frame.position, &frame.size, frame.dc, &source, 0, &blend, ULW_ALPHA);
            }
        });
    }

    unsafe fn release_frame() {
        FRAME.with(|f| {
            if let Some(frame) = f.borrow_mut().take() {
                SelectObject(frame.dc, frame.old as _);
                DeleteObject(frame.bitmap as _);
                DeleteDC(frame.dc);
            }
        });
    }

    unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match message {
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
                let alpha = ALPHA.with(|a| a.get()).saturating_sub(17);
                ALPHA.with(|a| a.set(alpha));
                if alpha == 0 {
                    KillTimer(hwnd, TIMER_FADE);
                    KillTimer(hwnd, TIMER_RAISE);
                    ShowWindow(hwnd, SW_HIDE);
                    release_frame();
                } else {
                    present(hwnd, alpha);
                }
                0
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }
}
