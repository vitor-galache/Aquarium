//! Captura rápida: atalho global, bandeja e janela que fecha para a bandeja.
//!
//! O app nunca sai ao fechar a janela; ele fica na bandeja para que o atalho
//! `Ctrl+Shift+Espaço` continue abrindo o modal de captura.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, WindowEvent};

const MAIN: &str = "main";
/// Evento ouvido pelo front para abrir o modal de captura.
const OPEN_CAPTURE: &str = "open-capture";

/// Mostra e foca a janela principal.
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_capture(app: &AppHandle) {
    show_main(app);
    let _ = app.emit(OPEN_CAPTURE, ());
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    setup_tray(app)?;
    #[cfg(desktop)]
    setup_shortcut(app)?;
    if let Some(window) = app.get_webview_window(MAIN) {
        let w = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
            }
        });
    }
    Ok(())
}

fn setup_tray(app: &App) -> tauri::Result<()> {
    let capture = MenuItem::with_id(app, "capture", "Capturar ideia", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Abrir Aquarium", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&capture, &open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Aquarium")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture" => open_capture(app),
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn setup_shortcut(app: &App) -> tauri::Result<()> {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };

    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, pressed, event| {
                if pressed == &shortcut && event.state() == ShortcutState::Pressed {
                    open_capture(app);
                }
            })
            .build(),
    )?;
    // Outro app pode já ter o atalho; o app segue funcionando sem ele.
    if let Err(error) = app.global_shortcut().register(shortcut) {
        eprintln!("atalho de captura indisponível: {error}");
    }
    Ok(())
}
