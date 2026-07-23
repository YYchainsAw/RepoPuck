use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use serde::Serialize;

/// The game engine detected at a repository root.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GameEngine {
    Unity,
    Unreal,
}

/// A game-oriented semantic category for a repository path.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileCategory {
    Code,
    Scene,
    Asset,
    Config,
    Generated,
    Other,
}

/// Lightweight engine metadata that can be returned directly from a Tauri command.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProjectProfile {
    pub name: String,
    pub engine: GameEngine,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub descriptor_path: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectRiskKind {
    MissingMeta,
    OrphanMeta,
    GeneratedFile,
    LargeFile,
    LfsRecommended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectRiskSeverity {
    Warning,
    Danger,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProjectRisk {
    pub kind: ProjectRiskKind,
    pub severity: ProjectRiskSeverity,
    pub path: String,
    pub message: String,
}

/// Files at or above this size receive a visible large-file warning.
pub const LARGE_FILE_WARNING_BYTES: u64 = 50 * 1024 * 1024;
/// Most Git hosts reject ordinary Git blobs at or above this size.
pub const GIT_HOST_HARD_LIMIT_BYTES: u64 = 100 * 1024 * 1024;
/// Binary assets at or above this size are good Git LFS candidates.
pub const LFS_RECOMMENDED_BYTES: u64 = 10 * 1024 * 1024;

/// Detects a Unity or Unreal project without walking the whole repository.
///
/// Unity requires root-level `Assets` and `ProjectSettings` directories. Unreal
/// requires a root-level `.uproject` plus at least one conventional project
/// directory (`Content`, `Config`, `Source`, or `Plugins`).
pub fn detect_game_project(root: &Path) -> io::Result<Option<GameProjectProfile>> {
    let metadata = match fs::metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !metadata.is_dir() {
        return Ok(None);
    }

    let entries = root_entries(root)?;
    let assets = find_directory(&entries, "Assets");
    let project_settings = find_directory(&entries, "ProjectSettings");

    if let (Some(_assets), Some(project_settings)) = (assets, project_settings) {
        let version_file = find_child_file(project_settings, "ProjectVersion.txt");
        let version = version_file.as_deref().and_then(read_unity_version);
        let descriptor_path = version_file
            .as_ref()
            .map(|_| "ProjectSettings/ProjectVersion.txt".to_owned());

        return Ok(Some(GameProjectProfile {
            name: directory_name(root),
            engine: GameEngine::Unity,
            version,
            descriptor_path,
        }));
    }

    let has_unreal_layout = ["Content", "Config", "Source", "Plugins"]
        .iter()
        .any(|name| find_directory(&entries, name).is_some());
    if !has_unreal_layout {
        return Ok(None);
    }

    let mut descriptors = entries
        .iter()
        .filter(|entry| {
            entry.is_file
                && entry
                    .name
                    .rsplit_once('.')
                    .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("uproject"))
        })
        .collect::<Vec<_>>();
    descriptors.sort_by(|left, right| {
        let root_name = directory_name(root);
        let left_matches = file_stem(&left.name).eq_ignore_ascii_case(&root_name);
        let right_matches = file_stem(&right.name).eq_ignore_ascii_case(&root_name);
        right_matches
            .cmp(&left_matches)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    let Some(descriptor) = descriptors.first() else {
        return Ok(None);
    };
    let version = read_unreal_version(&descriptor.path);

    Ok(Some(GameProjectProfile {
        name: file_stem(&descriptor.name).to_owned(),
        engine: GameEngine::Unreal,
        version,
        descriptor_path: Some(descriptor.name.clone()),
    }))
}

/// Classifies a repository-relative path using game-engine conventions.
pub fn classify_path(engine: GameEngine, path: impl AsRef<Path>) -> FileCategory {
    let Some(path) = normalized_repository_path(path.as_ref()) else {
        return FileCategory::Other;
    };
    let lower = path.to_lowercase();
    let components = lower.split('/').collect::<Vec<_>>();
    let first = components.first().copied().unwrap_or_default();
    let file_name = components.last().copied().unwrap_or_default();
    let extension = extension(file_name);

    if is_generated_path(engine, &components) {
        return FileCategory::Generated;
    }

    let is_engine_config = match engine {
        GameEngine::Unity => {
            first == "projectsettings"
                || (first == "packages"
                    && matches!(file_name, "manifest.json" | "packages-lock.json"))
        }
        GameEngine::Unreal => first == "config",
    };
    if is_engine_config {
        return FileCategory::Config;
    }

    let is_scene = match engine {
        GameEngine::Unity => matches!(extension, "unity" | "prefab" | "playable"),
        GameEngine::Unreal => {
            extension == "umap"
                || (extension == "uasset"
                    && (components.iter().any(|component| {
                        matches!(*component, "blueprint" | "blueprints" | "blueprintclasses")
                    }) || is_blueprint_file(file_name)))
        }
    };
    if is_scene {
        return FileCategory::Scene;
    }

    if matches!(
        extension,
        "c" | "cc"
            | "cpp"
            | "cxx"
            | "h"
            | "hh"
            | "hpp"
            | "hxx"
            | "inl"
            | "ixx"
            | "cs"
            | "java"
            | "kt"
            | "kts"
            | "js"
            | "jsx"
            | "ts"
            | "tsx"
            | "py"
            | "rs"
            | "go"
            | "swift"
            | "m"
            | "mm"
            | "shader"
            | "compute"
            | "hlsl"
            | "hlsli"
            | "glsl"
            | "cginc"
            | "usf"
            | "ush"
    ) {
        return FileCategory::Code;
    }

    if matches!(
        extension,
        "json"
            | "json5"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "cfg"
            | "conf"
            | "xml"
            | "properties"
            | "config"
            | "props"
            | "targets"
            | "sln"
            | "csproj"
            | "vcxproj"
            | "filters"
            | "asmdef"
            | "asmref"
            | "meta"
            | "gitignore"
            | "gitattributes"
            | "gitmodules"
            | "editorconfig"
    ) || matches!(
        file_name,
        ".gitignore" | ".gitattributes" | ".gitmodules" | ".editorconfig"
    ) || matches!(extension, "uproject" | "uplugin")
    {
        return FileCategory::Config;
    }

    if matches!(
        extension,
        "asset"
            | "mat"
            | "anim"
            | "controller"
            | "overridecontroller"
            | "spriteatlas"
            | "physicmaterial"
            | "physicsmaterial2d"
            | "rendertexture"
            | "terrainlayer"
            | "lighting"
            | "mixer"
            | "guiskin"
            | "bytes"
            | "uasset"
            | "ubulk"
            | "uexp"
            | "ufont"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "bmp"
            | "tga"
            | "tif"
            | "tiff"
            | "webp"
            | "psd"
            | "psb"
            | "exr"
            | "hdr"
            | "svg"
            | "fbx"
            | "obj"
            | "blend"
            | "dae"
            | "3ds"
            | "gltf"
            | "glb"
            | "wav"
            | "mp3"
            | "ogg"
            | "flac"
            | "aiff"
            | "mp4"
            | "mov"
            | "avi"
            | "mkv"
            | "ttf"
            | "otf"
    ) || matches!(
        (engine, first),
        (GameEngine::Unity, "assets") | (GameEngine::Unreal, "content")
    ) {
        return FileCategory::Asset;
    }

    FileCategory::Other
}

/// Reports Unity `.meta` integrity and commit-selection pairing risks.
///
/// `changed_paths` should contain all Git changes and `selected_paths` the
/// subset currently staged/selected in RepoPuck. Passing an empty selection
/// performs only on-disk integrity checks.
#[cfg(test)]
pub fn detect_unity_meta_risks(
    root: &Path,
    changed_paths: &[String],
    selected_paths: &[String],
) -> Vec<GameProjectRisk> {
    detect_unity_meta_risks_inner(root, changed_paths, selected_paths, None)
}

/// Reports Unity `.meta` risks using the real staged index state for commit-time checks.
pub fn detect_unity_meta_risks_with_index(
    root: &Path,
    changed_paths: &[String],
    selected_paths: &[String],
    index_paths: &HashSet<String>,
) -> Vec<GameProjectRisk> {
    detect_unity_meta_risks_inner(root, changed_paths, selected_paths, Some(index_paths))
}

fn detect_unity_meta_risks_inner(
    root: &Path,
    changed_paths: &[String],
    selected_paths: &[String],
    index_paths: Option<&HashSet<String>>,
) -> Vec<GameProjectRisk> {
    let changed = normalized_path_map(changed_paths);
    let selected = normalized_path_set(selected_paths);
    let mut risks = Vec::new();

    for (key, path) in &changed {
        if !is_unity_asset_path(path)
            || classify_path(GameEngine::Unity, Path::new(path)) == FileCategory::Generated
        {
            continue;
        }

        if key.ends_with(".meta") {
            let asset_key = key.trim_end_matches(".meta");
            let asset_path = path[..path.len().saturating_sub(5)].to_owned();
            let asset_changed = changed.contains_key(asset_key);
            let asset_exists = repository_path(root, &asset_path).is_some_and(|path| path.exists());
            let meta_exists = repository_path(root, path).is_some_and(|path| path.exists());

            if asset_exists && !meta_exists {
                push_unique_risk(
                    &mut risks,
                    GameProjectRisk {
                        kind: ProjectRiskKind::MissingMeta,
                        severity: ProjectRiskSeverity::Danger,
                        path: asset_path,
                        message: "This Unity asset is missing its .meta file.".to_owned(),
                    },
                );
            } else if meta_exists && !asset_exists && !asset_changed {
                push_unique_risk(
                    &mut risks,
                    GameProjectRisk {
                        kind: ProjectRiskKind::OrphanMeta,
                        severity: ProjectRiskSeverity::Danger,
                        path: path.clone(),
                        message: "This Unity .meta file has no matching asset.".to_owned(),
                    },
                );
            }

            if selected.contains(key) && asset_changed && !selected.contains(asset_key) {
                push_unique_risk(
                    &mut risks,
                    GameProjectRisk {
                        kind: ProjectRiskKind::OrphanMeta,
                        severity: ProjectRiskSeverity::Warning,
                        path: path.clone(),
                        message: "The matching Unity asset is changed but not selected.".to_owned(),
                    },
                );
            }
            continue;
        }

        let meta_key = format!("{key}.meta");
        let meta_path = format!("{path}.meta");
        let asset_exists = repository_path(root, path).is_some_and(|path| path.exists());
        let meta_exists = repository_path(root, &meta_path).is_some_and(|path| path.exists());
        let meta_changed = changed.contains_key(&meta_key);

        if asset_exists && !meta_exists {
            push_unique_risk(
                &mut risks,
                GameProjectRisk {
                    kind: ProjectRiskKind::MissingMeta,
                    severity: ProjectRiskSeverity::Danger,
                    path: path.clone(),
                    message: "This Unity asset is missing its .meta file.".to_owned(),
                },
            );
        } else if !asset_exists && meta_exists && !meta_changed {
            push_unique_risk(
                &mut risks,
                GameProjectRisk {
                    kind: ProjectRiskKind::OrphanMeta,
                    severity: ProjectRiskSeverity::Danger,
                    path: meta_path.clone(),
                    message: "Deleting this Unity asset would leave its .meta file behind."
                        .to_owned(),
                },
            );
        }

        if selected.contains(key) && meta_changed && !selected.contains(&meta_key) {
            push_unique_risk(
                &mut risks,
                GameProjectRisk {
                    kind: ProjectRiskKind::MissingMeta,
                    severity: ProjectRiskSeverity::Warning,
                    path: path.clone(),
                    message: "The matching Unity .meta file is changed but not selected."
                        .to_owned(),
                },
            );
        }
    }

    if let Some(index_paths) = index_paths {
        let index_paths = normalized_path_set(&index_paths.iter().cloned().collect::<Vec<_>>());
        let mut indexed_assets = index_paths.clone();
        for path in &index_paths {
            let mut ancestor = path.as_str();
            while let Some((parent, _)) = ancestor.rsplit_once('/') {
                indexed_assets.insert(parent.to_owned());
                ancestor = parent;
            }
        }
        let mut checked_assets = HashSet::new();
        for key in changed.keys() {
            let asset_key = key.strip_suffix(".meta").unwrap_or(key);
            if !checked_assets.insert(asset_key.to_owned())
                || !is_unity_asset_path(asset_key)
                || (!selected.contains(asset_key)
                    && !selected.contains(&format!("{asset_key}.meta")))
            {
                continue;
            }
            let meta_key = format!("{asset_key}.meta");
            let asset_staged = indexed_assets.contains(asset_key);
            let meta_staged = index_paths.contains(&meta_key);
            if asset_staged && !meta_staged {
                push_unique_risk(
                    &mut risks,
                    GameProjectRisk {
                        kind: ProjectRiskKind::MissingMeta,
                        severity: ProjectRiskSeverity::Danger,
                        path: changed
                            .get(asset_key)
                            .cloned()
                            .or_else(|| {
                                changed
                                    .get(&meta_key)
                                    .map(|path| path[..path.len().saturating_sub(5)].to_owned())
                            })
                            .unwrap_or_else(|| asset_key.to_owned()),
                        message:
                            "The staged Unity asset would be committed without its .meta file."
                                .to_owned(),
                    },
                );
            } else if !asset_staged && meta_staged {
                push_unique_risk(
                    &mut risks,
                    GameProjectRisk {
                        kind: ProjectRiskKind::OrphanMeta,
                        severity: ProjectRiskSeverity::Danger,
                        path: changed.get(&meta_key).cloned().unwrap_or(meta_key),
                        message:
                            "The staged Unity .meta file would be committed without its asset."
                                .to_owned(),
                    },
                );
            }
        }
    }

    risks.sort_by(|left, right| {
        left.path
            .to_lowercase()
            .cmp(&right.path.to_lowercase())
            .then_with(|| risk_order(left.kind).cmp(&risk_order(right.kind)))
    });
    risks
}

/// Returns commit-time risks for generated files, large blobs, and Git LFS candidates.
pub fn file_risks(
    engine: GameEngine,
    path: impl AsRef<Path>,
    size_bytes: u64,
) -> Vec<GameProjectRisk> {
    let display_path = normalized_repository_path(path.as_ref())
        .unwrap_or_else(|| path.as_ref().to_string_lossy().replace('\\', "/"));
    let category = classify_path(engine, path.as_ref());
    let mut risks = Vec::new();

    if category == FileCategory::Generated {
        risks.push(GameProjectRisk {
            kind: ProjectRiskKind::GeneratedFile,
            severity: ProjectRiskSeverity::Warning,
            path: display_path.clone(),
            message: "This file is inside an engine-generated directory.".to_owned(),
        });
    }

    if size_bytes >= LARGE_FILE_WARNING_BYTES {
        risks.push(GameProjectRisk {
            kind: ProjectRiskKind::LargeFile,
            severity: if size_bytes >= GIT_HOST_HARD_LIMIT_BYTES {
                ProjectRiskSeverity::Danger
            } else {
                ProjectRiskSeverity::Warning
            },
            path: display_path.clone(),
            message: if size_bytes >= GIT_HOST_HARD_LIMIT_BYTES {
                "This file is at least 100 MiB and may be rejected by the Git host.".to_owned()
            } else {
                "This file is at least 50 MiB and will make the repository heavier.".to_owned()
            },
        });
    }

    if category != FileCategory::Generated && is_lfs_candidate(engine, path.as_ref(), size_bytes) {
        risks.push(GameProjectRisk {
            kind: ProjectRiskKind::LfsRecommended,
            severity: ProjectRiskSeverity::Warning,
            path: display_path,
            message: "This binary game asset is a good Git LFS candidate.".to_owned(),
        });
    }

    risks
}

/// Determines whether an engine file should normally be tracked through Git LFS.
pub fn is_lfs_candidate(engine: GameEngine, path: impl AsRef<Path>, size_bytes: u64) -> bool {
    if classify_path(engine, path.as_ref()) == FileCategory::Generated {
        return false;
    }
    let normalized = normalized_repository_path(path.as_ref()).unwrap_or_default();
    let file_name = normalized.rsplit('/').next().unwrap_or_default();
    let extension = extension(file_name).to_lowercase();

    let engine_binary = match engine {
        GameEngine::Unity => matches!(
            extension.as_str(),
            "fbx"
                | "blend"
                | "psd"
                | "psb"
                | "tga"
                | "tif"
                | "tiff"
                | "exr"
                | "wav"
                | "aiff"
                | "flac"
                | "mp4"
                | "mov"
        ),
        GameEngine::Unreal => matches!(
            extension.as_str(),
            "uasset" | "umap" | "ubulk" | "uexp" | "ufont"
        ),
    };
    if engine_binary {
        return true;
    }

    let category = classify_path(engine, path.as_ref());
    size_bytes >= LFS_RECOMMENDED_BYTES
        && matches!(category, FileCategory::Asset | FileCategory::Scene)
}

#[derive(Debug)]
struct RootEntry {
    name: String,
    path: PathBuf,
    is_file: bool,
    is_directory: bool,
}

fn root_entries(root: &Path) -> io::Result<Vec<RootEntry>> {
    fs::read_dir(root)?
        .map(|entry| {
            let entry = entry?;
            let file_type = entry.file_type()?;
            Ok(RootEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path(),
                is_file: file_type.is_file(),
                is_directory: file_type.is_dir(),
            })
        })
        .collect()
}

fn find_directory<'a>(entries: &'a [RootEntry], name: &str) -> Option<&'a Path> {
    entries
        .iter()
        .find(|entry| entry.is_directory && entry.name.eq_ignore_ascii_case(name))
        .map(|entry| entry.path.as_path())
}

