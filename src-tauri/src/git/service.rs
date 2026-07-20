use std::path::{Path, PathBuf};

use super::{
    model::{BranchSummary, RepositoryInfo, RepositorySnapshot},
    parser::parse_changes,
    runner::{redact_url_credentials, GitError, GitRunner},
};

#[derive(Clone, Debug)]
pub struct GitService {
    runner: GitRunner,
}

impl GitService {
    pub fn open(path: &Path) -> Result<Self, GitError> {
        if !path.is_dir() {
            return Err(invalid_repository());
        }
        let runner = GitRunner::new(path);
        let inside = runner.run(["rev-parse", "--is-inside-work-tree"])?;
        if text(&inside).trim() != "true" {
            return Err(invalid_repository());
        }
        let top_level = runner.run(["rev-parse", "--show-toplevel"])?;
        let selected = path.canonicalize().map_err(|_| invalid_repository())?;
        let root = PathBuf::from(text(&top_level).trim())
            .canonicalize()
            .map_err(|_| invalid_repository())?;
        if selected != root {
            return Err(invalid_repository());
        }
        Ok(Self { runner })
    }

    pub fn snapshot(&self) -> Result<RepositorySnapshot, GitError> {
        let current_branch = self.current_branch()?;
        let status =
            self.runner
                .run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
        let cached = self.runner.run(["diff", "--numstat", "-z", "--cached"])?;
        let unstaged = self.runner.run(["diff", "--numstat", "-z"])?;
        let changes = parse_changes(&status, &cached, &unstaged).map_err(GitError::safe)?;
        let branches = self.branches(&current_branch)?;
        let (ahead, behind) = self.ahead_behind()?;
        let repository_path = self.runner.repository();
        let name = repository_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| repository_path.display().to_string());
        let remote_url = self
            .runner
            .try_run(["config", "--get", "remote.origin.url"])?
            .map(|value| redact_url_credentials(text(&value).trim()));

        Ok(RepositorySnapshot {
            repository: RepositoryInfo {
                name,
                path: repository_path.display().to_string(),
                remote_url,
            },
            current_branch,
            branches,
            ahead,
            behind,
            changes,
        })
    }

    pub fn current_branch(&self) -> Result<String, GitError> {
        self.runner
            .run(["branch", "--show-current"])
            .map(|value| text(&value).trim().to_owned())
    }

    pub fn set_staged(&self, paths: &[String], staged: bool) -> Result<(), GitError> {
        if paths.is_empty() {
            return Ok(());
        }
        if staged {
            self.runner.run_with_paths(&["add"], paths)?;
        } else {
            self.runner
                .run_with_paths(&["restore", "--staged"], paths)?;
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

    pub fn push(&self) -> Result<(), GitError> {
        let upstream = self.runner.try_run([
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])?;
        if upstream.is_some() {
            self.runner.run(["push"])?;
        } else {
            let branch = self.current_branch()?;
            if branch.is_empty() {
                return Err(GitError::safe("Cannot push a detached HEAD"));
            }
            self.runner.run(["push", "-u", "origin", &branch])?;
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
        self.runner.run(["fetch", "--prune"])?;
        Ok(())
    }

    pub fn pull(&self) -> Result<(), GitError> {
        self.runner.run(["pull", "--ff-only"])?;
        Ok(())
    }

    pub fn stash(&self) -> Result<(), GitError> {
        self.runner.run(["stash", "push", "--include-untracked"])?;
        Ok(())
    }

    fn validate_branch(&self, branch: &str) -> Result<(), GitError> {
        if branch.is_empty() || branch.contains(['\r', '\n', '\0']) {
            return Err(GitError::safe("Invalid branch name"));
        }
        self.runner.run(["check-ref-format", "--branch", branch])?;
        Ok(())
    }

    fn branches(&self, current: &str) -> Result<Vec<BranchSummary>, GitError> {
        let output = self.runner.run([
            "for-each-ref",
            "--format=%(refname:short)%00%(upstream:short)",
            "refs/heads",
        ])?;
        Ok(text(&output)
            .lines()
            .filter_map(|line| {
                let (name, upstream) = line.split_once('\0')?;
                Some(BranchSummary {
                    name: name.to_owned(),
                    is_current: name == current,
                    upstream: (!upstream.is_empty()).then(|| upstream.to_owned()),
                })
            })
            .collect())
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

fn text(output: &[u8]) -> String {
    String::from_utf8_lossy(output).into_owned()
}

fn invalid_repository() -> GitError {
    GitError::safe("The selected directory is not a Git repository")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        process::Command,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::GitService;

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
        assert!(GitService::open(&ordinary_directory).is_err());
    }

    #[test]
    fn stages_and_unstages_tracked_and_untracked_paths() {
        let repository = TestRepository::new();
        fs::write(repository.path.join("tracked.txt"), "changed\n").expect("modify tracked file");
        fs::write(repository.path.join("untracked file.txt"), "new\n")
            .expect("write untracked file");
        let service = GitService::open(&repository.path).expect("valid repository");

        let before = service.snapshot().expect("initial snapshot");
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
    fn repository_name_uses_the_selected_directory_name() {
        let repository = TestRepository::new();
        let service = GitService::open(Path::new(&repository.path)).expect("valid repository");

        assert_eq!(
            service.snapshot().expect("snapshot").repository.name,
            repository.path.file_name().unwrap().to_string_lossy()
        );
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
        fs::create_dir(&remote_path).expect("create remote directory");
        let init = Command::new("git")
            .current_dir(&remote_path)
            .args(["init", "--bare"])
            .output()
            .expect("Git available on PATH");
        assert!(init.status.success());
        repository.git(&[
            "remote",
            "add",
            "origin",
            remote_path.to_string_lossy().as_ref(),
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

        fs::write(repository.path.join("tracked.txt"), "second push\n").expect("modify file");
        repository.git(&["add", "--", "tracked.txt"]);
        repository.git(&["commit", "-m", "second"]);
        service.push().expect("push using existing upstream");

        let _ = fs::remove_dir_all(&remote_path);
    }
}
