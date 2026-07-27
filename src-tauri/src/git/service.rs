use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use crate::game_projects::{
    classify_path, detect_game_project, detect_unity_meta_risks_with_index, file_risks, GameEngine,
    GameProjectRisk, ProjectRiskKind, ProjectRiskSeverity,
};

use super::{
    model::{BranchSummary, RepositoryInfo, RepositorySnapshot},
    parser::{parse_changes, parse_changes_with_renames},
    runner::{sanitize_remote_url, GitCancellation, GitError, GitRunner},
};

#[derive(Clone, Debug)]
pub struct GitService {
    runner: GitRunner,
    game_project_root: Option<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RemoteTarget {
    name: String,
    merge_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct IndexBlob {
    oid: String,
    size: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StagedAiContext {
    pub content: String,
    pub included_files: usize,
    pub binary_files: usize,
    pub truncated: bool,
    pub excluded_files: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct StagedAiFile {
    patch_path: String,
    checked_paths: Vec<String>,
}

impl GitService {
    pub fn open(path: &Path) -> Result<Self, GitError> {
        if !path.is_dir() {
            return Err(invalid_repository());
        }
        let requested_canonical = path.canonicalize().map_err(|_| invalid_repository())?;
        let probe = GitRunner::new(path);
        let inside = probe.run(["rev-parse", "--is-inside-work-tree"])?;
        if text(&inside).trim() != "true" {
            return Err(invalid_repository());
        }
        let top_level = probe.run(["rev-parse", "--show-toplevel"])?;
        let root = PathBuf::from(text(&top_level).trim());
        let root_canonical = root.canonicalize().map_err(|_| invalid_repository())?;
        let relative = requested_canonical
            .strip_prefix(&root_canonical)
            .map_err(|_| invalid_repository())?;
        let requested = root.join(relative);
        let game_project_root = find_game_project_root(&requested, &root);
        Ok(Self {
            runner: GitRunner::new(&root),
            game_project_root,
        })
    }

    pub fn with_cancellation(&self, cancellation: GitCancellation) -> Self {
        Self {
            runner: self.runner.with_cancellation(cancellation),
            game_project_root: self.game_project_root.clone(),
        }
    }

    pub fn snapshot(&self) -> Result<RepositorySnapshot, GitError> {
        let current_branch = self.current_branch()?;
        let status =
            self.runner
                .run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
        let cached = self.runner.run([
            "diff",
            "--numstat",
            "-z",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
        ])?;
        let unstaged =
            self.runner
                .run(["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv"])?;
        let mut changes = parse_changes(&status, &cached, &unstaged).map_err(GitError::safe)?;
        let (branches, upstream_target) = self.branches(&current_branch)?;
        let (ahead, behind) = self.ahead_behind()?;
        let repository_path = self.runner.repository();
        let name = repository_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| repository_path.display().to_string());
        let target_remote = if let Some(target) = upstream_target {
            Some(target.name)
        } else if self.remote_exists("origin")? {
            Some("origin".to_owned())
        } else {
            None
        };
        let remote_url = target_remote
            .as_deref()
            .map(|remote| self.remote_url(remote))
            .transpose()?
            .flatten();
        let game_project_root = self.game_project_root.as_deref().unwrap_or(repository_path);
        let mut game_project = detect_game_project(game_project_root).ok().flatten();
        if let Some(profile) = &mut game_project {
            profile.descriptor_path = profile.descriptor_path.as_deref().map(|descriptor| {
                repository_game_path(repository_path, game_project_root, descriptor)
            });
            for change in &mut changes {
                change.game_category = Some(
                    game_relative_path(repository_path, game_project_root, &change.path)
                        .map(|path| classify_path(profile.engine, path))
                        .unwrap_or(crate::game_projects::FileCategory::Other),
                );
            }
        }
        let game_safety_issues = if let Some(profile) = &game_project {
            self.game_safety_issues(profile.engine, game_project_root, &changes)?
        } else {
            Vec::new()
        };

        Ok(RepositorySnapshot {
            repository: RepositoryInfo {
                name,
                path: repository_path.display().to_string(),
                selection_path: (self.selection_path() != repository_path)
                    .then(|| self.selection_path().display().to_string()),
                remote_name: target_remote,
                remote_url,
            },
            current_branch,
            branches,
            ahead,
            behind,
            changes,
            game_project,
            game_safety_issues,
        })
    }

    pub fn change_count(&self) -> Result<usize, GitError> {
        let status =
            self.runner
                .run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
        parse_changes_with_renames(&status, &[], &[])
            .map(|parsed| {
                parsed
                    .changes
                    .into_iter()
                    .map(|change| change.path)
                    .collect::<HashSet<_>>()
                    .len()
            })
            .map_err(GitError::safe)
    }

    pub fn current_branch(&self) -> Result<String, GitError> {
        self.runner
            .run(["branch", "--show-current"])
            .map(|value| text(&value).trim().to_owned())
    }

    pub fn staged_diff_for_ai(&self) -> Result<StagedAiContext, GitError> {
        const MAX_CONTEXT_BYTES: usize = 64 * 1024;
        const MAX_FILES: usize = 200;
        const MAX_PATHSPEC_BYTES: usize = 12 * 1024;
        const TRUNCATION_NOTICE: &str =
            "\n\n[RepoPuck truncated the staged diff to the safe context limit.]";

        let names = self.runner.run([
            "diff",
            "--cached",
            "--name-status",
            "-z",
            "--find-renames",
            "--diff-filter=ACDMRTUXB",
            "--no-ext-diff",
            "--no-textconv",
        ])?;
        let staged_files = parse_staged_name_status(&names)?;
        if staged_files.is_empty() {
            return Err(GitError::safe(
                "Stage at least one file before generating a commit message",
            ));
        }

        let mut excluded_files = Vec::new();
        let mut allowed_files = Vec::new();
        for file in staged_files {
            if file
                .checked_paths
                .iter()
                .any(|path| is_sensitive_ai_path(path))
            {
                excluded_files.push(file.patch_path);
            } else {
                allowed_files.push(file.patch_path);
            }
        }
        if allowed_files.is_empty() {
            return Err(GitError::safe(
                "All staged files were excluded because they may contain secrets",
            ));
        }

        let mut content = String::from(
            "The following data is from the Git staged index only. Binary contents and sensitive paths are omitted.\n",
        );
        if !excluded_files.is_empty() {
            content.push_str(&format!(
                "{} sensitive staged path(s) were excluded.\n",
                excluded_files.len()
            ));
        }
        let mut truncated = false;

        let (selected_files, file_selection_truncated) =
            select_ai_files(allowed_files, MAX_FILES, MAX_PATHSPEC_BYTES);
        truncated |= file_selection_truncated;
        if selected_files.is_empty() {
            return Err(GitError::safe(
                "Staged file paths exceed the safe AI context limit",
            ));
        }

        let numstat = self.runner.run_with_literal_paths(
            &[
                "diff",
                "--cached",
                "--numstat",
                "-z",
                "--no-ext-diff",
                "--no-textconv",
            ],
            &selected_files,
        )?;
        let binary_paths = parse_binary_numstat_paths(&numstat)?;
        let included_files = selected_files.len();
        let binary_files = binary_paths.len();
        for path in &binary_paths {
            let section = format!("\n--- {path}\n[Binary file changed; content omitted.]\n");
            let limit_before_notice = MAX_CONTEXT_BYTES.saturating_sub(TRUNCATION_NOTICE.len());
            if !append_utf8_bounded(&mut content, &section, limit_before_notice) {
                truncated = true;
                break;
            }
        }

        let text_paths = selected_files
            .into_iter()
            .filter(|path| !binary_paths.contains(path))
            .collect::<Vec<_>>();
        let limit_before_notice = MAX_CONTEXT_BYTES.saturating_sub(TRUNCATION_NOTICE.len());
        if !text_paths.is_empty() && content.len() < limit_before_notice {
            let patch = self.runner.run_with_literal_paths(
                &[
                    "diff",
                    "--cached",
                    "--unified=3",
                    "--no-ext-diff",
                    "--no-textconv",
                ],
                &text_paths,
            )?;
            let patch = redact_sensitive_patch_lines(&String::from_utf8_lossy(&patch));
            if !append_utf8_bounded(&mut content, &format!("\n{patch}"), limit_before_notice) {
                truncated = true;
            }
        }

        if truncated {
            content.push_str(TRUNCATION_NOTICE);
        }
        Ok(StagedAiContext {
            content,
            included_files,
            binary_files,
            truncated,
            excluded_files,
        })
    }

    pub fn refresh_token(&self) -> Result<String, GitError> {
        let status = self.runner.run([
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ])?;
        let unstaged =
            self.runner
                .run(["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv"])?;
        let mut token_input =
            Vec::with_capacity(std::mem::size_of::<u64>() + status.len() + unstaged.len());
        token_input.extend_from_slice(&(status.len() as u64).to_le_bytes());
        token_input.extend_from_slice(&status);
        token_input.extend_from_slice(&unstaged);
        Ok(format!("{:016x}", fnv1a(&token_input)))
    }

    pub fn set_staged(&self, paths: &[String], staged: bool) -> Result<(), GitError> {
        if paths.is_empty() {
            return Ok(());
        }
        let status =
            self.runner
                .run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
        let parsed = parse_changes_with_renames(&status, &[], &[]).map_err(GitError::safe)?;
        let current_paths = parsed
            .changes
            .iter()
            .map(|change| change.path.as_str())
            .collect::<HashSet<_>>();
        let mut expanded_paths = Vec::with_capacity(paths.len() * 2);
        for path in paths {
            if !current_paths.contains(path.as_str()) {
                return Err(GitError::safe(
                    "Selected path is no longer a current Git change",
                ));
            }
            if let Some(source) = parsed.rename_sources.get(path) {
                expanded_paths.push(source.clone());
            }
            expanded_paths.push(path.clone());
        }
        if staged {
            self.runner
                .run_with_literal_paths(&["add"], &expanded_paths)?;
        } else if self.has_head()? {
            self.runner
                .run_with_literal_paths(&["restore", "--staged"], &expanded_paths)?;
        } else {
            self.runner
                .run_with_literal_paths(&["rm", "--cached"], &expanded_paths)?;
        }
        Ok(())
    }

    pub fn commit(&self, message: &str) -> Result<(), GitError> {
        if message.trim().is_empty() {
            return Err(GitError::safe("Commit message cannot be empty"));
        }
        self.runner
            .run(["commit", "--cleanup=verbatim", "-m", message])?;
        Ok(())
    }

    pub fn amend_last_commit(&self, message: Option<&str>) -> Result<(), GitError> {
        if !self.has_head()? {
            return Err(GitError::safe("Cannot amend without an existing commit"));
        }
        match message.filter(|message| !message.trim().is_empty()) {
            Some(message) => {
                self.runner
                    .run(["commit", "--amend", "--cleanup=verbatim", "-m", message])?;
            }
            None => {
                self.runner.run(["commit", "--amend", "--no-edit"])?;
            }
        }
        Ok(())
    }

    pub fn push(&self) -> Result<(), GitError> {
        let (target, set_upstream) = match self.upstream_target()? {
            Some(target) => (target, false),
            None => (self.origin_target()?, true),
        };
        self.require_remote(&target.name)?;
        let refspec = format!("HEAD:{}", target.merge_ref);
        if set_upstream {
            self.runner
                .run(["push", "--set-upstream", "--", &target.name, &refspec])?;
        } else {
            self.runner.run(["push", "--", &target.name, &refspec])?;
        }
        Ok(())
    }

    pub fn switch_branch(&self, branch: &str) -> Result<(), GitError> {
        self.validate_branch(branch)?;
        self.runner.run(["switch", "--", branch])?;
        Ok(())
    }

    pub fn create_branch(&self, branch: &str) -> Result<(), GitError> {
        self.validate_branch(branch)?;
        self.runner.run(["switch", "-c", branch])?;
        Ok(())
    }

    pub fn fetch(&self) -> Result<(), GitError> {
        let remote = self.fetch_remote()?;
        self.runner.run(["fetch", "--prune", "--", &remote])?;
        Ok(())
    }

    pub fn pull(&self) -> Result<(), GitError> {
        let target = self
            .upstream_target()?
            .ok_or_else(|| GitError::safe("Current Git branch has no upstream"))?;
        self.require_remote(&target.name)?;
        self.runner
            .run(["pull", "--ff-only", "--", &target.name, &target.merge_ref])?;
        Ok(())
    }

    pub fn stash(&self) -> Result<(), GitError> {
        self.runner.run(["stash", "push", "--include-untracked"])?;
        Ok(())
    }

    pub fn repository_path(&self) -> &Path {
        self.runner.repository()
    }

    pub fn selection_path(&self) -> &Path {
        self.game_project_root
            .as_deref()
            .unwrap_or_else(|| self.runner.repository())
    }

    fn game_safety_issues(
        &self,
        engine: GameEngine,
        game_project_root: &Path,
        changes: &[super::model::ChangeEntry],
    ) -> Result<Vec<GameProjectRisk>, GitError> {
        let repository_root = self.runner.repository();
        let scoped_changes = changes
            .iter()
            .filter_map(|change| {
                game_relative_path(repository_root, game_project_root, &change.path)
                    .map(|relative| (change, relative))
            })
            .collect::<Vec<_>>();
        if scoped_changes.is_empty() {
            return Ok(Vec::new());
        }
        let changed_paths = scoped_changes
            .iter()
            .map(|(_, relative)| relative.clone())
            .collect::<Vec<_>>();
        let selected_paths = scoped_changes
            .iter()
            .filter(|(change, _)| change.staged)
            .map(|(_, relative)| relative.clone())
            .collect::<Vec<_>>();
        let mut index_candidate_paths = scoped_changes
            .iter()
            .map(|(change, _)| change.path.clone())
            .collect::<Vec<_>>();
        if engine == GameEngine::Unity {
            let changed_keys = changed_paths
                .iter()
                .map(|path| path.replace('\\', "/").to_lowercase())
                .collect::<HashSet<_>>();
            for (_, relative) in &scoped_changes {
                let normalized = relative.replace('\\', "/");
                if !normalized.to_lowercase().starts_with("assets/") {
                    continue;
                }
                if let Some(asset_relative) = strip_meta_suffix(&normalized) {
                    if changed_keys.contains(&asset_relative.to_lowercase()) {
                        continue;
                    }
                    let repository_asset =
                        repository_game_path(repository_root, game_project_root, asset_relative);
                    // A Unity folder has no index entry of its own. A literal directory
                    // path asks ls-files for its indexed descendants, allowing commit-time
                    // pairing without trusting an ignored directory left in the worktree.
                    index_candidate_paths.push(repository_asset);
                } else {
                    index_candidate_paths.push(repository_game_path(
                        repository_root,
                        game_project_root,
                        &format!("{normalized}.meta"),
                    ));
                }
            }
        }
        let index_entries = self.index_entries(&index_candidate_paths)?;
        let mut issues = if engine == GameEngine::Unity {
            let index_paths = index_entries
                .keys()
                .filter_map(|path| game_relative_path(repository_root, game_project_root, path))
                .collect::<HashSet<_>>();
            detect_unity_meta_risks_with_index(
                game_project_root,
                &changed_paths,
                &selected_paths,
                &index_paths,
            )
            .into_iter()
            .map(|mut issue| {
                issue.path = repository_game_path(repository_root, game_project_root, &issue.path);
                issue
            })
            .collect()
        } else {
            Vec::new()
        };
        let staged_paths = scoped_changes
            .iter()
            .filter(|(change, _)| change.staged && change.kind != super::model::ChangeKind::Deleted)
            .map(|(change, _)| change.path.clone())
            .collect::<Vec<_>>();
        let index_blobs = self.index_blobs(&staged_paths, &index_entries)?;
        let staged_path_set = staged_paths.iter().cloned().collect::<HashSet<_>>();
        let staged_lfs_pointers = self.index_lfs_pointer_paths(&staged_path_set, &index_blobs)?;
        let mut prepared_risks = Vec::new();
        for (change, relative) in scoped_changes {
            if change.kind == super::model::ChangeKind::Deleted {
                continue;
            }
            let size_bytes = if change.staged {
                index_blobs
                    .get(&change.path)
                    .map(|blob| blob.size)
                    .unwrap_or_default()
            } else {
                fs::metadata(repository_root.join(&change.path))
                    .ok()
                    .filter(|metadata| metadata.is_file())
                    .map(|metadata| metadata.len())
                    .unwrap_or_default()
            };
            let mut risks = file_risks(engine, &relative, size_bytes);
            if change.staged
                && staged_lfs_pointers.contains(&change.path)
                && !risks
                    .iter()
                    .any(|risk| risk.kind == ProjectRiskKind::LfsRecommended)
            {
                risks.push(GameProjectRisk {
                    kind: ProjectRiskKind::LfsRecommended,
                    severity: ProjectRiskSeverity::Danger,
                    path: relative.clone(),
                    message: "This staged Git LFS pointer needs a matching staged filter=lfs rule."
                        .to_owned(),
                });
            }
            if !risks.is_empty() {
                prepared_risks.push((change, risks));
            }
        }
        let staged_candidates = prepared_risks
            .iter()
            .filter(|(change, _)| change.staged)
            .map(|(change, _)| change.path.clone())
            .collect::<Vec<_>>();
        let unstaged_candidates = prepared_risks
            .iter()
            .filter(|(change, _)| !change.staged)
            .map(|(change, _)| change.path.clone())
            .collect::<Vec<_>>();
        let staged_lfs = self.lfs_tracked_paths(&staged_candidates, true)?;
        let unstaged_lfs = self.lfs_tracked_paths(&unstaged_candidates, false)?;

        for (change, change_risks) in prepared_risks {
            let lfs_safe = if change.staged {
                staged_lfs_pointers.contains(&change.path) && staged_lfs.contains(&change.path)
            } else {
                unstaged_lfs.contains(&change.path)
            };
            for mut issue in change_risks {
                if lfs_safe
                    && matches!(
                        issue.kind,
                        ProjectRiskKind::LfsRecommended | ProjectRiskKind::LargeFile
                    )
                {
                    continue;
                }
                if change.staged
                    && staged_lfs_pointers.contains(&change.path)
                    && !staged_lfs.contains(&change.path)
                    && issue.kind == ProjectRiskKind::LfsRecommended
                {
                    issue.severity = ProjectRiskSeverity::Danger;
                    issue.message =
                        "This staged Git LFS pointer has no matching staged filter=lfs rule."
                            .to_owned();
                } else if change.staged
                    && staged_lfs.contains(&change.path)
                    && issue.kind == ProjectRiskKind::LfsRecommended
                {
                    issue.message =
                        "Git LFS is configured, but the staged file is not an LFS pointer."
                            .to_owned();
                }
                issue.path = repository_game_path(repository_root, game_project_root, &issue.path);
                issues.push(issue);
            }
        }

        issues.sort_by(|left, right| {
            risk_priority(left.severity)
                .cmp(&risk_priority(right.severity))
                .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
        });
        let mut seen = HashSet::new();
        issues.retain(|issue| seen.insert((issue.kind, issue.path.to_lowercase())));
        Ok(issues)
    }

    fn lfs_tracked_paths(
        &self,
        paths: &[String],
        cached: bool,
    ) -> Result<HashSet<String>, GitError> {
        if paths.is_empty() {
            return Ok(HashSet::new());
        }
        let mut input = Vec::new();
        for path in paths {
            input.extend_from_slice(path.as_bytes());
            input.push(0);
        }
        let output = if cached {
            self.runner.run_with_input(
                ["check-attr", "--cached", "-z", "--stdin", "filter"],
                &input,
            )?
        } else {
            self.runner
                .run_with_input(["check-attr", "-z", "--stdin", "filter"], &input)?
        };
        Ok(parse_lfs_attributes(&output))
    }

    fn index_entries(&self, paths: &[String]) -> Result<HashMap<String, String>, GitError> {
        const WINDOWS_PATHSPEC_BUDGET: usize = 12 * 1024;
        let mut paths = paths.to_vec();
        paths.sort();
        paths.dedup();

        let mut entries = HashMap::new();
        let mut chunk = Vec::new();
        let mut chunk_units = 0;
        for path in paths {
            let path_units = path.encode_utf16().count().saturating_add(16);
            if !chunk.is_empty() && chunk_units + path_units > WINDOWS_PATHSPEC_BUDGET {
                let output = self
                    .runner
                    .run_with_literal_paths(&["ls-files", "--stage", "-z"], &chunk)?;
                entries.extend(parse_index_oids(&output));
                chunk.clear();
                chunk_units = 0;
            }
            chunk_units += path_units;
            chunk.push(path);
        }
        if !chunk.is_empty() {
            let output = self
                .runner
                .run_with_literal_paths(&["ls-files", "--stage", "-z"], &chunk)?;
            entries.extend(parse_index_oids(&output));
        }
        Ok(entries)
    }

    fn index_blobs(
        &self,
        paths: &[String],
        index_entries: &HashMap<String, String>,
    ) -> Result<HashMap<String, IndexBlob>, GitError> {
        if paths.is_empty() {
            return Ok(HashMap::new());
        }
        let path_oids = paths
            .iter()
            .filter_map(|path| {
                index_entries
                    .get(path)
                    .map(|oid| (path.clone(), oid.clone()))
            })
            .collect::<HashMap<_, _>>();

        let mut oids = path_oids.values().cloned().collect::<Vec<_>>();
        oids.sort();
        oids.dedup();
        let mut input = oids.join("\n").into_bytes();
        input.push(b'\n');
        let output = self.runner.run_with_input(
            [
                "cat-file",
                "--batch-check=%(objectname) %(objecttype) %(objectsize)",
            ],
            &input,
        )?;
        let sizes = parse_batch_object_sizes(&output);
        Ok(path_oids
            .into_iter()
            .filter_map(|(path, oid)| {
                let size = sizes.get(&oid).copied()?;
                Some((path, IndexBlob { oid, size }))
            })
            .collect())
    }

    fn index_lfs_pointer_paths(
        &self,
        tracked_paths: &HashSet<String>,
        index_blobs: &HashMap<String, IndexBlob>,
    ) -> Result<HashSet<String>, GitError> {
        const MAX_POINTER_BYTES: u64 = 1024;
        let mut oid_paths = HashMap::<String, Vec<String>>::new();
        for path in tracked_paths {
            let Some(blob) = index_blobs.get(path) else {
                continue;
            };
            if blob.size <= MAX_POINTER_BYTES {
                oid_paths
                    .entry(blob.oid.clone())
                    .or_default()
                    .push(path.clone());
            }
        }
        if oid_paths.is_empty() {
            return Ok(HashSet::new());
        }

        let oids = oid_paths.keys().cloned().collect::<Vec<_>>();
        let mut pointers = HashSet::new();
        for chunk in oids.chunks(256) {
            let mut input = chunk.join("\n").into_bytes();
            input.push(b'\n');
            let output = self
                .runner
                .run_with_input(["cat-file", "--batch"], &input)?;
            for (oid, content) in parse_batch_blobs(&output) {
                if is_lfs_pointer(&content) {
                    pointers.extend(oid_paths.get(&oid).into_iter().flatten().cloned());
                }
            }
        }
        Ok(pointers)
    }

    fn validate_branch(&self, branch: &str) -> Result<(), GitError> {
        if branch.is_empty() || branch.contains(['\r', '\n', '\0']) {
            return Err(GitError::safe("Invalid branch name"));
        }
        self.runner.run(["check-ref-format", "--branch", branch])?;
        Ok(())
    }

    fn branches(
        &self,
        current: &str,
    ) -> Result<(Vec<BranchSummary>, Option<RemoteTarget>), GitError> {
        let output = self.runner.run([
            "for-each-ref",
            "--format=%(refname:short)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)",
            "refs/heads",
        ])?;
        let mut upstream_target = None;
        let mut branches = text(&output)
            .lines()
            .filter_map(|line| {
                let mut fields = line.splitn(4, '\0');
                let name = fields.next()?;
                let upstream = fields.next()?;
                let remote_name = fields.next()?;
                let merge_ref = fields.next()?;
                if name == current && !remote_name.is_empty() && is_branch_ref(merge_ref) {
                    upstream_target = Some(RemoteTarget {
                        name: remote_name.to_owned(),
                        merge_ref: merge_ref.to_owned(),
                    });
                }
                Some(BranchSummary {
                    name: name.to_owned(),
                    is_current: name == current,
                    upstream: (!upstream.is_empty()).then(|| upstream.to_owned()),
                })
            })
            .collect::<Vec<_>>();
        if !current.is_empty() && !branches.iter().any(|branch| branch.name == current) {
            branches.push(BranchSummary {
                name: current.to_owned(),
                is_current: true,
                upstream: None,
            });
        }
        Ok((branches, upstream_target))
    }

    fn has_head(&self) -> Result<bool, GitError> {
        self.runner
            .try_run(["rev-parse", "--verify", "HEAD"])
            .map(|output| output.is_some())
    }

    fn upstream_target(&self) -> Result<Option<RemoteTarget>, GitError> {
        let branch = self.current_branch()?;
        if branch.is_empty() {
            return Ok(None);
        }
        let remote = self.config_value(&format!("branch.{branch}.remote"))?;
        let merge_ref = self.config_value(&format!("branch.{branch}.merge"))?;
        match (remote, merge_ref) {
            (Some(name), Some(merge_ref)) if is_branch_ref(&merge_ref) => {
                Ok(Some(RemoteTarget { name, merge_ref }))
            }
            (None, None) => Ok(None),
            _ => Err(GitError::safe("Current Git branch has an invalid upstream")),
        }
    }

    fn origin_target(&self) -> Result<RemoteTarget, GitError> {
        let branch = self.current_branch()?;
        if branch.is_empty() {
            return Err(GitError::safe("Cannot push a detached HEAD"));
        }
        self.require_remote("origin")?;
        Ok(RemoteTarget {
            name: "origin".to_owned(),
            merge_ref: format!("refs/heads/{branch}"),
        })
    }

    fn fetch_remote(&self) -> Result<String, GitError> {
        if let Some(target) = self.upstream_target()? {
            self.require_remote(&target.name)?;
            return Ok(target.name);
        }
        self.require_remote("origin")?;
        Ok("origin".to_owned())
    }

    fn config_value(&self, key: &str) -> Result<Option<String>, GitError> {
        self.runner.try_run(["config", "--get", key]).map(|value| {
            value
                .map(|value| text(&value).trim().to_owned())
                .filter(|value| !value.is_empty())
        })
    }

    fn remote_exists(&self, remote: &str) -> Result<bool, GitError> {
        self.runner
            .try_run(["remote", "get-url", "--", remote])
            .map(|value| value.is_some())
    }

    fn require_remote(&self, remote: &str) -> Result<(), GitError> {
        if self.remote_exists(remote)? {
            Ok(())
        } else {
            Err(GitError::safe("Configured Git remote is unavailable"))
        }
    }

    fn remote_url(&self, remote: &str) -> Result<Option<String>, GitError> {
        self.runner
            .try_run(["remote", "get-url", "--", remote])
            .map(|value| value.and_then(|value| sanitize_remote_url(text(&value).trim())))
    }

    fn ahead_behind(&self) -> Result<(u64, u64), GitError> {
        let Some(output) =
            self.runner
                .try_run(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])?
        else {
            return Ok((0, 0));
        };
        let counts = text(&output);
        let mut values = counts.split_whitespace();
        let ahead = values
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let behind = values
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        Ok((ahead, behind))
    }
}

fn select_ai_files(
    allowed_files: Vec<String>,
    max_files: usize,
    max_pathspec_bytes: usize,
) -> (Vec<String>, bool) {
    let total_files = allowed_files.len();
    let mut selected_files = Vec::new();
    let mut pathspec_bytes = 0usize;
    let mut truncated = false;
    for path in allowed_files {
        if selected_files.len() >= max_files {
            truncated = true;
            break;
        }
        if path.len() > max_pathspec_bytes {
            truncated = true;
            continue;
        }
        let next_bytes = pathspec_bytes.saturating_add(path.len());
        if next_bytes > max_pathspec_bytes {
            truncated = true;
            break;
        }
        pathspec_bytes = next_bytes;
        selected_files.push(path);
    }
    truncated |= selected_files.len() < total_files;
    (selected_files, truncated)
}

fn parse_staged_name_status(output: &[u8]) -> Result<Vec<StagedAiFile>, GitError> {
    let fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = fields[index];
        index += 1;
        let kind = status.first().copied().unwrap_or_default();
        if matches!(kind, b'R' | b'C') {
            let old_path = fields
                .get(index)
                .ok_or_else(|| GitError::safe("Staged Git paths could not be parsed"))?;
            let new_path = fields
                .get(index + 1)
                .ok_or_else(|| GitError::safe("Staged Git paths could not be parsed"))?;
            index += 2;
            let old_path = String::from_utf8_lossy(old_path).into_owned();
            let new_path = String::from_utf8_lossy(new_path).into_owned();
            files.push(StagedAiFile {
                patch_path: new_path.clone(),
                checked_paths: vec![old_path, new_path],
            });
        } else {
            let path = fields
                .get(index)
                .ok_or_else(|| GitError::safe("Staged Git paths could not be parsed"))?;
            index += 1;
            let path = String::from_utf8_lossy(path).into_owned();
            files.push(StagedAiFile {
                patch_path: path.clone(),
                checked_paths: vec![path],
            });
        }
    }
    Ok(files)
}

fn parse_binary_numstat_paths(output: &[u8]) -> Result<HashSet<String>, GitError> {
    let fields = output.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut binary_paths = HashSet::new();
    let mut index = 0;
    while index < fields.len() {
        let field = fields[index];
        index += 1;
        if field.is_empty() {
            continue;
        }
        let mut columns = field.splitn(3, |byte| *byte == b'\t');
        let additions = columns.next().unwrap_or_default();
        let deletions = columns.next().unwrap_or_default();
        let path = columns
            .next()
            .ok_or_else(|| GitError::safe("Staged Git statistics could not be parsed"))?;
        let binary = additions == b"-" && deletions == b"-";
        if path.is_empty() {
            // With -z, rename/copy numstat stores old and new paths in the next two fields.
            let _old_path = fields
                .get(index)
                .ok_or_else(|| GitError::safe("Staged Git statistics could not be parsed"))?;
            let new_path = fields
                .get(index + 1)
                .ok_or_else(|| GitError::safe("Staged Git statistics could not be parsed"))?;
            index += 2;
            if binary {
                binary_paths.insert(String::from_utf8_lossy(new_path).into_owned());
            }
        } else if binary {
            binary_paths.insert(String::from_utf8_lossy(path).into_owned());
        }
    }
    Ok(binary_paths)
}

fn append_utf8_bounded(target: &mut String, value: &str, limit: usize) -> bool {
    let remaining = limit.saturating_sub(target.len());
    if value.len() <= remaining {
        target.push_str(value);
        return true;
    }
    let mut boundary = remaining.min(value.len());
    while boundary > 0 && !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    target.push_str(&value[..boundary]);
    false
}

fn is_sensitive_ai_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let components = normalized.split('/').collect::<Vec<_>>();
    let name = components.last().copied().unwrap_or_default();
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);

    name == ".env"
        || name.starts_with(".env.")
        || matches!(
            name,
            ".npmrc"
                | ".pypirc"
                | ".netrc"
                | "_netrc"
                | "auth.json"
                | "id_rsa"
                | "id_dsa"
                | "id_ecdsa"
                | "id_ed25519"
        )
        || name.ends_with(".pem")
        || name.ends_with(".key")
        || name.ends_with(".p12")
        || name.ends_with(".pfx")
        || name.starts_with("service-account")
        || stem.contains("credential")
        || stem.contains("secret")
        || components.iter().any(|component| {
            matches!(
                *component,
                "credentials" | "credential" | "secrets" | "secret"
            )
        })
}