fn find_child_file(directory: &Path, name: &str) -> Option<PathBuf> {
    fs::read_dir(directory)
        .ok()?
        .filter_map(Result::ok)
        .find(|entry| {
            entry.file_type().is_ok_and(|file_type| file_type.is_file())
                && entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(name)
        })
        .map(|entry| entry.path())
}

fn read_unity_version(path: &Path) -> Option<String> {
    let contents = read_descriptor(path)?;
    contents.lines().find_map(|line| {
        line.trim()
            .strip_prefix("m_EditorVersion:")
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .map(str::to_owned)
    })
}

fn read_unreal_version(path: &Path) -> Option<String> {
    let descriptor = read_descriptor(path)?;
    let json = serde_json::from_str::<serde_json::Value>(&descriptor).ok()?;
    let association = json.get("EngineAssociation")?;
    match association {
        serde_json::Value::String(version) if !version.trim().is_empty() => {
            Some(version.trim().to_owned())
        }
        serde_json::Value::Number(version) => Some(version.to_string()),
        _ => None,
    }
}

fn read_descriptor(path: &Path) -> Option<String> {
    const MAX_DESCRIPTOR_BYTES: u64 = 64 * 1024;
    let file = fs::File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_DESCRIPTOR_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > MAX_DESCRIPTOR_BYTES {
        return None;
    }
    String::from_utf8(bytes).ok()
}

