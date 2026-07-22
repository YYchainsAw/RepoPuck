const MAX_RECENT_REPOSITORIES: usize = 6;

pub fn remember_repository(existing: &[String], path: &str) -> Vec<String> {
    let path = path.trim();
    if path.is_empty() {
        return existing.to_vec();
    }

    std::iter::once(path.to_owned())
        .chain(
            existing
                .iter()
                .filter(|recent| recent.as_str() != path)
                .cloned(),
        )
        .take(MAX_RECENT_REPOSITORIES)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::remember_repository;

    #[test]
    fn moves_a_repository_to_the_front_without_duplicates() {
        let recent = vec!["C:\\one".to_owned(), "C:\\two".to_owned()];

        assert_eq!(
            remember_repository(&recent, "C:\\two"),
            vec!["C:\\two".to_owned(), "C:\\one".to_owned()]
        );
    }

    #[test]
    fn bounds_the_recent_repository_list() {
        let recent = (0..8)
            .map(|index| format!("C:\\repo-{index}"))
            .collect::<Vec<_>>();

        let remembered = remember_repository(&recent, "C:\\new");

        assert_eq!(remembered.len(), 6);
        assert_eq!(remembered[0], "C:\\new");
        assert_eq!(remembered[5], "C:\\repo-4");
    }

    #[test]
    fn ignores_blank_repository_paths() {
        let recent = vec!["C:\\one".to_owned()];

        assert_eq!(remember_repository(&recent, "  "), recent);
    }
}
