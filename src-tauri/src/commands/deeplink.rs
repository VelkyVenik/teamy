use tauri::command;

#[command]
pub async fn open_teams_call(email: String) -> Result<(), String> {
    let url = format!(
        "https://teams.microsoft.com/l/call/0/0?users={}",
        urlencoding::encode(&email)
    );
    open::that(&url).map_err(|e| format!("Failed to open Teams call URL: {}", e))
}

#[command]
pub async fn join_meeting(join_url: String) -> Result<(), String> {
    // If already a full URL, open directly; otherwise construct the meetup-join link
    let url = if join_url.starts_with("http") {
        join_url
    } else {
        format!(
            "https://teams.microsoft.com/l/meetup-join/{}",
            urlencoding::encode(&join_url)
        )
    };
    open::that(&url).map_err(|e| format!("Failed to open meeting URL: {}", e))
}

#[command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}
