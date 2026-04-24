mod compare;
pub(crate) mod copy;
mod fileops;
mod listing;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;

pub use compare::compare_dirs;
pub use copy::{copy_file_list, delete_file_list};
pub use fileops::{create_folder, move_file_list, rename_entry};
pub use listing::list_dir;
pub use types::*;
