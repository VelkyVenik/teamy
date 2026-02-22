use tauri::{
    command,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

fn load_tray_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .expect("Failed to load tray icon")
}

fn load_tray_badge_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/tray-icon-badge.png"))
        .expect("Failed to load tray badge icon")
}

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Teamy", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Teamy", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &hide, &separator, &settings, &separator2, &quit],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(load_tray_icon())
        .icon_as_template(true)
        .tooltip("Teamy")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    // Emit event so frontend can navigate to settings
                    let _ = window.emit("navigate", "/settings");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[command]
pub async fn set_tray_unread_count(app: AppHandle, count: u32) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "Tray icon not found".to_string())?;

    if count == 0 {
        tray.set_icon(Some(load_tray_icon()))
            .map_err(|e| format!("Failed to set tray icon: {}", e))?;
        tray.set_icon_as_template(true)
            .map_err(|e| format!("Failed to set template: {}", e))?;
        tray.set_tooltip(Some("Teamy"))
            .map_err(|e| format!("Failed to set tooltip: {}", e))?;
    } else {
        let tooltip = format!("Teamy — {} unread", count);
        tray.set_tooltip(Some(&tooltip))
            .map_err(|e| format!("Failed to set tooltip: {}", e))?;

        // Badge icon is non-template so the red dot stays colored
        tray.set_icon_as_template(false)
            .map_err(|e| format!("Failed to set template: {}", e))?;
        tray.set_icon(Some(load_tray_badge_icon()))
            .map_err(|e| format!("Failed to set tray icon: {}", e))?;
    }

    Ok(())
}
