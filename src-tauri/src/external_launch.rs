//! Parsing for repository-open requests received from external processes.
//!
//! This module deliberately has no Tauri or operating-system integration. The
//! startup and single-instance layers can therefore use the same parser for
//! normal command-line arguments and custom-protocol activations.

use std::{
    error::Error,
    ffi::{OsStr, OsString},
    fmt,
    path::PathBuf,
};

const PROTOCOL_SCHEME: &str = "repopuck";
const OPEN_HOST: &str = "open";

/// A validated request to make a repository the active RepoPuck project.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalOpenRequest {
    repository_path: PathBuf,
    source: ExternalOpenSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExternalOpenSource {
    Cli,
    Protocol,
}

impl ExternalOpenRequest {
    fn from_os_path(path: &OsStr, source: ExternalOpenSource) -> Result<Self, ExternalLaunchError> {
        if path.is_empty() || path.to_str().is_some_and(|value| value.trim().is_empty()) {
            return Err(ExternalLaunchError::EmptyPath);
        }

        Ok(Self {
            repository_path: PathBuf::from(path),
            source,
        })
    }

    pub fn into_parts(self) -> (PathBuf, ExternalOpenSource) {
        (self.repository_path, self.source)
    }
}

/// Why an otherwise recognized external-open request could not be parsed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExternalLaunchError {
    EmptyPath,
    MissingPath,
    UnexpectedArguments,
    InvalidUri,
    UnsupportedScheme,
    UnsupportedHost,
    DuplicatePath,
    InvalidPercentEncoding,
    InvalidUtf8,
    InvalidPath,
    NetworkPathNotAllowed,
    LocalPathRequired,
}

impl fmt::Display for ExternalLaunchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::EmptyPath => "the repository path is empty",
            Self::MissingPath => "the external open request has no repository path",
            Self::UnexpectedArguments => "the external open request has unexpected arguments",
            Self::InvalidUri => "the RepoPuck URI is malformed",
            Self::UnsupportedScheme => "the URI scheme is not repopuck",
            Self::UnsupportedHost => "the RepoPuck URI host is not open",
            Self::DuplicatePath => "the RepoPuck URI contains more than one path parameter",
            Self::InvalidPercentEncoding => "the RepoPuck URI has invalid percent encoding",
            Self::InvalidUtf8 => "the RepoPuck URI contains invalid UTF-8",
            Self::InvalidPath => "the repository path contains an invalid character",
            Self::NetworkPathNotAllowed => {
                "network paths are not accepted from RepoPuck protocol links"
            }
            Self::LocalPathRequired => {
                "RepoPuck protocol links require an absolute local Windows path"
            }
        };
        formatter.write_str(message)
    }
}

impl Error for ExternalLaunchError {}

/// Parses an external-open command line.
///
/// Both of these input styles are accepted so callers may pass either
/// `std::env::args_os()` or `std::env::args_os().skip(1)`:
///
/// - `repopuck open <path>` / `open <path>`
/// - `repopuck --repo <path>` / `--repo <path>`
/// - `repopuck repopuck://open?path=...` / `repopuck://open?path=...`
///
/// Unrelated arguments return `Ok(None)`, allowing normal application startup
/// to share this parser. Once a recognized command or protocol is seen,
/// malformed input is reported as an error instead of being silently ignored.
pub fn parse_external_open_request<I, S>(
    arguments: I,
) -> Result<Option<ExternalOpenRequest>, ExternalLaunchError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let arguments: Vec<OsString> = arguments
        .into_iter()
        .map(|argument| argument.as_ref().to_os_string())
        .collect();
    let arguments = strip_optional_launcher(&arguments);

    let Some(first) = arguments.first() else {
        return Ok(None);
    };

    if os_str_eq(first, "open") || os_str_eq(first, "--repo") {
        return parse_path_command(arguments).map(Some);
    }

    let Some(first) = first.to_str() else {
        return Ok(None);
    };

    if has_repopuck_scheme(first) {
        if arguments.len() != 1 {
            return Err(ExternalLaunchError::UnexpectedArguments);
        }
        return parse_protocol_uri(first).map(Some);
    }

    Ok(None)
}

