/// Known noise words that appear inside parentheses/brackets and hurt search.
const NOISE_PREFIXES: &[&str] = &[
    "disc ",
    "disk ",
    "cd ",
    "deluxe",
    "remaster",
    "special edition",
    "expanded",
    "super expanded",
    "limited edition",
    "bonus track",
    "bonus disc",
    "anniversary",
    "super deluxe",
    "explicit",
    "clean version",
    "collector",
    "platinum edition",
    "gold edition",
    "standard edition",
    "international version",
    "uk version",
    "us version",
    "japanese edition",
    "japan edition",
];

/// Returns true if the inner text of a bracketed group is search noise.
fn is_noise(inner: &str) -> bool {
    let lower = inner.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }
    for prefix in NOISE_PREFIXES {
        if lower.starts_with(prefix) {
            return true;
        }
    }
    // Year-prefixed remaster: "2021 remaster", "2021 remastered version"
    if lower.len() >= 4
        && lower.as_bytes()[..4].iter().all(|b| b.is_ascii_digit())
        && lower.contains("remaster")
    {
        return true;
    }
    false
}

/// Strip one bracketed/parenthesized noise group from the string.
/// Returns None if nothing was stripped.
fn strip_one_noise_group(s: &str) -> Option<String> {
    for (open, close) in [('(', ')'), ('[', ']')] {
        if let Some(start) = s.find(open) {
            if let Some(rel_end) = s[start + 1..].find(close) {
                let inner = &s[start + 1..start + 1 + rel_end];
                if is_noise(inner) {
                    let mut result = s[..start].to_string();
                    result.push_str(&s[start + 1 + rel_end + 1..]);
                    return Some(result);
                }
            }
        }
    }
    None
}

/// Normalize an album or artist name for MusicBrainz search.
/// Strips disc indicators, edition markers, remaster tags, etc.
pub fn normalize_for_search(name: &str) -> String {
    let mut result = name.to_string();

    // Repeatedly strip noise groups (handles multiple like "(Disc 1) (Deluxe)")
    while let Some(stripped) = strip_one_noise_group(&result) {
        result = stripped;
    }

    // Collapse whitespace and trim
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_disc_number() {
        assert_eq!(normalize_for_search("Abbey Road (Disc 1)"), "Abbey Road");
        assert_eq!(normalize_for_search("Abbey Road [Disc 2]"), "Abbey Road");
        assert_eq!(normalize_for_search("Abbey Road (CD 1)"), "Abbey Road");
    }

    #[test]
    fn normalize_strips_edition_markers() {
        assert_eq!(normalize_for_search("Rumours (Deluxe Edition)"), "Rumours");
        assert_eq!(
            normalize_for_search("OK Computer [Remastered]"),
            "OK Computer"
        );
        assert_eq!(
            normalize_for_search("Kind of Blue (Special Edition)"),
            "Kind of Blue"
        );
        assert_eq!(
            normalize_for_search("Let It Be (Super Deluxe Edition)"),
            "Let It Be"
        );
    }

    #[test]
    fn normalize_strips_expanded_variants() {
        assert_eq!(
            normalize_for_search("Freedom Of Choice (Expanded)"),
            "Freedom Of Choice"
        );
        assert_eq!(
            normalize_for_search("Freedom Of Choice (Expanded Edition)"),
            "Freedom Of Choice"
        );
        assert_eq!(
            normalize_for_search("Freedom Of Choice (Super Expanded)"),
            "Freedom Of Choice"
        );
        assert_eq!(
            normalize_for_search("Freedom Of Choice (Expanded) [Disc 1]"),
            "Freedom Of Choice"
        );
    }

    #[test]
    fn normalize_strips_year_remaster() {
        assert_eq!(
            normalize_for_search("Dark Side of the Moon (2011 Remaster)"),
            "Dark Side of the Moon"
        );
        assert_eq!(
            normalize_for_search("Wish You Were Here [2021 Remastered Version]"),
            "Wish You Were Here"
        );
    }

    #[test]
    fn normalize_strips_multiple_noise_groups() {
        assert_eq!(
            normalize_for_search("Abbey Road (Disc 1) (Deluxe Edition)"),
            "Abbey Road"
        );
    }

    #[test]
    fn normalize_preserves_meaningful_parens() {
        assert_eq!(
            normalize_for_search("What's Going On (Original)"),
            "What's Going On (Original)"
        );
        assert_eq!(
            normalize_for_search("Music (Songs from the Motion Picture)"),
            "Music (Songs from the Motion Picture)"
        );
    }

    #[test]
    fn normalize_trims_whitespace() {
        assert_eq!(
            normalize_for_search("  Abbey Road  (Disc 1)  "),
            "Abbey Road"
        );
    }

    #[test]
    fn normalize_no_change_for_clean_name() {
        assert_eq!(normalize_for_search("Abbey Road"), "Abbey Road");
        assert_eq!(normalize_for_search("OK Computer"), "OK Computer");
    }
}
