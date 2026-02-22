use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::webview::WebviewWindowBuilder;
use tauri::{command, AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct AuthCodePayload {
    code: String,
    state: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct AuthErrorPayload {
    error: String,
    description: String,
}

#[command]
pub async fn open_auth_window(
    app: AppHandle,
    auth_url: String,
    redirect_uri: String,
) -> Result<(), String> {
    // Close existing auth window if present
    if let Some(existing) = app.get_webview_window("auth-login") {
        let _ = existing.destroy();
    }

    let completed = Arc::new(AtomicBool::new(false));

    let app_nav = app.clone();
    let completed_nav = completed.clone();

    let parsed_url: url::Url = auth_url
        .parse()
        .map_err(|e| format!("Invalid auth URL: {e}"))?;

    let window = WebviewWindowBuilder::new(
        &app,
        "auth-login",
        tauri::WebviewUrl::External(parsed_url),
    )
    .title("Sign in — Microsoft")
    .inner_size(500.0, 700.0)
    .center()
    .on_navigation(move |url| {
        if !url.as_str().starts_with(&redirect_uri) {
            return true;
        }

        completed_nav.store(true, Ordering::SeqCst);

        let params: std::collections::HashMap<String, String> = url
            .query_pairs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        if let Some(code) = params.get("code") {
            let state = params.get("state").cloned();
            let _ = app_nav.emit(
                "auth:callback",
                AuthCodePayload {
                    code: code.clone(),
                    state,
                },
            );
        } else {
            let error = params
                .get("error")
                .cloned()
                .unwrap_or_else(|| "unknown".into());
            let description = params
                .get("error_description")
                .cloned()
                .unwrap_or_default();
            let _ = app_nav.emit("auth:error", AuthErrorPayload { error, description });
        }

        if let Some(w) = app_nav.get_webview_window("auth-login") {
            let _ = w.destroy();
        }

        false // block navigation to redirect URI
    })
    .build()
    .map_err(|e| format!("Failed to open auth window: {e}"))?;

    // Emit cancelled event when window is closed without completing auth
    let app_close = app.clone();
    let completed_close = completed.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if !completed_close.load(Ordering::SeqCst) {
                let _ = app_close.emit("auth:cancelled", ());
            }
        }
    });

    Ok(())
}