/// Parses a `repopuck://open?path=...` custom-protocol activation.
pub fn parse_protocol_uri(uri: &str) -> Result<ExternalOpenRequest, ExternalLaunchError> {
    if uri.is_empty() || uri.chars().any(|character| character.is_control()) {
        return Err(ExternalLaunchError::InvalidUri);
    }

    let (scheme, remainder) = uri.split_once(':').ok_or(ExternalLaunchError::InvalidUri)?;
    if !scheme.eq_ignore_ascii_case(PROTOCOL_SCHEME) {
        return Err(ExternalLaunchError::UnsupportedScheme);
    }

    let remainder = remainder
        .strip_prefix("//")
        .ok_or(ExternalLaunchError::InvalidUri)?;
    if remainder.contains('#') {
        return Err(ExternalLaunchError::InvalidUri);
    }

    let (authority_and_path, query) = remainder
        .split_once('?')
        .ok_or(ExternalLaunchError::MissingPath)?;
    let (host, uri_path) = match authority_and_path.split_once('/') {
        Some((host, path)) => (host, Some(path)),
        None => (authority_and_path, None),
    };

    if !host.eq_ignore_ascii_case(OPEN_HOST) {
        return Err(ExternalLaunchError::UnsupportedHost);
    }
    if uri_path.is_some_and(|path| !path.is_empty()) {
        return Err(ExternalLaunchError::InvalidUri);
    }

    let mut repository_path = None;
    for field in query.split('&') {
        if field.is_empty() {
            continue;
        }

        let (encoded_key, encoded_value) = field
            .split_once('=')
            .ok_or(ExternalLaunchError::InvalidUri)?;
        let key = percent_decode(encoded_key)?;
        let value = percent_decode(encoded_value)?;

        if key == "path" && repository_path.replace(value).is_some() {
            return Err(ExternalLaunchError::DuplicatePath);
        }
    }

    let repository_path = repository_path.ok_or(ExternalLaunchError::MissingPath)?;
    if repository_path.chars().any(char::is_control) {
        return Err(ExternalLaunchError::InvalidPath);
    }
    if repository_path.trim().is_empty() {
        return Err(ExternalLaunchError::EmptyPath);
    }
    let windows_path = repository_path.replace('/', "\\");
    if windows_path.starts_with(r"\\") {
        return Err(ExternalLaunchError::NetworkPathNotAllowed);
    }
    let bytes = windows_path.as_bytes();
    if bytes.len() < 3 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' || bytes[2] != b'\\' {
        return Err(ExternalLaunchError::LocalPathRequired);
    }

    ExternalOpenRequest::from_os_path(OsStr::new(&repository_path), ExternalOpenSource::Protocol)
}

fn parse_path_command(arguments: &[OsString]) -> Result<ExternalOpenRequest, ExternalLaunchError> {
    match arguments {
        [_command] => Err(ExternalLaunchError::MissingPath),
        [_command, path] => ExternalOpenRequest::from_os_path(path, ExternalOpenSource::Cli),
        _ => Err(ExternalLaunchError::UnexpectedArguments),
    }
}

fn strip_optional_launcher(arguments: &[OsString]) -> &[OsString] {
    if arguments
        .first()
        .is_some_and(|argument| is_repopuck_launcher(argument))
    {
        &arguments[1..]
    } else {
        arguments
    }
}

fn is_repopuck_launcher(argument: &OsStr) -> bool {
    let argument = argument.to_string_lossy();
    let file_name = argument
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(argument.as_ref());

    file_name.eq_ignore_ascii_case("repopuck") || file_name.eq_ignore_ascii_case("repopuck.exe")
}

