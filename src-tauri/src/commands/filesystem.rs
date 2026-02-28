use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct SearchResult {
    pub file: String,
    pub line: usize,
    pub content: String,
}

/// Resolve a relative path against the project root and ensure it stays within bounds.
fn resolve_safe_path(project_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(project_root)
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;

    let target = root.join(relative_path);

    let resolved = target
        .canonicalize()
        .or_else(|_| {
            // File may not exist yet (write_file). Canonicalize the parent instead.
            if let Some(parent) = target.parent() {
                let canonical_parent = parent
                    .canonicalize()
                    .map_err(|e| format!("Parent directory does not exist: {}", e))?;
                let file_name = target
                    .file_name()
                    .ok_or_else(|| "Invalid file name".to_string())?;
                Ok(canonical_parent.join(file_name))
            } else {
                Err(format!("Cannot resolve path: {}", target.display()))
            }
        })
        .map_err(|e: String| e)?;

    if !resolved.starts_with(&root) {
        return Err("Path traversal outside project root is not allowed".to_string());
    }

    Ok(resolved)
}

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".nuxt", ".output"];

#[command]
pub fn fs_get_project_root() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get project root: {}", e))
}

#[command]
pub fn fs_read_file(project_root: String, path: String) -> Result<String, String> {
    let resolved = resolve_safe_path(&project_root, &path)?;
    fs::read_to_string(&resolved).map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
pub fn fs_write_file(
    project_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let resolved = resolve_safe_path(&project_root, &path)?;

    // Create parent directories if needed
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    fs::write(&resolved, &content).map_err(|e| format!("Failed to write file: {}", e))
}

#[command]
pub fn fs_edit_file(
    project_root: String,
    path: String,
    old_text: String,
    new_text: String,
) -> Result<(), String> {
    let resolved = resolve_safe_path(&project_root, &path)?;

    let content =
        fs::read_to_string(&resolved).map_err(|e| format!("Failed to read file: {}", e))?;

    let count = content.matches(&old_text).count();
    if count == 0 {
        return Err("old_text not found in file".to_string());
    }
    if count > 1 {
        return Err(format!(
            "old_text found {} times — must be unique. Provide more surrounding context.",
            count
        ));
    }

    let updated = content.replacen(&old_text, &new_text, 1);
    fs::write(&resolved, &updated).map_err(|e| format!("Failed to write file: {}", e))
}

#[command]
pub fn fs_list_directory(
    project_root: String,
    path: String,
    recursive: Option<bool>,
) -> Result<Vec<FileEntry>, String> {
    let resolved = resolve_safe_path(&project_root, &path)?;

    if !resolved.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let root = Path::new(&project_root)
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;

    let mut entries = Vec::new();
    collect_entries(&resolved, &root, recursive.unwrap_or(false), &mut entries)?;
    Ok(entries)
}

fn collect_entries(
    dir: &Path,
    root: &Path,
    recursive: bool,
    entries: &mut Vec<FileEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden and excluded dirs
        if SKIP_DIRS.contains(&file_name.as_str()) {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let full_path = entry.path();
        let rel_path = full_path
            .strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .to_string();

        entries.push(FileEntry {
            name: file_name,
            path: rel_path,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });

        if recursive && metadata.is_dir() {
            collect_entries(&full_path, root, true, entries)?;
        }
    }

    Ok(())
}

#[command]
pub fn fs_search_files(
    project_root: String,
    pattern: String,
    path: Option<String>,
    glob: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let root = Path::new(&project_root)
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;

    let search_dir = if let Some(ref p) = path {
        resolve_safe_path(&project_root, p)?
    } else {
        root.clone()
    };

    if !search_dir.is_dir() {
        return Err("Search path is not a directory".to_string());
    }

    let regex = regex::Regex::new(&pattern).map_err(|e| format!("Invalid regex: {}", e))?;

    let glob_pattern = glob.as_deref();

    let mut results = Vec::new();
    search_recursive(&search_dir, &root, &regex, glob_pattern, &mut results)?;

    // Cap results to avoid huge payloads
    results.truncate(100);
    Ok(results)
}

fn search_recursive(
    dir: &Path,
    root: &Path,
    regex: &regex::Regex,
    glob: Option<&str>,
    results: &mut Vec<SearchResult>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if SKIP_DIRS.contains(&file_name.as_str()) || file_name.starts_with('.') {
            continue;
        }

        let full_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        if metadata.is_dir() {
            search_recursive(&full_path, root, regex, glob, results)?;
            continue;
        }

        // Apply glob filter if provided (simple extension match)
        if let Some(g) = glob {
            let name = file_name.to_lowercase();
            let pattern = g.trim_start_matches('*').to_lowercase();
            if !name.ends_with(&pattern) {
                continue;
            }
        }

        // Skip binary / large files
        if metadata.len() > 1_000_000 {
            continue;
        }

        let content = match fs::read_to_string(&full_path) {
            Ok(c) => c,
            Err(_) => continue, // skip binary files
        };

        let rel_path = full_path
            .strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .to_string();

        for (i, line) in content.lines().enumerate() {
            if regex.is_match(line) {
                results.push(SearchResult {
                    file: rel_path.clone(),
                    line: i + 1,
                    content: line.to_string(),
                });

                if results.len() >= 100 {
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}
