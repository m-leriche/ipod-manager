mod checks;
mod filing;
mod scan;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;
mod watcher;

pub use checks::verify_tracklist;
pub use filing::{file_album, undo_filing};
pub use scan::scan_inbox;
pub use types::*;
pub use watcher::InboxWatcher;

pub const INBOX_LOCATION_KEY: &str = "inbox_location";