fn os_str_eq(value: &OsStr, expected: &str) -> bool {
    value
        .to_str()
        .is_some_and(|value| value.eq_ignore_ascii_case(expected))
}

fn has_repopuck_scheme(value: &str) -> bool {
    value
        .split_once(':')
        .is_some_and(|(scheme, _)| scheme.eq_ignore_ascii_case(PROTOCOL_SCHEME))
}

fn percent_decode(value: &str) -> Result<String, ExternalLaunchError> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }

        let high = bytes
            .get(index + 1)
            .copied()
            .and_then(hex_value)
            .ok_or(ExternalLaunchError::InvalidPercentEncoding)?;
        let low = bytes
            .get(index + 2)
            .copied()
            .and_then(hex_value)
            .ok_or(ExternalLaunchError::InvalidPercentEncoding)?;
        decoded.push((high << 4) | low);
        index += 3;
    }

    String::from_utf8(decoded).map_err(|_| ExternalLaunchError::InvalidUtf8)
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path_of(request: ExternalOpenRequest) -> PathBuf {
        request.into_parts().0
    }

    #[test]
    fn parses_open_command_with_launcher_and_windows_path() {
        let request = parse_external_open_request([
            r"C:\Program Files\RepoPuck\repopuck.exe",
            "open",
            r"D:\Unity Projects\SpaceGame",
        ])
        .unwrap()
        .unwrap();

        assert_eq!(
            path_of(request),
            PathBuf::from(r"D:\Unity Projects\SpaceGame")
        );
    }

    #[test]
    fn parses_repo_flag_without_launcher() {
        let request = parse_external_open_request(["--repo", r"E:\Unreal\ProjectPhoenix"]).unwrap();

        assert_eq!(
            path_of(request.unwrap()),
            PathBuf::from(r"E:\Unreal\ProjectPhoenix")
        );
    }

    #[test]
    fn preserves_unicode_command_line_paths() {
        let request =
            parse_external_open_request(["repopuck", "open", r"D:\游戏项目\星际冒险"]).unwrap();

        assert_eq!(
            path_of(request.unwrap()),
            PathBuf::from(r"D:\游戏项目\星际冒险")
        );
    }

    #[test]
    fn parses_percent_encoded_windows_and_unicode_uri_path() {
        let request = parse_protocol_uri(
            "repopuck://open?path=D%3A%5CUnity%20Projects%5C%E6%98%9F%E9%99%85%E5%86%92%E9%99%A9",
        )
        .unwrap();

        assert_eq!(
            path_of(request),
            PathBuf::from(r"D:\Unity Projects\星际冒险")
        );
    }

    #[test]
    fn accepts_uri_as_command_line_argument() {
        let request = parse_external_open_request([
            "repopuck.exe",
            "repopuck://open?path=E%3A%5CUE%5CBlueprintGame",
        ])
        .unwrap()
        .unwrap();

        assert_eq!(path_of(request), PathBuf::from(r"E:\UE\BlueprintGame"));
    }

    #[test]
    fn preserves_plus_in_uri_path() {
        let request =
            parse_protocol_uri("repopuck://open?path=C%3A%5CProjects%5CC%2B%2BGame").unwrap();

        assert_eq!(path_of(request), PathBuf::from(r"C:\Projects\C++Game"));
    }

    #[test]
    fn permits_an_empty_uri_path_segment_and_future_query_fields() {
        let request = parse_protocol_uri("repopuck://OPEN/?source=unity&path=D%3A%5CGame").unwrap();

        assert_eq!(path_of(request), PathBuf::from(r"D:\Game"));
    }

    #[test]
    fn ignores_unrelated_application_arguments() {
        assert_eq!(
            parse_external_open_request(["repopuck", "--minimized"]).unwrap(),
            None
        );
    }

    #[test]
    fn rejects_non_open_uri_host() {
        assert_eq!(
            parse_protocol_uri("repopuck://settings?path=D%3A%5CGame"),
            Err(ExternalLaunchError::UnsupportedHost)
        );
    }

    #[test]
    fn rejects_non_repopuck_uri_scheme() {
        assert_eq!(
            parse_protocol_uri("https://open?path=D%3A%5CGame"),
            Err(ExternalLaunchError::UnsupportedScheme)
        );
    }

    #[test]
    fn rejects_missing_and_empty_paths() {
        assert_eq!(
            parse_external_open_request(["repopuck", "open"]),
            Err(ExternalLaunchError::MissingPath)
        );
        assert_eq!(
            parse_external_open_request(["--repo", ""]),
            Err(ExternalLaunchError::EmptyPath)
        );
        assert_eq!(
            parse_protocol_uri("repopuck://open?path="),
            Err(ExternalLaunchError::EmptyPath)
        );
        assert_eq!(
            parse_protocol_uri("repopuck://open?source=unity"),
            Err(ExternalLaunchError::MissingPath)
        );
    }

    #[test]
    fn rejects_extra_command_line_arguments() {
        assert_eq!(
            parse_external_open_request(["open", r"D:\Game", "--extra"]),
            Err(ExternalLaunchError::UnexpectedArguments)
        );
    }

    #[test]
    fn rejects_duplicate_path_query_parameters() {
        assert_eq!(
            parse_protocol_uri("repopuck://open?path=D%3A%5COne&path=E%3A%5CTwo"),
            Err(ExternalLaunchError::DuplicatePath)
        );
    }

    #[test]
    fn rejects_invalid_percent_encoding_and_utf8() {
        assert_eq!(
            parse_protocol_uri("repopuck://open?path=D%3A%5CBad%2"),
            Err(ExternalLaunchError::InvalidPercentEncoding)
        );
        assert_eq!(
            parse_protocol_uri("repopuck://open?path=%FF"),
            Err(ExternalLaunchError::InvalidUtf8)
        );
    }

    #[test]
    fn rejects_non_empty_uri_path_fragments_and_nul_paths() {
        assert_eq!(
            parse_protocol_uri("repopuck://open/project?path=D%3A%5CGame"),
            Err(ExternalLaunchError::InvalidUri)
        );
        assert_eq!(
            parse_protocol_uri("repopuck://open?path=D%3A%5CGame#section"),
            Err(ExternalLaunchError::InvalidUri)
        );
        assert_eq!(
            parse_protocol_uri("repopuck://open?path=D%3A%5CGame%00"),
            Err(ExternalLaunchError::InvalidPath)
        );
    }

    #[test]
    fn protocol_rejects_network_paths_but_the_explicit_cli_keeps_them() {
        for uri in [
            "repopuck://open?path=%5C%5Cserver%5Cshare%5CGame",
            "repopuck://open?path=%2F%5Cserver%5Cshare%5CGame",
            "repopuck://open?path=%5C%2Fserver%2Fshare%2FGame",
        ] {
            assert_eq!(
                parse_protocol_uri(uri),
                Err(ExternalLaunchError::NetworkPathNotAllowed)
            );
        }
        let cli = parse_external_open_request(["open", r"\\server\share\Game"])
            .expect("valid explicit CLI request")
            .expect("open request");
        assert_eq!(cli.into_parts().0, PathBuf::from(r"\\server\share\Game"));
    }

    #[test]
    fn protocol_requires_an_absolute_local_windows_path() {
        for uri in [
            "repopuck://open?path=relative%5CGame",
            "repopuck://open?path=C%3AGame",
            "repopuck://open?path=%2Fhome%2Fgame",
        ] {
            assert_eq!(
                parse_protocol_uri(uri),
                Err(ExternalLaunchError::LocalPathRequired)
            );
        }
    }

    #[test]
    fn desktop_bundle_registers_the_repopuck_protocol() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid Tauri config");

        assert_eq!(
            config["plugins"]["deep-link"]["desktop"]["schemes"],
            serde_json::json!(["repopuck"])
        );
    }
}
