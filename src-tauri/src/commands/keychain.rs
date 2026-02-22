use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
use tauri::command;

const SERVICE_NAME: &str = "com.teamy.app";

#[command]
pub async fn keychain_store(key: String, value: String) -> Result<(), String> {
    // Try to delete existing entry first (update scenario)
    let _ = delete_generic_password(SERVICE_NAME, &key);

    set_generic_password(SERVICE_NAME, &key, value.as_bytes())
        .map_err(|e| format!("Failed to store in keychain: {}", e))
}

#[command]
pub async fn keychain_get(key: String) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE_NAME, &key) {
        Ok(bytes) => {
            let value = String::from_utf8(bytes.to_vec())
                .map_err(|e| format!("Failed to decode keychain value: {}", e))?;
            Ok(Some(value))
        }
        Err(e) => {
            // Item not found is not an error — return None
            if e.code() == -25300 {
                Ok(None)
            } else {
                Err(format!("Failed to read from keychain: {}", e))
            }
        }
    }
}

#[command]
pub async fn keychain_delete(key: String) -> Result<(), String> {
    match delete_generic_password(SERVICE_NAME, &key) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Item not found is not an error
            if e.code() == -25300 {
                Ok(())
            } else {
                Err(format!("Failed to delete from keychain: {}", e))
            }
        }
    }
}