fn directory_name(root: &Path) -> String {
    root.file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.display().to_string())
}

fn file_stem(name: &str) -> &str {
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

fn normalized_repository_path(path: &Path) -> Option<String> {
    let value = path.as_os_str().to_string_lossy().replace('\\', "/");
    if value.starts_with('/') || value.starts_with("//") {
        return None;
    }
    let mut components = Vec::new();
    for component in value.split('/') {
        match component {
            "" | "." => {}
            ".." => return None,
            component if component.ends_with(':') && components.is_empty() => return None,
            component => components.push(component),
        }
    }
    (!components.is_empty()).then(|| components.join("/"))
}

fn extension(file_name: &str) -> &str {
    file_name
        .rsplit_once('.')
        .filter(|(stem, _)| !stem.is_empty())
        .map_or("", |(_, extension)| extension)
}

fn is_generated_path(engine: GameEngine, components: &[&str]) -> bool {
    let first = components.first().copied().unwrap_or_default();
    if matches!(
        first,
        ".git" | ".svn" | ".hg" | ".vs" | ".idea" | "node_modules" | "bin" | "obj"
    ) {
        return true;
    }

    match engine {
        GameEngine::Unity => matches!(
            first,
            "library"
                | "temp"
                | "logs"
                | "obj"
                | "memorycaptures"
                | "recordings"
                | "build"
                | "builds"
                | "userlogs"
        ),
        GameEngine::Unreal => components.iter().any(|component| {
            matches!(
                *component,
                "binaries" | "deriveddatacache" | "intermediate" | "saved"
            )
        }),
    }
}

fn is_blueprint_file(file_name: &str) -> bool {
    let stem = file_stem(file_name);
    ["bp_", "abp_", "wbp_", "bpi_", "bpc_"]
        .iter()
        .any(|prefix| stem.starts_with(prefix))
}

fn is_unity_asset_path(path: &str) -> bool {
    let mut components = path.split('/');
    components
        .next()
        .is_some_and(|component| component.eq_ignore_ascii_case("Assets"))
        && components.next().is_some()
}

fn normalized_path_map(paths: &[String]) -> HashMap<String, String> {
    paths
        .iter()
        .filter_map(|path| {
            let normalized = normalized_repository_path(Path::new(path))?;
            Some((normalized.to_lowercase(), normalized))
        })
        .collect()
}

fn normalized_path_set(paths: &[String]) -> HashSet<String> {
    paths
        .iter()
        .filter_map(|path| {
            normalized_repository_path(Path::new(path)).map(|path| path.to_lowercase())
        })
        .collect()
}

fn repository_path(root: &Path, relative: &str) -> Option<PathBuf> {
    let relative = normalized_repository_path(Path::new(relative))?;
    let mut path = root.to_path_buf();
    for component in relative.split('/') {
        path.push(component);
    }
    Some(path)
}

fn push_unique_risk(risks: &mut Vec<GameProjectRisk>, risk: GameProjectRisk) {
    if !risks.iter().any(|existing| {
        existing.kind == risk.kind
            && existing.path.eq_ignore_ascii_case(&risk.path)
            && existing.message == risk.message
    }) {
        risks.push(risk);
    }
}

fn risk_order(kind: ProjectRiskKind) -> u8 {
    match kind {
        ProjectRiskKind::MissingMeta => 0,
        ProjectRiskKind::OrphanMeta => 1,
        ProjectRiskKind::GeneratedFile => 2,
        ProjectRiskKind::LargeFile => 3,
        ProjectRiskKind::LfsRecommended => 4,
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
    };

    use super::*;

    static TEST_ID: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let id = TEST_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "repopuck-game-projects-{}-{id}-{name}",
                std::process::id()
            ));
            if path.exists() {
                fs::remove_dir_all(&path).expect("remove stale test directory");
            }
            fs::create_dir_all(&path).expect("create test directory");
            Self { path }
        }

        fn create_dir(&self, relative: &str) {
            fs::create_dir_all(self.path.join(relative)).expect("create fixture directory");
        }

        fn write(&self, relative: &str, contents: &str) {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(path, contents).expect("write fixture file");
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn strings(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|path| (*path).to_owned()).collect()
    }

    fn risk(risks: &[GameProjectRisk], kind: ProjectRiskKind, path: &str) -> bool {
        risks
            .iter()
            .any(|risk| risk.kind == kind && risk.path == path)
    }

    #[test]
    fn detects_unity_and_reads_the_editor_version() {
        let fixture = TestDirectory::new("SpaceGame");
        fixture.create_dir("Assets");
        fixture.create_dir("ProjectSettings");
        fixture.write(
            "ProjectSettings/ProjectVersion.txt",
            "m_EditorVersion: 2022.3.42f1\nm_EditorVersionWithRevision: 2022.3.42f1 (abc)\n",
        );

        let profile = detect_game_project(&fixture.path)
            .expect("detect project")
            .expect("Unity profile");

        assert_eq!(profile.engine, GameEngine::Unity);
        assert_eq!(profile.version.as_deref(), Some("2022.3.42f1"));
        assert_eq!(
            profile.descriptor_path.as_deref(),
            Some("ProjectSettings/ProjectVersion.txt")
        );
        let serialized = serde_json::to_value(profile).expect("serialize profile");
        assert_eq!(serialized["engine"], "unity");
        assert_eq!(
            serialized["descriptorPath"],
            "ProjectSettings/ProjectVersion.txt"
        );
    }

    #[test]
    fn detects_unity_when_the_optional_version_file_is_missing() {
        let fixture = TestDirectory::new("UnityWithoutVersion");
        fixture.create_dir("Assets");
        fixture.create_dir("ProjectSettings");

        let profile = detect_game_project(&fixture.path)
            .expect("detect project")
            .expect("Unity profile");

        assert_eq!(profile.engine, GameEngine::Unity);
        assert_eq!(profile.version, None);
        assert_eq!(profile.descriptor_path, None);
    }

    #[test]
    fn rejects_oversized_engine_descriptors_without_allocating_the_whole_file() {
        let fixture = TestDirectory::new("OversizedDescriptor");
        fixture.write("ProjectVersion.txt", &"x".repeat(64 * 1024 + 1));

        assert_eq!(
            read_descriptor(&fixture.path.join("ProjectVersion.txt")),
            None
        );
    }

    #[test]
    fn detects_unreal_blueprint_project_and_prefers_matching_descriptor() {
        let fixture = TestDirectory::new("OrbitGame");
        fixture.create_dir("Content");
        fixture.create_dir("Config");
        fixture.write("Another.uproject", r#"{"EngineAssociation":"5.3"}"#);
        let matching_name = format!(
            "{}.uproject",
            fixture.path.file_name().unwrap().to_string_lossy()
        );
        fixture.write(&matching_name, r#"{"EngineAssociation":"5.5"}"#);

        let profile = detect_game_project(&fixture.path)
            .expect("detect project")
            .expect("Unreal profile");

        assert_eq!(profile.engine, GameEngine::Unreal);
        assert_eq!(profile.version.as_deref(), Some("5.5"));
        assert_eq!(
            profile.descriptor_path.as_deref(),
            Some(matching_name.as_str())
        );
    }

    #[test]
    fn does_not_treat_a_lone_uproject_as_a_complete_project() {
        let fixture = TestDirectory::new("IncompleteUnreal");
        fixture.write("Game.uproject", "{}");
        assert_eq!(
            detect_game_project(&fixture.path).expect("detect project"),
            None
        );
    }

    #[test]
    fn returns_none_for_missing_or_unknown_roots() {
        let fixture = TestDirectory::new("Unknown");
        fixture.create_dir("src");
        assert_eq!(
            detect_game_project(&fixture.path).expect("detect project"),
            None
        );
        assert_eq!(
            detect_game_project(&fixture.path.join("missing")).expect("detect missing"),
            None
        );
    }

    #[test]
    fn classifies_unity_paths_by_semantics() {
        assert_eq!(
            classify_path(GameEngine::Unity, "Assets/Scripts/Player.cs"),
            FileCategory::Code
        );
        assert_eq!(
            classify_path(GameEngine::Unity, "Assets/Scenes/Main.unity"),
            FileCategory::Scene
        );
        assert_eq!(
            classify_path(GameEngine::Unity, "Assets/Prefabs/Hero.prefab"),
            FileCategory::Scene
        );
        assert_eq!(
            classify_path(GameEngine::Unity, "Assets/Art/Hero.fbx"),
            FileCategory::Asset
        );
        assert_eq!(
            classify_path(GameEngine::Unity, "ProjectSettings/QualitySettings.asset"),
            FileCategory::Config
        );
        assert_eq!(
            classify_path(GameEngine::Unity, r"Library\ArtifactDB"),
            FileCategory::Generated
        );
        assert_eq!(
            classify_path(GameEngine::Unity, "Assets/Library/Book.png"),
            FileCategory::Asset
        );
    }

    #[test]
    fn classifies_unreal_blueprints_maps_and_generated_paths() {
        assert_eq!(
            classify_path(GameEngine::Unreal, "Content/Maps/Arena.umap"),
            FileCategory::Scene
        );
        assert_eq!(
            classify_path(GameEngine::Unreal, "Content/UI/WBP_Menu.uasset"),
            FileCategory::Scene
        );
        assert_eq!(
            classify_path(GameEngine::Unreal, "Content/Textures/T_Wall.uasset"),
            FileCategory::Asset
        );
        assert_eq!(
            classify_path(GameEngine::Unreal, "Source/Game/GameMode.cpp"),
            FileCategory::Code
        );
        assert_eq!(
            classify_path(GameEngine::Unreal, "Config/DefaultEngine.ini"),
            FileCategory::Config
        );
        assert_eq!(
            classify_path(
                GameEngine::Unreal,
                "Plugins/MyPlugin/Intermediate/cache.bin"
            ),
            FileCategory::Generated
        );
    }

    #[test]
    fn reports_missing_and_orphaned_unity_meta_files() {
        let fixture = TestDirectory::new("MetaIntegrity");
        fixture.write("Assets/Hero.prefab", "prefab");
        fixture.write("Assets/Deleted.png.meta", "guid: old");
        let changed = strings(&["Assets/Hero.prefab", "Assets/Deleted.png"]);

        let risks = detect_unity_meta_risks(&fixture.path, &changed, &[]);

        assert!(risk(
            &risks,
            ProjectRiskKind::MissingMeta,
            "Assets/Hero.prefab"
        ));
        assert!(risk(
            &risks,
            ProjectRiskKind::OrphanMeta,
            "Assets/Deleted.png.meta"
        ));
        assert!(
            risks
                .iter()
                .filter(|risk| risk.severity == ProjectRiskSeverity::Danger)
                .count()
                >= 2
        );
    }

    #[test]
    fn reports_a_deleted_meta_file_when_its_unity_asset_remains() {
        let fixture = TestDirectory::new("DeletedMeta");
        fixture.write("Assets/Hero.prefab", "prefab");

        let risks = detect_unity_meta_risks(
            &fixture.path,
            &strings(&["Assets/Hero.prefab.meta"]),
            &strings(&["Assets/Hero.prefab.meta"]),
        );

        assert!(risk(
            &risks,
            ProjectRiskKind::MissingMeta,
            "Assets/Hero.prefab"
        ));
        assert!(risks
            .iter()
            .any(|risk| risk.severity == ProjectRiskSeverity::Danger));
    }

    #[test]
    fn deleting_an_already_orphaned_meta_file_is_safe() {
        let fixture = TestDirectory::new("RemoveOrphanMeta");

        let risks = detect_unity_meta_risks(
            &fixture.path,
            &strings(&["Assets/Ghost.png.meta"]),
            &strings(&["Assets/Ghost.png.meta"]),
        );

        assert!(risks.is_empty());
    }

    #[test]
    fn reports_one_sided_meta_commit_selection() {
        let fixture = TestDirectory::new("MetaSelection");
        fixture.write("Assets/Hero.prefab", "prefab");
        fixture.write("Assets/Hero.prefab.meta", "guid: hero");
        let changed = strings(&["Assets/Hero.prefab", "Assets/Hero.prefab.meta"]);

        let asset_only =
            detect_unity_meta_risks(&fixture.path, &changed, &strings(&["Assets/Hero.prefab"]));
        assert!(risk(
            &asset_only,
            ProjectRiskKind::MissingMeta,
            "Assets/Hero.prefab"
        ));

        let meta_only = detect_unity_meta_risks(
            &fixture.path,
            &changed,
            &strings(&["Assets/Hero.prefab.meta"]),
        );
        assert!(risk(
            &meta_only,
            ProjectRiskKind::OrphanMeta,
            "Assets/Hero.prefab.meta"
        ));

        let paired = detect_unity_meta_risks(&fixture.path, &changed, &changed);
        assert!(paired.is_empty());
    }

    #[test]
    fn accepts_a_staged_meta_file_for_a_non_empty_unity_folder() {
        let fixture = TestDirectory::new("FolderMeta");
        fixture.create_dir("Assets/NewFolder");
        fixture.write("Assets/NewFolder.meta", "guid: folder");
        let changed = strings(&["Assets/NewFolder.meta"]);
        let index_paths = HashSet::from([
            "Assets/NewFolder.meta".to_owned(),
            "Assets/NewFolder/Tracked.asset".to_owned(),
        ]);

        let risks =
            detect_unity_meta_risks_with_index(&fixture.path, &changed, &changed, &index_paths);

        assert!(risks.is_empty());
    }

    #[test]
    fn reports_an_empty_folder_meta_as_orphaned_in_the_index() {
        let fixture = TestDirectory::new("EmptyFolderMeta");
        fixture.create_dir("Assets/EmptyFolder");
        fixture.write("Assets/EmptyFolder.meta", "guid: folder");
        let changed = strings(&["Assets/EmptyFolder.meta"]);
        let index_paths = HashSet::from(["Assets/EmptyFolder.meta".to_owned()]);

        let risks =
            detect_unity_meta_risks_with_index(&fixture.path, &changed, &changed, &index_paths);

        assert!(risks.iter().any(|risk| {
            risk.kind == ProjectRiskKind::OrphanMeta
                && risk.severity == ProjectRiskSeverity::Danger
                && risk.path == "Assets/EmptyFolder.meta"
        }));
    }

    #[test]
    fn accepts_a_complete_staged_folder_deletion_despite_ignored_worktree_files() {
        let fixture = TestDirectory::new("RestoredFolderMeta");
        fixture.create_dir("Assets/ExistingFolder");
        fixture.write("Assets/ExistingFolder.meta", "guid: folder");
        let changed = strings(&["Assets/ExistingFolder.meta"]);

        let risks =
            detect_unity_meta_risks_with_index(&fixture.path, &changed, &changed, &HashSet::new());

        assert!(risks.is_empty());
    }

    #[test]
    fn reports_a_staged_folder_meta_deletion_when_indexed_children_remain() {
        let fixture = TestDirectory::new("DeletedFolderMeta");
        fixture.create_dir("Assets/ExistingFolder");
        fixture.write("Assets/ExistingFolder.meta", "guid: folder");
        let changed = strings(&["Assets/ExistingFolder.meta"]);
        let index_paths = HashSet::from(["Assets/ExistingFolder/Tracked.asset".to_owned()]);

        let risks =
            detect_unity_meta_risks_with_index(&fixture.path, &changed, &changed, &index_paths);

        assert!(risks.iter().any(|risk| {
            risk.kind == ProjectRiskKind::MissingMeta
                && risk.severity == ProjectRiskSeverity::Danger
                && risk.path == "Assets/ExistingFolder"
        }));
    }

    #[test]
    fn ignores_meta_rules_outside_assets_and_rejects_parent_traversal() {
        let fixture = TestDirectory::new("MetaScope");
        fixture.write("ProjectSettings/Settings.asset", "settings");
        let changed = strings(&[
            "ProjectSettings/Settings.asset",
            "../outside.prefab",
            "Library/cache.asset",
        ]);

        assert!(detect_unity_meta_risks(&fixture.path, &changed, &[]).is_empty());
    }

    #[test]
    fn finds_engine_specific_lfs_candidates() {
        assert!(is_lfs_candidate(
            GameEngine::Unreal,
            "Content/Blueprints/BP_Player.uasset",
            1
        ));
        assert!(is_lfs_candidate(
            GameEngine::Unity,
            "Assets/Models/Hero.fbx",
            1
        ));
        assert!(is_lfs_candidate(
            GameEngine::Unity,
            "Assets/Textures/Huge.png",
            LFS_RECOMMENDED_BYTES
        ));
        assert!(!is_lfs_candidate(
            GameEngine::Unity,
            "Assets/Scripts/Huge.cs",
            GIT_HOST_HARD_LIMIT_BYTES
        ));
        assert!(!is_lfs_candidate(
            GameEngine::Unreal,
            "Intermediate/Huge.uasset",
            GIT_HOST_HARD_LIMIT_BYTES
        ));
    }

    #[test]
    fn emits_serializable_generated_large_and_lfs_risks() {
        let generated = file_risks(
            GameEngine::Unreal,
            "Saved/Cooked/Huge.pak",
            GIT_HOST_HARD_LIMIT_BYTES,
        );
        assert!(risk(
            &generated,
            ProjectRiskKind::GeneratedFile,
            "Saved/Cooked/Huge.pak"
        ));
        assert!(risk(
            &generated,
            ProjectRiskKind::LargeFile,
            "Saved/Cooked/Huge.pak"
        ));
        assert!(!generated
            .iter()
            .any(|risk| risk.kind == ProjectRiskKind::LfsRecommended));

        let asset = file_risks(
            GameEngine::Unreal,
            "Content/Maps/OpenWorld.umap",
            GIT_HOST_HARD_LIMIT_BYTES,
        );
        assert!(asset
            .iter()
            .any(|risk| risk.kind == ProjectRiskKind::LargeFile
                && risk.severity == ProjectRiskSeverity::Danger));
        assert!(asset
            .iter()
            .any(|risk| risk.kind == ProjectRiskKind::LfsRecommended));

        let json = serde_json::to_value(&asset).expect("serialize risks");
        assert_eq!(json[0]["kind"], "large-file");
        assert_eq!(json[0]["severity"], "danger");
    }

    #[test]
    fn risk_enum_json_values_match_the_frontend_contract() {
        let kinds = [
            ProjectRiskKind::MissingMeta,
            ProjectRiskKind::OrphanMeta,
            ProjectRiskKind::GeneratedFile,
            ProjectRiskKind::LargeFile,
            ProjectRiskKind::LfsRecommended,
        ];
        let values = kinds
            .iter()
            .map(|kind| serde_json::to_value(kind).expect("serialize kind"))
            .collect::<Vec<_>>();
        assert_eq!(
            values,
            vec![
                "missing-meta",
                "orphan-meta",
                "generated-file",
                "large-file",
                "lfs-recommended"
            ]
        );
    }

    #[test]
    fn absolute_and_parent_paths_are_not_classified() {
        assert_eq!(
            classify_path(GameEngine::Unity, Path::new("../Assets/Hero.prefab")),
            FileCategory::Other
        );
        assert_eq!(
            classify_path(GameEngine::Unity, Path::new("C:/Game/Assets/Hero.prefab")),
            FileCategory::Other
        );
    }
}
