mod cache;
mod checks;
mod convert;
mod filing;
mod scan;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;
mod watcher;

pub use cache::cache_tracklist;
pub use checks::verify_tracklist;
pub use convert::convert_album;
pub use filing::{file_album, undo_filing};
pub use scan::scan_inbox;
pub use types::*;
pub use watcher::InboxWatcher;

pub const INBOX_LOCATION_KEY: &str = "inbox_location";
