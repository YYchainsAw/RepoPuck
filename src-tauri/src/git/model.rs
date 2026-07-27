use serde::Serialize;

use crate::game_projects::{FileCategory, GameProjectProfile, GameProjectRisk};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

impl AsRef<str> for ChangeKind {
    fn as_ref(&self) -> &str {
        match self {
            Self::Added => "added",
            Self::Modified => "modified",
            Self::Deleted => "deleted",
            Self::Renamed => "renamed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEntry {
    pub path: String,
    pub kind: ChangeKind,
    pub staged: bool,
    pub untracked: bool,
    pub additions: u64,
    pub deletions: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_category: Option<FileCategory>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    pub name: String,
    pub is_current: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub repository: RepositoryInfo,
    pub current_branch: String,
    pub branches: Vec<BranchSummary>,
    pub ahead: u64,
    pub behind: u64,
    pub changes: Vec<ChangeEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_project: Option<GameProjectProfile>,
    pub game_safety_issues: Vec<GameProjectRisk>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl OperationResult {
    pub fn success(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: Some(message.into()),
        }
    }

    pub fn failure(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: Some(message.into()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CommitAndPushStage {
    Commit,
    Push,
    Complete,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAndPushResult {
    pub success: bool,
    pub committed: bool,
    pub pushed: bool,
    pub stage: CommitAndPushStage,
    pub message: String,
}

impl CommitAndPushResult {
    pub fn commit_failed(message: impl Into<String>) -> Self {
        Self {
            success: false,
            committed: false,
            pushed: false,
            stage: CommitAndPushStage::Commit,
            message: message.into(),
        }
    }

    pub fn push_failed(message: impl Into<String>) -> Self {
        Self {
            success: false,
            committed: true,
            pushed: false,
            stage: CommitAndPushStage::Push,
            message: message.into(),
        }
    }

    pub fn complete(message: impl Into<String>) -> Self {
        Self {
            success: true,
            committed: true,
            pushed: true,
            stage: CommitAndPushStage::Complete,
            message: message.into(),
        }
    }
}
