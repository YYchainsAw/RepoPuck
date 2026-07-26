use std::{
    ffi::{OsStr, OsString},
    fmt,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use super::process::{cancel_blocking_io, GitProcessGroup};

const GIT_READ_TIMEOUT: Duration = Duration::from_secs(30);
const GIT_MUTATION_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024;
type ReaderResult = io::Result<(Vec<u8>, bool)>;
type ReaderHandle = thread::JoinHandle<ReaderResult>;
type WriterHandle = thread::JoinHandle<io::Result<()>>;

#[derive(Clone, Debug)]
pub struct GitRunner {
    repository: PathBuf,
    cancellation: Option<GitCancellation>,
}

#[derive(Clone, Debug, Default)]
pub struct GitCancellation {
    cancelled: Arc<AtomicBool>,
}

impl GitCancellation {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

#[derive(Clone, Debug)]
pub struct GitError {
    message: String,
}

impl GitRunner {
    pub fn new(repository: impl Into<PathBuf>) -> Self {
        Self {
            repository: repository.into(),
            cancellation: None,
        }
    }

    pub fn with_cancellation(&self, cancellation: GitCancellation) -> Self {
        Self {
            repository: self.repository.clone(),
            cancellation: Some(cancellation),
        }
    }

    pub fn repository(&self) -> &Path {
        &self.repository
    }

    pub fn run<I, S>(&self, args: I) -> Result<Vec<u8>, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let output = self.command(args)?;
        if output.truncated {
            return Err(GitError::output_limit());
        }
        if output.status.success() {
            Ok(output.stdout)
        } else {
            Err(GitError::failed(
                output.status.code(),
                &String::from_utf8_lossy(&output.stderr),
            ))
        }
    }

    pub fn try_run<I, S>(&self, args: I) -> Result<Option<Vec<u8>>, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let output = self.command(args)?;
        if output.truncated {
            return Err(GitError::output_limit());
        }
        Ok(output.status.success().then_some(output.stdout))
    }

    pub fn run_with_input<I, S>(&self, args: I, input: &[u8]) -> Result<Vec<u8>, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        if input.len() > MAX_OUTPUT_BYTES {
            return Err(GitError::safe("Git process input is too large"));
        }
        let output = self.command_with_input(args, Some(input))?;
        if output.truncated {
            return Err(GitError::output_limit());
        }
        if output.status.success() {
            Ok(output.stdout)
        } else {
            Err(GitError::failed(
                output.status.code(),
                &String::from_utf8_lossy(&output.stderr),
            ))
        }
    }

    pub fn run_with_literal_paths(
        &self,
        fixed_args: &[&str],
        paths: &[String],
    ) -> Result<Vec<u8>, GitError> {
        let mut args = fixed_args.iter().map(OsStr::new).collect::<Vec<_>>();
        args.push(OsStr::new("--"));
        let literal_paths = paths
            .iter()
            .map(|path| format!(":(literal){path}"))
            .collect::<Vec<_>>();
        args.extend(literal_paths.iter().map(OsStr::new));
        self.run(args)
    }

    fn command<I, S>(&self, args: I) -> Result<GitOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.command_with_input(args, None)
    }

    fn command_with_input<I, S>(&self, args: I, input: Option<&[u8]>) -> Result<GitOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        if self
            .cancellation
            .as_ref()
            .is_some_and(GitCancellation::is_cancelled)
        {
            return Err(GitError::cancelled());
        }
        let args = args
            .into_iter()
            .map(|argument| argument.as_ref().to_os_string())
            .collect::<Vec<_>>();
        let timeout = timeout_for_args(&args);
        let process_group = GitProcessGroup::new().map_err(|_| GitError::isolation())?;
        let mut command = Command::new("git");
        command
            .current_dir(&self.repository)
            .args(["-c", "core.fsmonitor=false"])
            .args(&args)
            .stdin(if input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_PAGER", "cat")
            .env_remove("GIT_EXTERNAL_DIFF")
            .env_remove("GIT_DIFF_OPTS");
        process_group.prepare_command(&mut command);
        let mut child = command.spawn().map_err(|_| GitError::unavailable())?;
        if process_group.attach_and_resume(&child).is_err() {
            process_group.terminate();
            let _ = child.kill();
            return Err(GitError::isolation());
        }
        let stdout = child.stdout.take().ok_or_else(GitError::unavailable)?;
        let stderr = child.stderr.take().ok_or_else(GitError::unavailable)?;
        let stdout_reader = thread::spawn(move || read_limited(stdout));
        let stderr_reader = thread::spawn(move || read_limited(stderr));
        let stdin_writer = input.map(|input| {
            let mut stdin = child
                .stdin
                .take()
                .expect("piped Git stdin must be available");
            let input = input.to_vec();
            thread::spawn(move || stdin.write_all(&input))
        });
        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None)
                    if self
                        .cancellation
                        .as_ref()
                        .is_some_and(GitCancellation::is_cancelled) =>
                {
                    stop_and_reap(
                        &process_group,
                        child,
                        stdin_writer,
                        stdout_reader,
                        stderr_reader,
                    );
                    return Err(GitError::cancelled());
                }
                Ok(None) if Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    stop_and_reap(
                        &process_group,
                        child,
                        stdin_writer,
                        stdout_reader,
                        stderr_reader,
                    );
                    return Err(GitError::timed_out());
                }
                Err(_) => {
                    stop_and_reap(
                        &process_group,
                        child,
                        stdin_writer,
                        stdout_reader,
                        stderr_reader,
                    );
                    return Err(GitError::safe("Git process could not be monitored"));
                }
            }
        };
        match wait_for_io(
            stdin_writer.as_ref(),
            &stdout_reader,
            &stderr_reader,
            self.cancellation.as_ref(),
            deadline,
        ) {
            IoWaitOutcome::Finished => {}
            IoWaitOutcome::Cancelled => {
                stop_and_reap(
                    &process_group,
                    child,
                    stdin_writer,
                    stdout_reader,
                    stderr_reader,
                );
                return Err(GitError::cancelled());
            }
            IoWaitOutcome::TimedOut => {
                stop_and_reap(
                    &process_group,
                    child,
                    stdin_writer,
                    stdout_reader,
                    stderr_reader,
                );
                return Err(GitError::timed_out());
            }
        }
        if let Some(writer) = stdin_writer {
            writer
                .join()
                .map_err(|_| GitError::safe("Git process input could not be written"))?
                .map_err(|_| GitError::safe("Git process input could not be written"))?;
        }
        let (stdout, stdout_truncated) = join_reader(stdout_reader)?;
        let (stderr, stderr_truncated) = join_reader(stderr_reader)?;
        Ok(GitOutput {
            status,
            stdout,
            stderr,
            truncated: stdout_truncated || stderr_truncated,
        })
    }
}

