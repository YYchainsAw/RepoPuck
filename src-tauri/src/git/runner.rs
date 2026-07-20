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
        let detail = redact_url_credentials(stderr.trim());
        let code = code
            .map(|value| value.to_string())
            .unwrap_or_else(|| "terminated".to_owned());
        if detail.is_empty() {
            Self::safe(format!("Git exited with code {code}"))
        } else {
            Self::safe(format!("Git exited with code {code}: {detail}"))
        }
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for GitError {}

pub(crate) fn redact_url_credentials(value: &str) -> String {
    value
        .split_whitespace()
        .map(|word| {
            let Some(scheme) = word.find("://") else {
                return word.to_owned();
            };
            let credentials_start = scheme + 3;
            let Some(relative_at) = word[credentials_start..].find('@') else {
                return word.to_owned();
            };
            let at = credentials_start + relative_at;
            format!("{}[redacted]{}", &word[..credentials_start], &word[at..])
        })
        .collect::<Vec<_>>()
        .join(" ")
}
