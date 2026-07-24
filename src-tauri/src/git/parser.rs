use std::collections::HashMap;

use super::model::{ChangeEntry, ChangeKind};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NumStat {
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedChanges {
    pub changes: Vec<ChangeEntry>,
    pub rename_sources: HashMap<String, String>,
}

pub(crate) fn parse_numstat(output: &[u8]) -> Result<HashMap<String, NumStat>, String> {
    let mut records = output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty());
    let mut stats = HashMap::new();

    while let Some(record) = records.next() {
        let text = std::str::from_utf8(record).map_err(|_| "Git returned a non-UTF-8 path")?;
        let mut fields = text.splitn(3, '\t');
        let additions = parse_count(fields.next().ok_or("Missing additions field")?)?;
        let deletions = parse_count(fields.next().ok_or("Missing deletions field")?)?;
        let mut path = fields.next().ok_or("Missing numstat path")?.to_owned();

        if path.is_empty() {
            let _old_path = records.next().ok_or("Missing renamed source path")?;
            path = std::str::from_utf8(records.next().ok_or("Missing renamed target path")?)
                .map_err(|_| "Git returned a non-UTF-8 path")?
                .to_owned();
        }

        stats.insert(
            path,
            NumStat {
                additions,
                deletions,
            },
        );
    }

    Ok(stats)
}

pub(crate) fn parse_changes(
    status: &[u8],
    cached_numstat: &[u8],
    unstaged_numstat: &[u8],
) -> Result<Vec<ChangeEntry>, String> {
    parse_changes_with_renames(status, cached_numstat, unstaged_numstat)
        .map(|parsed| parsed.changes)
}

pub(crate) fn parse_changes_with_renames(
    status: &[u8],
    cached_numstat: &[u8],
    unstaged_numstat: &[u8],
) -> Result<ParsedChanges, String> {
    let cached = parse_numstat(cached_numstat)?;
    let unstaged = parse_numstat(unstaged_numstat)?;
    let mut records = status
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty());
    let mut changes = Vec::new();
    let mut rename_sources = HashMap::new();

    while let Some(record) = records.next() {
        if record.len() < 3 || record[2] != b' ' {
            return Err("Malformed porcelain status record".to_owned());
        }
        let index = record[0] as char;
        let worktree = record[1] as char;
        let path = std::str::from_utf8(&record[3..])
            .map_err(|_| "Git returned a non-UTF-8 path")?
            .to_owned();

        if matches!(index, 'R' | 'C') || matches!(worktree, 'R' | 'C') {
            let source = std::str::from_utf8(records.next().ok_or("Missing renamed source path")?)
                .map_err(|_| "Git returned a non-UTF-8 path")?
                .to_owned();
            rename_sources.insert(path.clone(), source);
        }

        if index == '?' && worktree == '?' {
            changes.push(ChangeEntry {
                path,
                kind: ChangeKind::Added,
                staged: false,
                untracked: true,
                additions: 0,
                deletions: 0,
                game_category: None,
            });
            continue;
        }

        if index != ' ' && index != '!' {
            changes.push(change_entry(&path, index, true, false, cached.get(&path)));
        }
        if worktree != ' ' && worktree != '!' {
            changes.push(change_entry(
                &path,
                worktree,
                false,
                false,
                unstaged.get(&path),
            ));
        }
    }

    Ok(ParsedChanges {
        changes,
        rename_sources,
    })
}

fn parse_count(value: &str) -> Result<Option<u64>, String> {
    if value == "-" {
        Ok(None)
    } else {
        value
            .parse()
            .map(Some)
            .map_err(|_| "Invalid numstat count".to_owned())
    }
}

fn change_entry(
    path: &str,
    status: char,
    staged: bool,
    untracked: bool,
    stat: Option<&NumStat>,
) -> ChangeEntry {
    let kind = match status {
        'A' | '?' => ChangeKind::Added,
        'D' => ChangeKind::Deleted,
        'R' | 'C' => ChangeKind::Renamed,
        _ => ChangeKind::Modified,
    };

    ChangeEntry {
        path: path.to_owned(),
        kind,
        staged,
        untracked,
        additions: stat.and_then(|value| value.additions).unwrap_or_default(),
        deletions: stat.and_then(|value| value.deletions).unwrap_or_default(),
        game_category: None,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_changes, parse_numstat};

    #[test]
    fn parses_porcelain_records_and_merges_staged_and_unstaged_numstat() {
        let status = b"M  staged.txt\0 M unstaged file.txt\0A  added.txt\0D  deleted.txt\0R  renamed file.txt\0old file.txt\0?? untracked file.txt\0";
        let cached =
            b"3\t1\tstaged.txt\x001\t0\tadded.txt\x000\t4\tdeleted.txt\x002\t1\trenamed file.txt\0";
        let uncached = b"5\t2\tunstaged file.txt\0";

        let changes = parse_changes(status, cached, uncached).expect("valid Git output");

        assert_eq!(changes.len(), 6);
        assert!(changes.iter().any(|entry| {
            entry.path == "staged.txt"
                && entry.kind.as_ref() == "modified"
                && entry.staged
                && !entry.untracked
                && entry.additions == 3
                && entry.deletions == 1
        }));
        assert!(changes.iter().any(|entry| {
            entry.path == "unstaged file.txt"
                && entry.kind.as_ref() == "modified"
                && !entry.staged
                && entry.additions == 5
                && entry.deletions == 2
        }));
        assert!(changes.iter().any(|entry| {
            entry.path == "added.txt" && entry.kind.as_ref() == "added" && entry.staged
        }));
        assert!(changes.iter().any(|entry| {
            entry.path == "deleted.txt" && entry.kind.as_ref() == "deleted" && entry.staged
        }));
        assert!(changes.iter().any(|entry| {
            entry.path == "renamed file.txt" && entry.kind.as_ref() == "renamed" && entry.staged
        }));
        assert!(changes.iter().any(|entry| {
            entry.path == "untracked file.txt"
                && entry.kind.as_ref() == "added"
                && !entry.staged
                && entry.untracked
        }));
    }

    #[test]
    fn emits_distinct_entries_when_a_path_has_staged_and_unstaged_changes() {
        let changes = parse_changes(b"MM both.txt\0", b"2\t0\tboth.txt\0", b"1\t3\tboth.txt\0")
            .expect("valid Git output");

        assert_eq!(changes.len(), 2);
        assert!(changes
            .iter()
            .any(|entry| entry.staged && entry.additions == 2 && entry.deletions == 0));
        assert!(changes
            .iter()
            .any(|entry| !entry.staged && entry.additions == 1 && entry.deletions == 3));
    }

    #[test]
    fn parses_binary_numstat_as_missing_counts() {
        let stats = parse_numstat(b"-\t-\timage.bin\0").expect("valid binary numstat");
        let binary = stats.get("image.bin").expect("binary path");

        assert_eq!(binary.additions, None);
        assert_eq!(binary.deletions, None);
    }
}
