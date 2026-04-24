pub(crate) mod detection;
mod lookup;
pub(crate) mod matching;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;

pub use lookup::{compare_against_release, lookup_and_compare};
pub use types::*;

const TITLE_MATCH_THRESHOLD: f64 = 0.7;