fn timeout_for_args(args: &[OsString]) -> Duration {
    let command = args.first().and_then(|argument| argument.to_str());
    match command {
        Some("push" | "fetch" | "pull") => GIT_NETWORK_TIMEOUT,
        Some("add" | "restore" | "rm" | "commit" | "stash" | "switch") => GIT_MUTATION_TIMEOUT,
        _ => GIT_READ_TIMEOUT,
    }
}

struct GitOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    truncated: bool,
}

fn read_limited(mut reader: impl Read) -> io::Result<(Vec<u8>, bool)> {
    let mut output = Vec::with_capacity(MAX_OUTPUT_BYTES.min(8 * 1024));
    let mut buffer = [0; 8 * 1024];
    let mut truncated = false;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            return Ok((output, truncated));
        }
        let remaining = MAX_OUTPUT_BYTES.saturating_sub(output.len());
        let retained = remaining.min(count);
        output.extend_from_slice(&buffer[..retained]);
        truncated |= retained != count;
    }
}

fn join_reader(reader: ReaderHandle) -> Result<(Vec<u8>, bool), GitError> {
    reader
        .join()
        .map_err(|_| GitError::safe("Git process output could not be read"))?
        .map_err(|_| GitError::safe("Git process output could not be read"))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum IoWaitOutcome {
    Finished,
    Cancelled,
    TimedOut,
}

fn wait_for_io(
    stdin_writer: Option<&WriterHandle>,
    stdout_reader: &ReaderHandle,
    stderr_reader: &ReaderHandle,
    cancellation: Option<&GitCancellation>,
    deadline: Instant,
) -> IoWaitOutcome {
    while stdin_writer.is_some_and(|writer| !writer.is_finished())
        || !stdout_reader.is_finished()
        || !stderr_reader.is_finished()
    {
        if cancellation.is_some_and(GitCancellation::is_cancelled) {
            return IoWaitOutcome::Cancelled;
        }
        if Instant::now() >= deadline {
            return IoWaitOutcome::TimedOut;
        }
        thread::sleep(Duration::from_millis(10));
    }
    IoWaitOutcome::Finished
}

fn stop_and_reap(
    process_group: &GitProcessGroup,
    mut child: std::process::Child,
    stdin_writer: Option<WriterHandle>,
    stdout_reader: ReaderHandle,
    stderr_reader: ReaderHandle,
) {
    process_group.terminate();
    let _ = child.kill();
    if let Some(writer) = &stdin_writer {
        cancel_blocking_io(writer);
    }
    cancel_blocking_io(&stdout_reader);
    cancel_blocking_io(&stderr_reader);
    // The job has been terminated, so all inherited writer handles are closing. Reap the
    // readers away from the serialized repository operation instead of leaking them or
    // extending the UI timeout.
    if let Err(error) = thread::Builder::new()
        .name("repopuck-git-output-reaper".to_owned())
        .spawn(move || {
            let _ = child.wait();
            if let Some(writer) = stdin_writer {
                let _ = writer.join();
            }
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
        })
    {
        eprintln!("RepoPuck could not start the Git output reaper: {error}");
    }
}

impl GitError {
    pub fn safe(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    fn unavailable() -> Self {
        Self::safe("Git is unavailable on PATH")
    }

    fn isolation() -> Self {
        Self::safe("Git process could not be isolated safely")
    }

    fn timed_out() -> Self {
        Self::safe("Git operation timed out and was stopped")
    }

    fn cancelled() -> Self {
        Self::safe("Git operation was cancelled")
    }

    fn output_limit() -> Self {
        Self::safe("Git operation produced too much output")
    }

    fn failed(code: Option<i32>, stderr: &str) -> Self {
        let code = code
            .map(|value| value.to_string())
            .unwrap_or_else(|| "terminated".to_owned());
        if let Some(classification) = classify_error(stderr) {
            Self::safe(format!("{classification} (exit code {code})"))
        } else {
            Self::safe(format!("Git operation failed (exit code {code})"))
        }
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for GitError {}

fn classify_error(stderr: &str) -> Option<&'static str> {
    let mut lines = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let message = lines.next()?;
    if lines.next().is_some() || contains_sensitive_diagnostic_value(message) {
        return None;
    }
    let message = message.to_ascii_lowercase();

    if message.starts_with("fatal: unable to create ")
        && message.contains(".git/index.lock")
        && (message.contains("file exists") || message.contains("another git process"))
    {
        Some("Git index is locked")
    } else if message.starts_with("fatal: authentication failed")
        || message.starts_with("fatal: authentication required")
        || message.starts_with("fatal: could not read username")
        || message == "fatal: terminal prompts disabled"
    {
        Some("Git authentication failed")
    } else if message.starts_with("fatal: repository not found")
        || message.starts_with("fatal: not a git repository")
        || (message.starts_with("fatal: '")
            && message.ends_with("does not appear to be a git repository"))
    {
        Some("Git repository was not found")
    } else if message.starts_with("fatal: the current branch ")
        && message.ends_with(" has no upstream branch.")
    {
        Some("Current Git branch has no upstream")
    } else if (message.starts_with("! [rejected]") && message.ends_with("(non-fast-forward)"))
        || message == "fatal: not possible to fast-forward, aborting."
        || message == "error: failed to push some refs; fetch first"
    {
        Some("Git push was rejected")
    } else if message
        .starts_with("error: your local changes to the following files would be overwritten by")
    {
        Some("Local changes prevent this Git operation")
    } else if message.starts_with("nothing to commit")
        || message == "nothing added to commit but untracked files present"
    {
        Some("There is nothing to commit")
    } else if message == "fatal: exiting because of an unresolved conflict."
        || message == "error: committing is not possible because you have unmerged files."
    {
        Some("Git operation has conflicts")
    } else {
        None
    }
}

fn contains_sensitive_diagnostic_value(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("://")
        || message.contains('@')
        || message.contains('?')
        || message.contains("authorization")
        || message.contains("credential")
        || message.contains("password")
        || message.contains("token")
        || message.contains("oauth")
        || message.contains("bearer")
        || message.contains("secret")
}

pub(crate) fn sanitize_remote_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let unquoted = if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    if unquoted.is_empty() || unquoted.chars().any(char::is_control) {
        return None;
    }

    if let Some(scheme_end) = unquoted.find("://") {
        let authority_start = scheme_end + 3;
        let authority_end = unquoted[authority_start..]
            .find(['/', '?', '#'])
            .map(|offset| authority_start + offset)
            .unwrap_or(unquoted.len());
        let authority = &unquoted[authority_start..authority_end];
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host);
        if host.is_empty() {
            return None;
        }
        let suffix = &unquoted[authority_end..];
        let safe_suffix_end = suffix.find(['?', '#']).unwrap_or(suffix.len());
        return Some(format!(
            "{}://{}{}",
            &unquoted[..scheme_end],
            host,
            &suffix[..safe_suffix_end]
        ));
    }

    let safe_end = unquoted.find(['?', '#']).unwrap_or(unquoted.len());
    let safe_value = &unquoted[..safe_end];
    let lower = safe_value.to_ascii_lowercase();
    if lower.contains("authorization")
        || lower.contains("credential")
        || lower.contains("password=")
        || lower.contains("token=")
        || lower.contains("bearer ")
    {
        None
    } else if is_explicit_local_path(safe_value) {
        Some(safe_value.to_owned())
    } else {
        sanitize_scp_remote(safe_value)
    }
}

fn is_explicit_local_path(value: &str) -> bool {
    value.starts_with('/')
        || value.starts_with("./")
        || value.starts_with("../")
        || value.starts_with("\\\\")
        || (value.len() >= 3
            && value.as_bytes()[0].is_ascii_alphabetic()
            && value.as_bytes()[1] == b':'
            && matches!(value.as_bytes()[2], b'/' | b'\\'))
        || (!value.contains([':', '@']) && !value.is_empty())
}

fn sanitize_scp_remote(value: &str) -> Option<String> {
    let (user, host_and_path) = value
        .rsplit_once('@')
        .map_or((None, value), |(user, remote)| (Some(user), remote));
    let (host, path) = host_and_path.split_once(':')?;
    if host.is_empty()
        || path.is_empty()
        || host.contains(['/', '\\', '@'])
        || host.chars().any(char::is_whitespace)
    {
        return None;
    }

    match user {
        Some(user)
            if !user.is_empty()
                && user.chars().all(|character| {
                    character.is_ascii_alphanumeric() || "._-".contains(character)
                }) =>
        {
            Some(value.to_owned())
        }
        Some(_) => Some(host_and_path.to_owned()),
        None => Some(value.to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::io::Cursor;
    use std::{
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };

    use super::{
        read_limited, sanitize_remote_url, timeout_for_args, wait_for_io, GitCancellation,
        GitError, GitRunner, IoWaitOutcome, GIT_MUTATION_TIMEOUT, GIT_NETWORK_TIMEOUT,
        GIT_READ_TIMEOUT, MAX_OUTPUT_BYTES,
    };

    #[test]
    fn bounded_reader_drains_output_without_retaining_more_than_the_limit() {
        let input = vec![b'x'; MAX_OUTPUT_BYTES + 1];
        let (output, truncated) = read_limited(Cursor::new(input)).expect("read output");

        assert_eq!(output.len(), MAX_OUTPUT_BYTES);
        assert!(truncated);
    }

    #[test]
    fn reader_wait_respects_the_operation_deadline() {
        let stdout_reader = thread::spawn(|| Ok((Vec::new(), false)));
        let stderr_reader = thread::spawn(|| {
            thread::sleep(Duration::from_millis(50));
            Ok((Vec::new(), false))
        });

        assert_eq!(
            wait_for_io(
                None,
                &stdout_reader,
                &stderr_reader,
                None,
                Instant::now() + Duration::from_millis(5)
            ),
            IoWaitOutcome::TimedOut
        );
    }

    #[test]
    fn reader_wait_observes_cancellation_after_the_root_process_exits() {
        let (release_tx, release_rx) = mpsc::channel();
        let stdout_reader = thread::spawn(move || {
            release_rx
                .recv()
                .expect("release descendant-held output pipe");
            Ok((Vec::new(), false))
        });
        let stderr_reader = thread::spawn(|| Ok((Vec::new(), false)));
        let cancellation = GitCancellation::default();
        let cancellation_request = cancellation.clone();
        let requester = thread::spawn(move || {
            thread::sleep(Duration::from_millis(20));
            cancellation_request.cancel();
        });

        assert_eq!(
            wait_for_io(
                None,
                &stdout_reader,
                &stderr_reader,
                Some(&cancellation),
                Instant::now() + Duration::from_secs(5)
            ),
            IoWaitOutcome::Cancelled
        );

        release_tx
            .send(())
            .expect("release descendant-held output pipe");
        requester.join().expect("cancellation requester");
        stdout_reader
            .join()
            .expect("stdout reader")
            .expect("stdout");
        stderr_reader
            .join()
            .expect("stderr reader")
            .expect("stderr");
    }

    #[cfg(windows)]
    #[test]
    fn cancelling_after_git_exits_terminates_a_descendant_holding_the_output_pipe() {
        let cancellation = GitCancellation::default();
        let runner =
            GitRunner::new(env!("CARGO_MANIFEST_DIR")).with_cancellation(cancellation.clone());
        let (result_tx, result_rx) = mpsc::channel();
        thread::spawn(move || {
            let result = runner.run(["-c", "alias.repopuckhold=!sleep 8 &", "repopuckhold"]);
            let _ = result_tx.send(result);
        });

        // The Git-for-Windows shell exits immediately after launching the background
        // descendant, while that descendant retains the inherited output pipe.
        thread::sleep(Duration::from_millis(500));
        let cancelled_at = Instant::now();
        cancellation.cancel();
        let result = result_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("cancellation should terminate the descendant-held pipe promptly");

        assert_eq!(
            result.expect_err("cancelled runner should fail").message(),
            "Git operation was cancelled"
        );
        assert!(cancelled_at.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn long_running_game_project_mutations_receive_operation_specific_timeouts() {
        let args = |command: &str| vec![OsString::from(command)];

        assert_eq!(timeout_for_args(&args("status")), GIT_READ_TIMEOUT);
        assert_eq!(timeout_for_args(&args("add")), GIT_MUTATION_TIMEOUT);
        assert_eq!(timeout_for_args(&args("commit")), GIT_MUTATION_TIMEOUT);
        assert_eq!(timeout_for_args(&args("push")), GIT_NETWORK_TIMEOUT);
        assert_eq!(timeout_for_args(&args("fetch")), GIT_NETWORK_TIMEOUT);
        assert_eq!(timeout_for_args(&args("pull")), GIT_NETWORK_TIMEOUT);
    }

    #[test]
    fn cancelled_runner_stops_before_starting_git() {
        let cancellation = GitCancellation::default();
        cancellation.cancel();
        let runner = GitRunner::new(std::env::temp_dir()).with_cancellation(cancellation);

        let error = runner
            .run(["status"])
            .expect_err("cancelled runner should not start Git");

        assert_eq!(error.message(), "Git operation was cancelled");
    }

    #[test]
    fn query_token_stderr_is_not_returned() {
        let error = GitError::failed(
            Some(128),
            "fatal: unable to access https://example.com/repo.git?token=query-secret",
        );

        assert_eq!(error.message(), "Git operation failed (exit code 128)");
    }

    #[test]
    fn quoted_url_credentials_are_not_returned() {
        let error = GitError::failed(
            Some(128),
            "fatal: unable to access 'https://alice:password@example.com/repo.git?access_token=quoted-secret'",
        );

        assert_eq!(error.message(), "Git operation failed (exit code 128)");
    }

    #[test]
    fn credential_helper_stderr_is_not_returned() {
        let error = GitError::failed(
            Some(1),
            "credential-helper failed: Authorization: Bearer helper-secret; password=hidden",
        );

        assert_eq!(error.message(), "Git operation failed (exit code 1)");
    }

    #[test]
    fn ordinary_remote_urls_are_preserved() {
        assert_eq!(
            sanitize_remote_url("https://github.com/openai/repopuck.git"),
            Some("https://github.com/openai/repopuck.git".to_owned())
        );
        assert_eq!(
            sanitize_remote_url("git@github.com:openai/repopuck.git"),
            Some("git@github.com:openai/repopuck.git".to_owned())
        );
    }

    #[test]
    fn remote_url_user_info_and_query_values_are_removed() {
        assert_eq!(
            sanitize_remote_url(
                "\"https://alice:password@example.com/openai/repopuck.git?token=query-secret\""
            ),
            Some("https://example.com/openai/repopuck.git".to_owned())
        );
    }

    #[test]
    fn scheme_less_remote_credentials_are_removed() {
        assert_eq!(
            sanitize_remote_url("oauth2:secret@example.com:org/repo.git"),
            Some("example.com:org/repo.git".to_owned())
        );
        assert_eq!(
            sanitize_remote_url("user:secret@host:path"),
            Some("host:path".to_owned())
        );
    }

    #[test]
    fn common_safe_git_errors_have_static_diagnostics_and_exit_codes() {
        let cases = [
            (
                "fatal: Unable to create '.git/index.lock': File exists.",
                "Git index is locked (exit code 128)",
            ),
            (
                "fatal: The current branch main has no upstream branch.",
                "Current Git branch has no upstream (exit code 128)",
            ),
            (
                "fatal: not a git repository (or any of the parent directories): .git",
                "Git repository was not found (exit code 128)",
            ),
            (
                "error: Your local changes to the following files would be overwritten by checkout",
                "Local changes prevent this Git operation (exit code 128)",
            ),
        ];

        for (stderr, expected) in cases {
            assert_eq!(GitError::failed(Some(128), stderr).message(), expected);
        }
    }

    #[test]
    fn sensitive_markers_force_generic_diagnostic_before_classification() {
        let error = GitError::failed(
            Some(128),
            "fatal: authentication failed for https://user:secret@host/repo?token=hidden Authorization: Bearer value",
        );

        assert_eq!(error.message(), "Git operation failed (exit code 128)");
    }

    #[test]
    fn harmless_multiline_stderr_uses_the_generic_fallback() {
        let error = GitError::failed(
            Some(1),
            "error: first harmless detail\nhelp: second harmless detail",
        );

        assert_eq!(error.message(), "Git operation failed (exit code 1)");
    }

    #[test]
    fn unknown_stderr_uses_the_generic_fallback() {
        let error = GitError::failed(Some(1), "error: an unclassified harmless failure");

        assert_eq!(error.message(), "Git operation failed (exit code 1)");
    }
}