fn redact_sensitive_patch_lines(patch: &str) -> String {
    patch
        .lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            let sensitive = [
                "api_key",
                "apikey",
                "access_token",
                "auth_token",
                "client_secret",
                "private_key",
                "password",
                "authorization:",
                "bearer ",
                "github_pat_",
                "ghp_",
                "xoxb-",
                "akia",
                "-----begin private key-----",
            ]
            .iter()
            .any(|marker| lower.contains(marker));
            if sensitive && !line.starts_with("diff --git ") {
                "[RepoPuck redacted a potentially sensitive line]"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn text(output: &[u8]) -> String {
    String::from_utf8_lossy(output).into_owned()
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn invalid_repository() -> GitError {
    GitError::safe("The selected directory is not a Git repository")
}

fn find_game_project_root(requested: &Path, repository_root: &Path) -> Option<PathBuf> {
    let mut candidate = Some(requested);
    while let Some(path) = candidate {
        if detect_game_project(path).ok().flatten().is_some() {
            return Some(path.to_path_buf());
        }
        if path == repository_root {
            break;
        }
        candidate = path
            .parent()
            .filter(|parent| parent.starts_with(repository_root));
    }
    None
}

fn game_relative_path(
    repository_root: &Path,
    game_project_root: &Path,
    repository_path: &str,
) -> Option<String> {
    let prefix = game_project_root
        .strip_prefix(repository_root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    let repository_path = repository_path.replace('\\', "/");
    if prefix.is_empty() {
        return Some(repository_path);
    }
    let prefix_components = prefix.split('/').collect::<Vec<_>>();
    let path_components = repository_path.split('/').collect::<Vec<_>>();
    if path_components.len() < prefix_components.len()
        || !path_components
            .iter()
            .zip(&prefix_components)
            .all(|(path, prefix)| path.to_lowercase() == prefix.to_lowercase())
    {
        return None;
    }
    Some(path_components[prefix_components.len()..].join("/"))
}

fn repository_game_path(
    repository_root: &Path,
    game_project_root: &Path,
    game_path: &str,
) -> String {
    game_project_root
        .strip_prefix(repository_root)
        .unwrap_or_else(|_| Path::new(""))
        .join(game_path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn strip_meta_suffix(path: &str) -> Option<&str> {
    let suffix_start = path.len().checked_sub(5)?;
    path.get(suffix_start..)
        .filter(|suffix| suffix.eq_ignore_ascii_case(".meta"))?;
    path.get(..suffix_start)
}

fn is_branch_ref(value: &str) -> bool {
    value
        .strip_prefix("refs/heads/")
        .is_some_and(|name| !name.is_empty())
}

fn parse_index_oids(output: &[u8]) -> HashMap<String, String> {
    output
        .split(|byte| *byte == 0)
        .filter_map(|record| {
            let separator = record.iter().position(|byte| *byte == b'\t')?;
            let metadata = std::str::from_utf8(&record[..separator]).ok()?;
            let mut fields = metadata.split_ascii_whitespace();
            let _mode = fields.next()?;
            let oid = fields.next()?;
            let stage = fields.next()?;
            if stage != "0" || fields.next().is_some() {
                return None;
            }
            let path = String::from_utf8_lossy(&record[separator + 1..]).into_owned();
            Some((path, oid.to_owned()))
        })
        .collect()
}

fn parse_batch_object_sizes(output: &[u8]) -> HashMap<String, u64> {
    output
        .split(|byte| *byte == b'\n')
        .filter_map(|line| {
            let line = std::str::from_utf8(line).ok()?;
            let mut fields = line.split_ascii_whitespace();
            let oid = fields.next()?;
            if fields.next()? != "blob" {
                return None;
            }
            let size = fields.next()?.parse().ok()?;
            fields.next().is_none().then(|| (oid.to_owned(), size))
        })
        .collect()
}

fn parse_batch_blobs(output: &[u8]) -> HashMap<String, Vec<u8>> {
    let mut blobs = HashMap::new();
    let mut cursor = 0;
    while cursor < output.len() {
        let Some(header_length) = output[cursor..].iter().position(|byte| *byte == b'\n') else {
            break;
        };
        let header_end = cursor + header_length;
        let Some(header) = std::str::from_utf8(&output[cursor..header_end]).ok() else {
            break;
        };
        let mut fields = header.split_ascii_whitespace();
        let Some(oid) = fields.next() else {
            break;
        };
        if fields.next() != Some("blob") {
            break;
        }
        let Some(size) = fields.next().and_then(|value| value.parse::<usize>().ok()) else {
            break;
        };
        if fields.next().is_some() {
            break;
        }
        let content_start = header_end + 1;
        let Some(content_end) = content_start.checked_add(size) else {
            break;
        };
        if content_end >= output.len() || output[content_end] != b'\n' {
            break;
        }
        blobs.insert(oid.to_owned(), output[content_start..content_end].to_vec());
        cursor = content_end + 1;
    }
    blobs
}

fn is_lfs_pointer(content: &[u8]) -> bool {
    let Ok(content) = std::str::from_utf8(content) else {
        return false;
    };
    let mut lines = content.lines();
    if lines.next() != Some("version https://git-lfs.github.com/spec/v1") {
        return false;
    }
    let Some(oid) = lines
        .next()
        .and_then(|line| line.strip_prefix("oid sha256:"))
    else {
        return false;
    };
    if oid.len() != 64 || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return false;
    }
    let Some(size) = lines.next().and_then(|line| line.strip_prefix("size ")) else {
        return false;
    };
    size.parse::<u64>().is_ok() && lines.next().is_none()
}

fn parse_lfs_attributes(output: &[u8]) -> HashSet<String> {
    let mut fields = output.split(|byte| *byte == 0);
    let mut tracked = HashSet::new();
    while let Some(path) = fields.next().filter(|field| !field.is_empty()) {
        let Some(attribute) = fields.next() else {
            break;
        };
        let Some(value) = fields.next() else {
            break;
        };
        if attribute == b"filter" && value.eq_ignore_ascii_case(b"lfs") {
            tracked.insert(String::from_utf8_lossy(path).into_owned());
        }
    }
    tracked
}

const fn risk_priority(severity: ProjectRiskSeverity) -> u8 {
    match severity {
        ProjectRiskSeverity::Danger => 0,
        ProjectRiskSeverity::Warning => 1,
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashSet,
        fs,
        path::{Path, PathBuf},
        process::Command,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::game_projects::{
        FileCategory, GameEngine, ProjectRiskKind, GIT_HOST_HARD_LIMIT_BYTES,
    };

    use super::{
        game_relative_path, is_lfs_pointer, is_sensitive_ai_path, parse_binary_numstat_paths,
        parse_lfs_attributes, parse_staged_name_status, redact_sensitive_patch_lines,
        select_ai_files, GitService,
    };

    static NEXT_REPOSITORY: AtomicU64 = AtomicU64::new(0);

    struct TestRepository {
        path: PathBuf,
    }

    impl TestRepository {
        fn new() -> Self {
            let unique = NEXT_REPOSITORY.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "repopuck-service-test-{}-{timestamp}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create temporary repository");

            let repository = Self { path };
            repository.git(&["init", "--initial-branch=main"]);
            repository.git(&["config", "user.name", "RepoPuck Test"]);
            repository.git(&["config", "user.email", "repopuck@example.invalid"]);
            fs::write(repository.path.join("tracked.txt"), "initial\n").expect("write fixture");
            repository.git(&["add", "--", "tracked.txt"]);
            repository.git(&["commit", "-m", "initial"]);
            repository
        }

        fn unborn() -> Self {
            let unique = NEXT_REPOSITORY.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "repopuck-unborn-test-{}-{timestamp}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create temporary repository");

            let repository = Self { path };
            repository.git(&["init", "--initial-branch=main"]);
            repository.git(&["config", "user.name", "RepoPuck Test"]);
            repository.git(&["config", "user.email", "repopuck@example.invalid"]);
            repository
        }

        fn git(&self, args: &[&str]) -> String {
            let output = Command::new("git")
                .current_dir(&self.path)
                .args(args)
                .output()
                .expect("Git available on PATH");
            assert!(
                output.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8(output.stdout).expect("UTF-8 Git output")
        }
    }

    impl Drop for TestRepository {
        fn drop(&mut self) {
            if self.path.starts_with(std::env::temp_dir()) {
                let _ = fs::remove_dir_all(&self.path);
            }
        }
    }

    #[test]
    fn validates_repository_and_reports_current_branch() {
        let repository = TestRepository::new();
        let service = GitService::open(&repository.path).expect("valid repository");

        assert_eq!(service.current_branch().expect("current branch"), "main");

        let ordinary_directory = repository.path.join("ordinary-directory");
        fs::create_dir(&ordinary_directory).expect("ordinary directory");
        let nested_service =
            GitService::open(&ordinary_directory).expect("directory inside repository");
        assert_eq!(
            nested_service
                .repository_path()
                .canonicalize()
                .expect("canonical service root"),
            repository
                .path
                .canonicalize()
                .expect("canonical fixture root")
        );
        assert_eq!(
            nested_service
                .selection_path()
                .canonicalize()
                .expect("canonical selection"),
            repository
                .path
                .canonicalize()
                .expect("canonical fixture root")
        );
    }

    #[test]
    fn ai_context_uses_only_staged_text_and_excludes_sensitive_rename_sources() {
        let repository = TestRepository::new();
        fs::write(repository.path.join(".env"), "API_KEY=must-not-leak\n")
            .expect("write sensitive fixture");
        repository.git(&["add", "--", ".env"]);
        repository.git(&["commit", "-m", "add sensitive fixture"]);
        repository.git(&["mv", "--", ".env", "config.ts"]);
        fs::write(repository.path.join("tracked.txt"), "safe staged change\n")
            .expect("modify safe fixture");
        repository.git(&["add", "--", "tracked.txt"]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let context = service.staged_diff_for_ai().expect("AI staged context");

        assert_eq!(context.excluded_files, vec!["config.ts"]);
        assert_eq!(context.included_files, 1);
        assert_eq!(context.binary_files, 0);
        assert!(context.content.contains("safe staged change"));
        assert!(!context.content.contains(".env"));
        assert!(!context.content.contains("must-not-leak"));
    }

    #[test]
    fn ai_context_omits_binary_contents_and_caps_large_file_sets() {
        let repository = TestRepository::new();
        fs::write(
            repository.path.join("asset.bin"),
            b"\0private-binary-content",
        )
        .expect("write binary fixture");
        repository.git(&["add", "--", "asset.bin"]);
        for index in 0..201 {
            let name = format!("file-{index:03}.txt");
            fs::write(repository.path.join(&name), format!("change {index}\n"))
                .expect("write text fixture");
        }
        repository.git(&["add", "--", "."]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let context = service.staged_diff_for_ai().expect("AI staged context");

        assert!(context.truncated);
        assert_eq!(context.included_files, 200);
        assert_eq!(context.binary_files, 1);
        assert!(context
            .content
            .contains("Binary file changed; content omitted"));
        assert!(!context.content.contains("private-binary-content"));
        assert!(context.content.len() <= 64 * 1024);
    }

    #[test]
    fn staged_name_status_parser_checks_both_sides_of_renames() {
        let parsed = parse_staged_name_status(b"R100\0.env\0src/config.ts\0M\0safe.txt\0")
            .expect("parse staged names");

        assert_eq!(parsed[0].patch_path, "src/config.ts");
        assert_eq!(parsed[0].checked_paths, vec![".env", "src/config.ts"]);
        assert!(parsed[0]
            .checked_paths
            .iter()
            .any(|path| is_sensitive_ai_path(path)));
        assert_eq!(parsed[1].patch_path, "safe.txt");
    }

    #[test]
    fn binary_numstat_parser_handles_regular_and_renamed_paths() {
        let parsed = parse_binary_numstat_paths(b"-\t-\tasset.bin\0-\t-\t\0old.bin\0new.bin\0")
            .expect("parse binary stats");

        assert!(parsed.contains("asset.bin"));
        assert!(parsed.contains("new.bin"));
    }

    #[test]
    fn ai_patch_redaction_removes_common_secret_assignments() {
        let patch = "+api_key = \"sk-private\"\n+safe_value = 42\n context password=hidden";
        let redacted = redact_sensitive_patch_lines(patch);

        assert!(!redacted.contains("sk-private"));
        assert!(!redacted.contains("hidden"));
        assert!(redacted.contains("safe_value = 42"));
    }

    #[test]
    fn ai_file_selection_never_falls_back_to_an_unscoped_diff() {
        let (selected, truncated) =
            select_ai_files(vec!["x".repeat(20), "safe.txt".to_owned()], 200, 12);

        assert_eq!(selected, vec!["safe.txt"]);
        assert!(truncated);

        let (selected, truncated) = select_ai_files(vec!["x".repeat(20)], 200, 12);
        assert!(selected.is_empty());
        assert!(truncated);
    }

    #[test]
    fn stages_and_unstages_tracked_and_untracked_paths() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("tracked.txt"), "changed\n").expect("modify tracked file");
        fs::write(repository.path.join("untracked file.txt"), "new\n")
            .expect("write untracked file");
        let service = GitService::open(&repository.path).expect("valid repository");

        let before = service.snapshot().expect("initial snapshot");
        assert_eq!(service.change_count().expect("change count"), 2);
        assert!(before
            .changes
            .iter()
            .any(|change| change.path == "tracked.txt" && !change.staged && !change.untracked));
        assert!(before.changes.iter().any(|change| {
            change.path == "untracked file.txt" && !change.staged && change.untracked
        }));

        service
            .set_staged(&["tracked.txt".into(), "untracked file.txt".into()], true)
            .expect("stage paths");
        let staged = service.snapshot().expect("staged snapshot");
        assert!(staged
            .changes
            .iter()
            .filter(|change| change.path == "tracked.txt" || change.path == "untracked file.txt")
            .all(|change| change.staged));

        service
            .set_staged(&["tracked.txt".into()], false)
            .expect("unstage path");
        let unstaged = service.snapshot().expect("unstaged snapshot");
        assert!(unstaged
            .changes
            .iter()
            .any(|change| change.path == "tracked.txt" && !change.staged));
        assert!(unstaged
            .changes
            .iter()
            .any(|change| change.path == "untracked file.txt" && change.staged));
    }

    #[test]
    fn change_count_counts_a_partially_staged_path_once() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("tracked.txt"), "staged\n").expect("write staged version");
        repository.git(&["add", "--", "tracked.txt"]);
        fs::write(repository.path.join("tracked.txt"), "worktree\n")
            .expect("write unstaged version");
        let service = GitService::open(&repository.path).expect("valid repository");

        assert_eq!(service.change_count().expect("change count"), 1);
        assert_eq!(
            service
                .snapshot()
                .expect("partial snapshot")
                .changes
                .iter()
                .filter(|change| change.path == "tracked.txt")
                .count(),
            2
        );
    }

    #[test]
    fn refresh_token_changes_with_worktree_index_and_head_state() {
        let repository = TestRepository::new();
        let service = GitService::open(&repository.path).expect("valid repository");
        let clean = service.refresh_token().expect("clean token");
        assert_eq!(clean, service.refresh_token().expect("stable clean token"));

        fs::write(repository.path.join("tracked.txt"), "worktree\n")
            .expect("write worktree version");
        let worktree = service.refresh_token().expect("worktree token");
        assert_ne!(worktree, clean);

        fs::write(
            repository.path.join("tracked.txt"),
            "worktree\nsecond line\n",
        )
        .expect("rewrite modified worktree version");
        let edited_worktree = service.refresh_token().expect("edited worktree token");
        assert_ne!(edited_worktree, worktree);

        repository.git(&["add", "--", "tracked.txt"]);
        let staged = service.refresh_token().expect("staged token");
        assert_ne!(staged, edited_worktree);

        repository.git(&["commit", "-m", "update tracked file"]);
        let committed = service.refresh_token().expect("committed token");
        assert_ne!(committed, staged);
    }

    #[test]
    fn commit_preserves_message_and_commits_only_staged_changes() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("tracked.txt"), "staged change\n")
            .expect("modify tracked file");
        fs::write(repository.path.join("left-unstaged.txt"), "not committed\n")
            .expect("write unstaged file");
        let service = GitService::open(&repository.path).expect("valid repository");
        service
            .set_staged(&["tracked.txt".into()], true)
            .expect("stage tracked file");
        let message = "Keep \"quotes\" & symbols\n\nBody with  two spaces";

        service.commit(message).expect("commit staged changes");

        assert_eq!(
            repository.git(&["log", "-1", "--pretty=%B"]).trim_end(),
            message
        );
        assert!(repository.path.join("left-unstaged.txt").exists());
        assert!(repository
            .git(&["status", "--porcelain=v1", "--", "left-unstaged.txt"])
            .starts_with("??"));
    }

    #[test]
    fn amend_includes_staged_content_in_the_latest_commit() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("tracked.txt"), "amended content\n")
            .expect("modify tracked file");
        let service = GitService::open(&repository.path).expect("valid repository");
        service
            .set_staged(&["tracked.txt".into()], true)
            .expect("stage tracked file");

        service
            .amend_last_commit(None)
            .expect("amend staged content");

        assert_eq!(
            repository.git(&["log", "-1", "--pretty=%B"]).trim(),
            "initial"
        );
        assert_eq!(
            fs::read_to_string(repository.path.join("tracked.txt")).unwrap(),
            "amended content\n"
        );
        assert_eq!(repository.git(&["rev-list", "--count", "HEAD"]), "1\n");
        assert!(repository.git(&["diff", "--cached", "--quiet"]).is_empty());
    }

    #[test]
    fn amend_without_a_message_preserves_the_existing_message() {
        let repository = TestRepository::new();
        let service = GitService::open(&repository.path).expect("valid repository");

        service
            .amend_last_commit(None)
            .expect("amend without message");

        assert_eq!(
            repository.git(&["log", "-1", "--pretty=%B"]).trim(),
            "initial"
        );
    }

    #[test]
    fn amend_with_a_message_replaces_the_existing_message() {
        let repository = TestRepository::new();
        let service = GitService::open(&repository.path).expect("valid repository");

        service
            .amend_last_commit(Some("Revised subject\n\nRevised body"))
            .expect("amend with replacement message");

        assert_eq!(
            repository.git(&["log", "-1", "--pretty=%B"]).trim_end(),
            "Revised subject\n\nRevised body"
        );
    }

    #[test]
    fn amend_without_a_head_fails_without_creating_a_commit() {
        let repository = TestRepository::unborn();
        let service = GitService::open(&repository.path).expect("valid unborn repository");

        assert!(service.amend_last_commit(None).is_err());
        assert_eq!(repository.git(&["rev-list", "--all", "--count"]), "0\n");
    }

    #[test]
    fn repository_name_uses_the_selected_directory_name() {
        let repository = TestRepository::new();
        let service = GitService::open(Path::new(&repository.path)).expect("valid repository");

        assert_eq!(
            service.snapshot().expect("snapshot").repository.name,
            repository.path.file_name().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn snapshot_detects_unity_categories_and_meta_risks() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Assets")).expect("create Assets");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        fs::write(repository.path.join("Assets/Hero.prefab"), "prefab\n")
            .expect("write Unity prefab");
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("Unity snapshot");

        let profile = snapshot.game_project.expect("Unity profile");
        assert_eq!(profile.engine, GameEngine::Unity);
        assert_eq!(profile.version.as_deref(), Some("2022.3.56f1"));
        assert!(snapshot.changes.iter().any(|change| {
            change.path == "Assets/Hero.prefab" && change.game_category == Some(FileCategory::Scene)
        }));
        assert!(snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::MissingMeta && issue.path == "Assets/Hero.prefab"
        }));
    }

    #[test]
    fn nested_unity_selection_keeps_the_git_root_and_prefixes_game_paths() {
        let repository = TestRepository::new();
        let game_root = repository.path.join("Games/OrbitTactics");
        fs::create_dir_all(game_root.join("Assets")).expect("create nested Assets");
        fs::create_dir(game_root.join("ProjectSettings")).expect("create nested ProjectSettings");
        fs::write(
            game_root.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write nested Unity version");
        fs::write(game_root.join("Assets/Hero.prefab"), "prefab\n")
            .expect("write nested Unity prefab");
        let service = GitService::open(&game_root).expect("nested Unity selection");

        let snapshot = service.snapshot().expect("nested Unity snapshot");

        assert_eq!(
            service
                .repository_path()
                .canonicalize()
                .expect("canonical service root"),
            repository
                .path
                .canonicalize()
                .expect("canonical fixture root")
        );
        assert_eq!(
            service
                .selection_path()
                .canonicalize()
                .expect("canonical selection"),
            game_root.canonicalize().expect("canonical game root")
        );
        assert_eq!(
            snapshot.repository.selection_path.as_deref(),
            Some(service.selection_path().to_string_lossy().as_ref())
        );
        let profile = snapshot.game_project.expect("nested Unity profile");
        assert_eq!(profile.engine, GameEngine::Unity);
        assert_eq!(
            profile.descriptor_path.as_deref(),
            Some("Games/OrbitTactics/ProjectSettings/ProjectVersion.txt")
        );
        assert!(snapshot.changes.iter().any(|change| {
            change.path == "Games/OrbitTactics/Assets/Hero.prefab"
                && change.game_category == Some(FileCategory::Scene)
        }));
        assert!(snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::MissingMeta
                && issue.path == "Games/OrbitTactics/Assets/Hero.prefab"
        }));
    }

    #[test]
    fn nested_game_scoping_is_case_insensitive_for_windows_git_paths() {
        let repository = Path::new(r"D:\Repos\Studio");
        let project = Path::new(r"D:\Repos\Studio\Games\OrbitTactics");

        assert_eq!(
            game_relative_path(repository, project, "games/orbittactics/Assets/Hero.prefab")
                .as_deref(),
            Some("Assets/Hero.prefab")
        );
    }

    #[test]
    fn staged_meta_deletion_is_reported_even_when_worktree_restores_the_file() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Assets")).expect("create Assets");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        fs::write(repository.path.join("Assets/Hero.prefab"), "prefab\n")
            .expect("write Unity asset");
        fs::write(
            repository.path.join("Assets/Hero.prefab.meta"),
            "guid: hero\n",
        )
        .expect("write Unity meta");
        repository.git(&[
            "add",
            "--",
            "ProjectSettings/ProjectVersion.txt",
            "Assets/Hero.prefab",
            "Assets/Hero.prefab.meta",
        ]);
        repository.git(&["commit", "-m", "add Unity asset"]);
        fs::remove_file(repository.path.join("Assets/Hero.prefab.meta"))
            .expect("delete Unity meta");
        repository.git(&["add", "-u", "--", "Assets/Hero.prefab.meta"]);
        fs::write(
            repository.path.join("Assets/Hero.prefab.meta"),
            "guid: hero\n",
        )
        .expect("restore worktree meta only");
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("split index/worktree snapshot");

        assert!(snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::MissingMeta
                && issue.severity == crate::game_projects::ProjectRiskSeverity::Danger
                && issue.path.eq_ignore_ascii_case("Assets/Hero.prefab")
        }));
    }

    #[test]
    fn staged_new_unity_asset_keeps_the_danger_over_the_pairing_warning() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Assets")).expect("create Assets");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        fs::write(repository.path.join("Assets/Hero.prefab"), "prefab\n")
            .expect("write Unity asset");
        fs::write(
            repository.path.join("Assets/Hero.prefab.meta"),
            "guid: hero\n",
        )
        .expect("write Unity meta");
        repository.git(&["add", "--", "Assets/Hero.prefab"]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("one-sided staged Unity pair");
        let matching = snapshot
            .game_safety_issues
            .iter()
            .filter(|issue| {
                issue.kind == ProjectRiskKind::MissingMeta
                    && issue.path.eq_ignore_ascii_case("Assets/Hero.prefab")
            })
            .collect::<Vec<_>>();

        assert_eq!(matching.len(), 1);
        assert_eq!(
            matching[0].severity,
            crate::game_projects::ProjectRiskSeverity::Danger
        );
    }

    #[test]
    fn staged_unity_folder_meta_uses_indexed_descendants_instead_of_disk_directories() {
        let repository = TestRepository::new();
        fs::create_dir_all(repository.path.join("Assets/NonEmpty"))
            .expect("create non-empty Unity folder");
        fs::create_dir(repository.path.join("Assets/Empty")).expect("create empty Unity folder");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        fs::write(
            repository.path.join("Assets/NonEmpty.meta"),
            "guid: non-empty\n",
        )
        .expect("write non-empty folder meta");
        fs::write(
            repository.path.join("Assets/NonEmpty/Hero.asset"),
            "asset\n",
        )
        .expect("write indexed child");
        fs::write(repository.path.join("Assets/Empty.meta"), "guid: empty\n")
            .expect("write empty folder meta");
        repository.git(&[
            "add",
            "--",
            "Assets/NonEmpty.meta",
            "Assets/NonEmpty/Hero.asset",
            "Assets/Empty.meta",
        ]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("folder meta snapshot");

        assert!(!snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::OrphanMeta
                && issue.path.eq_ignore_ascii_case("Assets/NonEmpty.meta")
        }));
        assert!(snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::OrphanMeta
                && issue.severity == crate::game_projects::ProjectRiskSeverity::Danger
                && issue.path.eq_ignore_ascii_case("Assets/Empty.meta")
        }));
    }

    #[test]
    fn staged_blob_size_wins_over_a_smaller_worktree_file() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Assets")).expect("create Assets");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        let asset = repository.path.join("Assets/LargeAsset.bin");
        let file = fs::File::create(&asset).expect("create large staged asset");
        file.set_len(GIT_HOST_HARD_LIMIT_BYTES)
            .expect("size large staged asset");
        repository.git(&["add", "--", "Assets/LargeAsset.bin"]);
        fs::write(&asset, b"small worktree replacement").expect("shrink worktree asset");
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("snapshot with staged large blob");

        assert!(snapshot.game_safety_issues.iter().any(|issue| {
            issue.kind == ProjectRiskKind::LargeFile
                && issue.severity == crate::game_projects::ProjectRiskSeverity::Danger
                && issue.path == "Assets/LargeAsset.bin"
        }));
    }

    #[test]
    fn git_lfs_attributes_suppress_binary_asset_recommendations() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Content")).expect("create Content");
        fs::write(
            repository.path.join("OrbitTactics.uproject"),
            r#"{"EngineAssociation":"5.6"}"#,
        )
        .expect("write Unreal descriptor");
        fs::write(
            repository.path.join(".gitattributes"),
            "*.uasset filter=lfs diff=lfs merge=lfs -text\n",
        )
        .expect("write attributes");
        fs::write(repository.path.join("Content/Hero.uasset"), b"binary")
            .expect("write Unreal asset");
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("Unreal snapshot");

        assert_eq!(
            snapshot.game_project.as_ref().map(|profile| profile.engine),
            Some(GameEngine::Unreal)
        );
        assert!(!snapshot
            .game_safety_issues
            .iter()
            .any(|issue| issue.kind == ProjectRiskKind::LfsRecommended));
    }

    #[test]
    fn a_staged_git_lfs_pointer_suppresses_binary_asset_warnings() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Content")).expect("create Content");
        fs::write(
            repository.path.join("OrbitTactics.uproject"),
            r#"{"EngineAssociation":"5.6"}"#,
        )
        .expect("write Unreal descriptor");
        fs::write(
            repository.path.join("Content/Hero.uasset"),
            b"version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\nsize 123\n",
        )
        .expect("write LFS pointer");
        repository.git(&["add", "--", "Content/Hero.uasset"]);
        fs::write(
            repository.path.join(".gitattributes"),
            "*.uasset filter=lfs diff=lfs merge=lfs -text\n",
        )
        .expect("write attributes");
        repository.git(&["add", "--", ".gitattributes"]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("staged LFS snapshot");

        assert!(!snapshot
            .game_safety_issues
            .iter()
            .any(|issue| issue.path == "Content/Hero.uasset"));
    }

    #[test]
    fn staged_lfs_pointer_without_a_staged_attribute_is_dangerous() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Assets")).expect("create Assets");
        fs::create_dir(repository.path.join("ProjectSettings")).expect("create ProjectSettings");
        fs::write(
            repository.path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.56f1\n",
        )
        .expect("write Unity version");
        fs::write(
            repository.path.join("Assets/Hero.png"),
            b"version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\nsize 41943040\n",
        )
        .expect("write staged pointer");
        repository.git(&["add", "--", "Assets/Hero.png"]);
        fs::write(repository.path.join(".gitattributes"), "*.png -filter\n")
            .expect("disable any inherited PNG filter");
        repository.git(&["add", "--", ".gitattributes"]);
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("staged pointer snapshot");

        assert!(
            snapshot.game_safety_issues.iter().any(|issue| {
                issue.kind == ProjectRiskKind::LfsRecommended
                    && issue.severity == crate::game_projects::ProjectRiskSeverity::Danger
                    && issue.path == "Assets/Hero.png"
            }),
            "{:?} {:?}",
            snapshot.game_safety_issues,
            snapshot.changes
        );
    }

    #[test]
    fn deleting_an_unreal_binary_does_not_recommend_lfs() {
        let repository = TestRepository::new();
        fs::create_dir(repository.path.join("Content")).expect("create Content");
        fs::write(
            repository.path.join("OrbitTactics.uproject"),
            r#"{"EngineAssociation":"5.6"}"#,
        )
        .expect("write Unreal descriptor");
        fs::write(repository.path.join("Content/Hero.uasset"), b"binary")
            .expect("write Unreal asset");
        repository.git(&["add", "--", "OrbitTactics.uproject", "Content/Hero.uasset"]);
        repository.git(&["commit", "-m", "add Unreal asset"]);
        fs::remove_file(repository.path.join("Content/Hero.uasset")).expect("delete Unreal asset");
        let service = GitService::open(&repository.path).expect("valid repository");

        let snapshot = service.snapshot().expect("Unreal deletion snapshot");

        assert!(!snapshot
            .game_safety_issues
            .iter()
            .any(|issue| issue.path == "Content/Hero.uasset"));
    }

    #[test]
    fn recognizes_only_canonical_git_lfs_pointer_content() {
        let pointer = b"version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\nsize 123\n";

        assert!(is_lfs_pointer(pointer));
        assert!(!is_lfs_pointer(
            b"version https://git-lfs.github.com/spec/v1\nsize 123\n"
        ));
        assert!(!is_lfs_pointer(b"ordinary binary content"));
    }

    #[test]
    fn parses_only_lfs_filter_attribute_records() {
        let parsed = parse_lfs_attributes(
            b"Content/Hero.uasset\0filter\0lfs\0Assets/Hero.prefab\0filter\0unspecified\0",
        );

        assert_eq!(parsed, HashSet::from(["Content/Hero.uasset".to_owned()]));
    }

    #[test]
    fn creates_switches_and_stashes_without_shell_interpolation() {
        let repository = TestRepository::new();
        let service = GitService::open(&repository.path).expect("valid repository");

        service
            .create_branch("feature/safe-name")
            .expect("create and switch branch");
        assert_eq!(
            service.current_branch().expect("feature branch"),
            "feature/safe-name"
        );
        service.switch_branch("main").expect("switch to main");

        fs::write(repository.path.join("tracked.txt"), "stash me\n").expect("modify file");
        fs::write(repository.path.join("untracked.txt"), "stash me too\n")
            .expect("write untracked file");
        service.stash().expect("stash worktree");
        assert!(service
            .snapshot()
            .expect("clean snapshot")
            .changes
            .is_empty());
        assert_eq!(repository.git(&["stash", "list"]).lines().count(), 1);
    }

    #[test]
    fn first_push_sets_origin_upstream_and_later_push_uses_it() {
        let repository = TestRepository::new();
        let remote_path = repository.path.with_extension("remote.git");
        let decoy_path = repository.path.with_extension("decoy.git");
        fs::create_dir(&remote_path).expect("create remote directory");
        fs::create_dir(&decoy_path).expect("create decoy directory");
        let init = Command::new("git")
            .current_dir(&remote_path)
            .args(["init", "--bare"])
            .output()
            .expect("Git available on PATH");
        assert!(init.status.success());
        let decoy_init = Command::new("git")
            .current_dir(&decoy_path)
            .args(["init", "--bare"])
            .output()
            .expect("Git available on PATH");
        assert!(decoy_init.status.success());
        repository.git(&[
            "remote",
            "add",
            "origin",
            remote_path.to_string_lossy().as_ref(),
        ]);
        repository.git(&[
            "remote",
            "add",
            "decoy",
            decoy_path.to_string_lossy().as_ref(),
        ]);
        let service = GitService::open(&repository.path).expect("valid repository");

        service.push().expect("first push");
        assert_eq!(
            repository
                .git(&[
                    "rev-parse",
                    "--abbrev-ref",
                    "--symbolic-full-name",
                    "@{upstream}",
                ])
                .trim(),
            "origin/main"
        );
        let snapshot = service.snapshot().expect("snapshot");
        assert_eq!(snapshot.repository.remote_name.as_deref(), Some("origin"));
        assert_eq!(
            snapshot.repository.remote_url.as_deref(),
            Some(remote_path.to_string_lossy().as_ref())
        );

        repository.git(&["config", "remote.pushDefault", "decoy"]);
        fs::write(repository.path.join("tracked.txt"), "second push\n").expect("modify file");
        repository.git(&["add", "--", "tracked.txt"]);
        repository.git(&["commit", "-m", "second"]);
        assert_eq!(service.fetch_remote().expect("fetch target"), "origin");
        service.push().expect("push using explicit upstream");
        let decoy_ref = Command::new("git")
            .current_dir(&decoy_path)
            .args(["show-ref", "--verify", "--quiet", "refs/heads/main"])
            .output()
            .expect("Git available on PATH");
        assert!(
            !decoy_ref.status.success(),
            "push.default configuration must not redirect RepoPuck pushes"
        );

        let _ = fs::remove_dir_all(&remote_path);
        let _ = fs::remove_dir_all(&decoy_path);
    }

    #[test]
    fn staging_rejects_pathspecs_and_paths_absent_from_current_status() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("first.txt"), "first\n").expect("write first file");
        fs::write(repository.path.join("second.txt"), "second\n").expect("write second file");
        let service = GitService::open(&repository.path).expect("valid repository");

        let error = service
            .set_staged(&[":(glob)**".to_owned()], true)
            .expect_err("pathspec must not be accepted as a changed path");

        assert_eq!(
            error.message(),
            "Selected path is no longer a current Git change"
        );
        assert!(repository.git(&["diff", "--cached", "--quiet"]).is_empty());
        let status = repository.git(&["status", "--porcelain=v1"]);
        assert!(status.contains("?? first.txt"));
        assert!(status.contains("?? second.txt"));
    }

    #[test]
    fn unstaging_a_rename_restores_both_index_paths() {
        let repository = TestRepository::new();
        repository.git(&["mv", "--", "tracked.txt", "renamed file.txt"]);
        let service = GitService::open(&repository.path).expect("valid repository");

        assert!(service
            .snapshot()
            .expect("staged snapshot")
            .changes
            .iter()
            .any(|change| change.path == "renamed file.txt"
                && change.staged
                && change.kind.as_ref() == "renamed"));

        service
            .set_staged(&["renamed file.txt".into()], false)
            .expect("unstage complete rename");

        assert!(repository.git(&["diff", "--cached", "--quiet"]).is_empty());
        let status = repository.git(&["status", "--porcelain=v1"]);
        assert!(
            status.lines().any(|line| line == " D tracked.txt"),
            "unexpected status: {status:?}"
        );
        assert!(
            status.lines().any(|line| line == "?? \"renamed file.txt\""),
            "unexpected status: {status:?}"
        );
    }

    #[test]
    fn unborn_repository_can_stage_unstage_and_report_its_branch() {
        let repository = TestRepository::unborn();
        fs::write(repository.path.join("first file.txt"), "first\n").expect("write first file");
        let service = GitService::open(&repository.path).expect("valid unborn repository");

        service
            .set_staged(&["first file.txt".into()], true)
            .expect("stage first file");
        service
            .set_staged(&["first file.txt".into()], false)
            .expect("unstage before first commit");

        let snapshot = service.snapshot().expect("unborn snapshot");
        assert_eq!(snapshot.current_branch, "main");
        assert!(snapshot
            .branches
            .iter()
            .any(|branch| branch.name == "main" && branch.is_current));
        assert!(snapshot.changes.iter().any(|change| {
            change.path == "first file.txt" && change.untracked && !change.staged
        }));
    }
}
