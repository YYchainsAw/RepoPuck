use std::{
    ffi::OsStr,
    fmt,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Debug)]
pub struct GitRunner {
    repository: PathBuf,
}

#[derive(Clone, Debug)]
pub struct GitError {
    message: String,
}

impl GitRunner {
    pub fn new(repository: impl Into<PathBuf>) -> Self {
        Self {
            repository: repository.into(),
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
        Ok(output.status.success().then_some(output.stdout))
    }

    pub fn run_with_paths(
        &self,
        fixed_args: &[&str],
        paths: &[String],
    ) -> Result<Vec<u8>, GitError> {
        let mut args = fixed_args.iter().map(OsStr::new).collect::<Vec<_>>();
        args.push(OsStr::new("--"));
        args.extend(paths.iter().map(OsStr::new));
        self.run(args)
    }

    fn command<I, S>(&self, args: I) -> Result<std::process::Output, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Command::new("git")
            .current_dir(&self.repository)
            .args(args)
            .output()
            .map_err(|_| GitError::unavailable())
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
    use super::{sanitize_remote_url, GitError};

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
}
