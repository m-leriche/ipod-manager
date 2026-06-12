//! Genre whitelist filtering. Raw Last.fm tags are noisy ("seen live",
//! "favorites", decades), so only tags on a known-genre list are kept.

use std::collections::HashSet;
use std::sync::OnceLock;

use super::lastfm_tags::TagCount;

/// Whitelist vendored from beets' lastgenre plugin (MIT licensed):
/// <https://github.com/beetbox/beets/blob/master/beetsplug/lastgenre/genres.txt>
static WHITELIST: OnceLock<HashSet<&'static str>> = OnceLock::new();

fn whitelist() -> &'static HashSet<&'static str> {
    WHITELIST.get_or_init(|| {
        include_str!("genres.txt")
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect()
    })
}

/// Filter raw Last.fm tags down to real genres: whitelist match
/// (case-insensitive), minimum weight, deduped, capped at `max`.
/// Order follows the input — Last.fm returns tags sorted by weight.
pub(super) fn select_genres(tags: &[TagCount], min_weight: u32, max: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut picked = Vec::new();
    for tag in tags {
        if picked.len() >= max {
            break;
        }
        if tag.weight < min_weight {
            continue;
        }
        let lower = tag.name.trim().to_lowercase();
        if lower.is_empty() || !whitelist().contains(lower.as_str()) {
            continue;
        }
        if !seen.insert(lower.clone()) {
            continue;
        }
        picked.push(title_case(&lower));
    }
    picked
}

/// Title-case a lowercase genre name: uppercase the first letter of every
/// alphabetic run ("hip hop" → "Hip Hop", "post-rock" → "Post-Rock",
/// "r&b" → "R&B"). Output never contains ';', so joined suggestions split
/// cleanly.
pub(super) fn title_case(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut at_word_start = true;
    for c in s.chars() {
        if c.is_alphabetic() {
            if at_word_start {
                out.extend(c.to_uppercase());
                at_word_start = false;
            } else {
                out.push(c);
            }
        } else {
            out.push(c);
            at_word_start = true;
        }
    }
    out
}
