use tauri::{command, AppHandle};
use tauri_plugin_notification::NotificationExt;

#[command]
pub async fn send_notification(
    app: AppHandle,
    title: String,
    body: String,
    chat_id: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .action_type_id(&chat_id)
        .show()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn request_notification_permission(
    app: AppHandle,
) -> Result<String, String> {
    let permission = app
        .notification()
        .request_permission()
        .map_err(|e| e.to_string())?;

    Ok(format!("{:?}", permission))
}

#[command]
pub async fn is_notification_permission_granted(
    app: AppHandle,
) -> Result<bool, String> {
    app.notification()
        .permission_state()
        .map(|state| state == tauri_plugin_notification::PermissionState::Granted)
        .map_err(|e| e.to_string())
}
