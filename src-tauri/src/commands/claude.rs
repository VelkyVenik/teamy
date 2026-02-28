use futures_util::StreamExt;
use security_framework::passwords::get_generic_password;
use tauri::{command, Emitter};

const SERVICE_NAME: &str = "com.teamy.app";
const KEYCHAIN_KEY: &str = "anthropic-api-key";

#[derive(Debug, serde::Deserialize)]
pub struct ClaudeRequest {
    pub messages: Vec<ClaudeMessage>,
    pub system: Option<String>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct ClaudeMessage {
    pub role: String,
    pub content: String,
}

#[command]
pub async fn claude_chat_stream(
    app: tauri::AppHandle,
    request: ClaudeRequest,
) -> Result<(), String> {
    // Read API key from keychain
    let api_key_bytes = get_generic_password(SERVICE_NAME, KEYCHAIN_KEY)
        .map_err(|e| format!("Failed to read API key from keychain: {}", e))?;

    let api_key = String::from_utf8(api_key_bytes.to_vec())
        .map_err(|e| format!("Failed to decode API key: {}", e))?;

    // Build the request body
    let mut body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "stream": true,
        "messages": request.messages,
    });

    if let Some(system) = &request.system {
        body["system"] = serde_json::json!(system);
    }

    // Spawn async task so we don't block the command
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();

        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        let response = match response {
            Ok(resp) => {
                // Check for HTTP errors before streaming
                if !resp.status().is_success() {
                    let status = resp.status();
                    let error_body = resp.text().await.unwrap_or_default();
                    let _ = app.emit(
                        "claude:stream-error",
                        format!("API error {}: {}", status, error_body),
                    );
                    return;
                }
                resp
            }
            Err(e) => {
                let _ = app.emit("claude:stream-error", format!("Request failed: {}", e));
                return;
            }
        };

        // Read the response as a byte stream and parse SSE
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let text = match String::from_utf8(bytes.to_vec()) {
                        Ok(t) => t,
                        Err(e) => {
                            let _ = app.emit(
                                "claude:stream-error",
                                format!("Failed to decode chunk: {}", e),
                            );
                            return;
                        }
                    };

                    buffer.push_str(&text);

                    // Process complete lines from the buffer
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.starts_with("data: ") {
                            let data = &line[6..];

                            // Skip the [DONE] marker
                            if data == "[DONE]" {
                                continue;
                            }

                            // Parse and emit the JSON chunk
                            match serde_json::from_str::<serde_json::Value>(data) {
                                Ok(parsed) => {
                                    let _ = app.emit("claude:stream-chunk", &parsed);
                                }
                                Err(e) => {
                                    let _ = app.emit(
                                        "claude:stream-error",
                                        format!(
                                            "Failed to parse SSE data: {} — raw: {}",
                                            e, data
                                        ),
                                    );
                                }
                            }
                        }
                        // Ignore empty lines and "event:" lines (SSE format)
                    }
                }
                Err(e) => {
                    let _ =
                        app.emit("claude:stream-error", format!("Stream read error: {}", e));
                    return;
                }
            }
        }

        let _ = app.emit("claude:stream-end", ());
    });

    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct ClaudeSyncRequest {
    pub messages: Vec<ClaudeMessage>,
    pub system: Option<String>,
}

#[command]
pub async fn claude_chat_sync(request: ClaudeSyncRequest) -> Result<String, String> {
    let api_key_bytes = get_generic_password(SERVICE_NAME, KEYCHAIN_KEY)
        .map_err(|e| format!("Failed to read API key from keychain: {}", e))?;

    let api_key = String::from_utf8(api_key_bytes.to_vec())
        .map_err(|e| format!("Failed to decode API key: {}", e))?;

    let mut body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "stream": false,
        "messages": request.messages,
    });

    if let Some(system) = &request.system {
        body["system"] = serde_json::json!(system);
    }

    let client = reqwest::Client::new();

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, error_body));
    }

    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    parsed["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text content in response".to_string())
}

#[derive(Debug, serde::Deserialize)]
pub struct ClaudeToolStreamRequest {
    pub messages: Vec<serde_json::Value>,
    pub system: Option<String>,
    pub tools: Option<Vec<serde_json::Value>>,
}

#[command]
pub async fn claude_tool_stream(
    app: tauri::AppHandle,
    request: ClaudeToolStreamRequest,
) -> Result<(), String> {
    let api_key_bytes = get_generic_password(SERVICE_NAME, KEYCHAIN_KEY)
        .map_err(|e| format!("Failed to read API key from keychain: {}", e))?;

    let api_key = String::from_utf8(api_key_bytes.to_vec())
        .map_err(|e| format!("Failed to decode API key: {}", e))?;

    let mut body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "stream": true,
        "messages": request.messages,
    });

    if let Some(system) = &request.system {
        body["system"] = serde_json::json!(system);
    }

    if let Some(tools) = &request.tools {
        body["tools"] = serde_json::json!(tools);
    }

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();

        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        let response = match response {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let status = resp.status();
                    let error_body = resp.text().await.unwrap_or_default();
                    let _ = app.emit(
                        "claude:stream-error",
                        format!("API error {}: {}", status, error_body),
                    );
                    return;
                }
                resp
            }
            Err(e) => {
                let _ = app.emit("claude:stream-error", format!("Request failed: {}", e));
                return;
            }
        };

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let text = match String::from_utf8(bytes.to_vec()) {
                        Ok(t) => t,
                        Err(e) => {
                            let _ = app.emit(
                                "claude:stream-error",
                                format!("Failed to decode chunk: {}", e),
                            );
                            return;
                        }
                    };

                    buffer.push_str(&text);

                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.starts_with("data: ") {
                            let data = &line[6..];

                            if data == "[DONE]" {
                                continue;
                            }

                            match serde_json::from_str::<serde_json::Value>(data) {
                                Ok(parsed) => {
                                    let _ = app.emit("claude:stream-chunk", &parsed);
                                }
                                Err(e) => {
                                    let _ = app.emit(
                                        "claude:stream-error",
                                        format!(
                                            "Failed to parse SSE data: {} — raw: {}",
                                            e, data
                                        ),
                                    );
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ =
                        app.emit("claude:stream-error", format!("Stream read error: {}", e));
                    return;
                }
            }
        }

        let _ = app.emit("claude:stream-end", ());
    });

    Ok(())
}

#[command]
pub async fn has_claude_api_key() -> Result<bool, String> {
    match get_generic_password(SERVICE_NAME, KEYCHAIN_KEY) {
        Ok(_) => Ok(true),
        Err(e) => {
            // Error code -25300 means item not found
            if e.code() == -25300 {
                Ok(false)
            } else {
                Err(format!("Failed to check keychain: {}", e))
            }
        }
    }
}
