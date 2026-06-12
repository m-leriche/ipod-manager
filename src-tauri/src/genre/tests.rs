use super::lastfm_tags::{parse_toptags, TagCount};
use super::whitelist::{select_genres, title_case};
use super::{MAX_GENRES, MIN_WEIGHT};

fn tag(name: &str, weight: u32) -> TagCount {
    TagCount {
        name: name.to_string(),
        weight,
    }
}

#[test]
fn select_drops_non_whitelisted_tags() {
    let tags = vec![
        tag("seen live", 100),
        tag("rock", 90),
        tag("favorites", 80),
        tag("MyMusic", 70),
        tag("grunge", 60),
    ];
    assert_eq!(
        select_genres(&tags, MIN_WEIGHT, MAX_GENRES),
        vec!["Rock", "Grunge"]
    );
}

#[test]
fn select_drops_low_weight_tags() {
    let tags = vec![tag("rock", 100), tag("grunge", 9), tag("pop", 0)];
    assert_eq!(select_genres(&tags, MIN_WEIGHT, MAX_GENRES), vec!["Rock"]);
}

#[test]
fn select_caps_at_max_and_preserves_order() {
    let tags = vec![
        tag("rock", 100),
        tag("grunge", 90),
        tag("punk rock", 80),
        tag("pop", 70),
    ];
    assert_eq!(
        select_genres(&tags, MIN_WEIGHT, 3),
        vec!["Rock", "Grunge", "Punk Rock"]
    );
}

#[test]
fn select_dedupes_case_insensitively() {
    let tags = vec![tag("Rock", 100), tag("rock", 90), tag("ROCK", 80)];
    assert_eq!(select_genres(&tags, MIN_WEIGHT, MAX_GENRES), vec!["Rock"]);
}

#[test]
fn title_case_handles_spaces_hyphens_and_ampersands() {
    assert_eq!(title_case("hip hop"), "Hip Hop");
    assert_eq!(title_case("post-rock"), "Post-Rock");
    assert_eq!(title_case("r&b"), "R&B");
    assert_eq!(title_case("rock"), "Rock");
}

#[test]
fn parse_toptags_handles_array_form() {
    let json: serde_json::Value = serde_json::from_str(
        r#"{"toptags":{"tag":[{"name":"rock","count":100},{"name":"grunge","count":64}]}}"#,
    )
    .unwrap();
    let tags = parse_toptags(&json);
    assert_eq!(tags.len(), 2);
    assert_eq!(tags[0].name, "rock");
    assert_eq!(tags[0].weight, 100);
}

#[test]
fn parse_toptags_handles_single_object_form() {
    let json: serde_json::Value =
        serde_json::from_str(r#"{"toptags":{"tag":{"name":"rock","count":100}}}"#).unwrap();
    let tags = parse_toptags(&json);
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].name, "rock");
}

#[test]
fn parse_toptags_handles_missing_tags() {
    let json: serde_json::Value = serde_json::from_str(r#"{"toptags":{}}"#).unwrap();
    assert!(parse_toptags(&json).is_empty());
    let json: serde_json::Value = serde_json::from_str(r#"{}"#).unwrap();
    assert!(parse_toptags(&json).is_empty());
}
