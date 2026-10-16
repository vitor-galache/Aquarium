//! Captura rápida: atalho global, lápis na onda na bandeja e janela que fecha para a bandeja.
//!
//! O app nunca sai ao fechar a janela; ele fica na bandeja para que o atalho
//! (padrão `Ctrl+Shift+Espaço`, configurável) e o clique no ícone continuem abrindo
//! a captura: uma janela pequena, estilo Spotlight, separada da principal.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const MAIN: &str = "main";
/// Janela de captura; o front a reconhece pelo `#capture` na URL.
const CAPTURE: &str = "capture";
/// Evento enviado à janela de captura sempre que ela aparece.
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

/// Mostra a janela de captura no centro da tela, sem trazer a principal.
fn open_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE) {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit_to(CAPTURE, OPEN_CAPTURE, ());
    }
}

/// Cria a janela de captura escondida, para abrir na hora pelo atalho ou pelo ícone.
fn setup_capture_window(app: &App) -> tauri::Result<()> {
    let window =
        WebviewWindowBuilder::new(app, CAPTURE, WebviewUrl::App("index.html#capture".into()))
            .title("Captura rápida")
            .inner_size(600.0, 120.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true)
            .visible(false)
            .center()
            .build()?;
    // Some ao perder o foco, como o Spotlight.
    let w = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let _ = w.hide();
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = w.hide();
        }
        _ => {}
    });
    Ok(())
}

/// Esconde a janela de captura (Enter salvou ou Esc) e devolve o foco ao app
/// em que a pessoa estava, sem trazer a janela principal.
#[tauri::command]
pub fn hide_capture(app: AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE) {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    if !app
        .get_webview_window(MAIN)
        .is_some_and(|w| w.is_focused().unwrap_or(false))
    {
        let _ = app.hide();
    }
}

/// Avisa a janela principal que a captura criou uma nota.
#[tauri::command]
pub fn captured(app: AppHandle) {
    let _ = app.emit_to(MAIN, "notes-changed", ());
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    setup_capture_window(app)?;
    setup_tray(app)?;
    #[cfg(desktop)]
    setup_shortcut(app)?;
    #[cfg(desktop)]
    app.handle()
        .plugin(tauri_plugin_autostart::Builder::new().build())?;
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
    let open = MenuItem::with_id(app, "open", "Abrir Notesea", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Notesea")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
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
                open_capture(tray.app_handle());
            }
        });
    // Lápis na onda (3b). No macOS é template monocromático: o sistema pinta para claro/escuro.
    // Fora dele, azul com contorno claro para ter contraste em barras claras e escuras.
    #[cfg(target_os = "macos")]
    {
        tray = tray
            .icon(tauri::include_image!("icons/tray-template.png"))
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        tray = tray.icon(tauri::include_image!("icons/tray.png"));
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
