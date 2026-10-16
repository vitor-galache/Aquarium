//! Captura rápida: atalho global, bandeja e janela que fecha para a bandeja.
//!
//! O app nunca sai ao fechar a janela; ele fica na bandeja para que o atalho
//! (padrão `Ctrl+Shift+Espaço`, configurável) continue abrindo o modal de captura.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, WindowEvent};

const MAIN: &str = "main";
/// Evento ouvido pelo front para abrir o modal de captura.
const OPEN_CAPTURE: &str = "open-capture";
/// Atalho de captura usado quando a pasta não define outro.
pub const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+Space";

/// Atalho de captura registrado no momento.
#[derive(Default)]
pub struct CaptureShortcut(std::sync::Mutex<Option<String>>);

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
    let open = MenuItem::with_id(app, "open", "Abrir Notesea", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&capture, &open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Notesea")
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
    use tauri_plugin_global_shortcut::ShortcutState;

    // Só o atalho de captura fica registrado, então qualquer disparo abre o modal.
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    open_capture(app);
                }
            })
            .build(),
    )?;
    // Outro app pode já ter o atalho; o app segue funcionando sem ele.
    if let Err(error) = set_shortcut(app.handle(), DEFAULT_SHORTCUT) {
        eprintln!("{error}");
    }
    Ok(())
}

/// Troca o atalho global de captura (ex.: `Ctrl+Shift+Space`).
///
/// Registra o novo antes de soltar o antigo: se falhar, o anterior continua valendo.
#[cfg(desktop)]
pub fn set_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|_| format!("Atalho inválido: {shortcut}."))?;
    let state = app.state::<CaptureShortcut>();
    let mut current = state.0.lock().unwrap();
    let previous = current.as_deref().and_then(|s| s.parse::<Shortcut>().ok());
    if previous == Some(parsed) {
        return Ok(());
    }
    let global = app.global_shortcut();
    global.register(parsed).map_err(|e| {
        format!("Não foi possível usar o atalho {shortcut}; outro app pode já usá-lo ({e}).")
    })?;
    if let Some(previous) = previous {
        let _ = global.unregister(previous);
    }
    *current = Some(shortcut.to_string());
    Ok(())
}

#[cfg(not(desktop))]
pub fn set_shortcut(_app: &AppHandle, _shortcut: &str) -> Result<(), String> {
    Ok(())
}
