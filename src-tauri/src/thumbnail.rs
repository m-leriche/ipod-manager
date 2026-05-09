use image::imageops::FilterType;
use std::fs;
use std::path::{Path, PathBuf};

/// Available thumbnail sizes.
#[derive(Debug, Clone, Copy)]
pub enum ThumbSize {
    /// 64px — track table rows, small lists
    Small,
    /// 200px — album grid cells
    Medium,
    /// 400px — detail panel, carousel flanking
    Large,
}

impl ThumbSize {
    pub fn pixels(self) -> u32 {
        match self {
            ThumbSize::Small => 64,
            ThumbSize::Medium => 200,
            ThumbSize::Large => 400,
        }
    }

    fn suffix(self) -> &'static str {
        match self {
            ThumbSize::Small => "s",
            ThumbSize::Medium => "m",
            ThumbSize::Large => "l",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "small" | "s" => Some(ThumbSize::Small),
            "medium" | "m" => Some(ThumbSize::Medium),
            "large" | "l" => Some(ThumbSize::Large),
            _ => None,
        }
    }
}

/// Compute the cache file path for a given source folder and size.
/// Uses md5 of the folder path to avoid filesystem issues with long or
/// special-character paths.
fn cache_path(cache_dir: &Path, folder_path: &str, size: ThumbSize) -> PathBuf {
    let hash = md5::compute(folder_path.as_bytes());
    cache_dir.join(format!("{:x}_{}.jpg", hash, size.suffix()))
}

/// Find the cover image in a folder. Checks common artwork filenames.
fn find_cover(folder: &Path) -> Option<PathBuf> {
    const COVER_NAMES: &[&str] = &[
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "folder.jpg",
        "folder.jpeg",
        "album.jpg",
        "album.jpeg",
        "front.jpg",
        "front.jpeg",
    ];
    for name in COVER_NAMES {
        let p = folder.join(name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Get or generate a cached thumbnail. Returns the path to the cached file,
/// or `None` if no cover image exists in the folder.
pub fn get_or_create(cache_dir: &Path, folder_path: &str, size: ThumbSize) -> Option<PathBuf> {
    let source = find_cover(Path::new(folder_path))?;
    let thumb_path = cache_path(cache_dir, folder_path, size);

    // Return cached thumbnail if it's newer than the source
    if thumb_path.exists() {
        let source_mtime = fs::metadata(&source).and_then(|m| m.modified()).ok();
        let thumb_mtime = fs::metadata(&thumb_path).and_then(|m| m.modified()).ok();

        if let (Some(src_t), Some(thumb_t)) = (source_mtime, thumb_mtime) {
            if thumb_t >= src_t {
                return Some(thumb_path);
            }
        }
    }

    // Generate the thumbnail
    let img = image::open(&source).ok()?;
    let px = size.pixels();
    let thumb = img.resize(px, px, FilterType::Lanczos3);

    fs::create_dir_all(cache_dir).ok()?;
    thumb.save(&thumb_path).ok()?;

    Some(thumb_path)
}

/// Delete cached thumbnails for a folder (all sizes).
pub fn invalidate(cache_dir: &Path, folder_path: &str) {
    for size in [ThumbSize::Small, ThumbSize::Medium, ThumbSize::Large] {
        let p = cache_path(cache_dir, folder_path, size);
        let _ = fs::remove_file(p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn create_test_image(dir: &Path) -> PathBuf {
        let img = image::RgbImage::new(800, 800);
        let path = dir.join("cover.jpg");
        img.save(&path).unwrap();
        path
    }

    #[test]
    fn generates_and_caches_thumbnail() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("album");
        fs::create_dir_all(&folder).unwrap();
        create_test_image(&folder);

        let cache_dir = tmp.path().join("cache");
        let folder_str = folder.to_string_lossy().to_string();

        let result = get_or_create(&cache_dir, &folder_str, ThumbSize::Small);
        assert!(result.is_some());
        let thumb_path = result.unwrap();
        assert!(thumb_path.exists());

        // Verify dimensions
        let img = image::open(&thumb_path).unwrap();
        assert!(img.width() <= 64);
        assert!(img.height() <= 64);
    }

    #[test]
    fn returns_cached_on_second_call() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("album");
        fs::create_dir_all(&folder).unwrap();
        create_test_image(&folder);

        let cache_dir = tmp.path().join("cache");
        let folder_str = folder.to_string_lossy().to_string();

        let first = get_or_create(&cache_dir, &folder_str, ThumbSize::Medium).unwrap();
        let first_mtime = fs::metadata(&first).unwrap().modified().unwrap();

        let second = get_or_create(&cache_dir, &folder_str, ThumbSize::Medium).unwrap();
        let second_mtime = fs::metadata(&second).unwrap().modified().unwrap();

        assert_eq!(first, second);
        assert_eq!(first_mtime, second_mtime);
    }

    #[test]
    fn invalidate_removes_all_sizes() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("album");
        fs::create_dir_all(&folder).unwrap();
        create_test_image(&folder);

        let cache_dir = tmp.path().join("cache");
        let folder_str = folder.to_string_lossy().to_string();

        get_or_create(&cache_dir, &folder_str, ThumbSize::Small);
        get_or_create(&cache_dir, &folder_str, ThumbSize::Medium);
        get_or_create(&cache_dir, &folder_str, ThumbSize::Large);

        invalidate(&cache_dir, &folder_str);

        for size in [ThumbSize::Small, ThumbSize::Medium, ThumbSize::Large] {
            assert!(!cache_path(&cache_dir, &folder_str, size).exists());
        }
    }

    #[test]
    fn regenerates_when_source_is_newer() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("album");
        fs::create_dir_all(&folder).unwrap();
        create_test_image(&folder);

        let cache_dir = tmp.path().join("cache");
        let folder_str = folder.to_string_lossy().to_string();

        let first = get_or_create(&cache_dir, &folder_str, ThumbSize::Small).unwrap();
        let first_mtime = fs::metadata(&first).unwrap().modified().unwrap();

        // Touch source to make it newer
        std::thread::sleep(std::time::Duration::from_millis(50));
        let cover = folder.join("cover.jpg");
        let mut f = fs::OpenOptions::new().write(true).open(&cover).unwrap();
        f.write_all(b" ").unwrap();
        drop(f);
        // Force mtime update
        let new_img = image::RgbImage::new(800, 800);
        new_img.save(&cover).unwrap();

        let second = get_or_create(&cache_dir, &folder_str, ThumbSize::Small).unwrap();
        let second_mtime = fs::metadata(&second).unwrap().modified().unwrap();

        assert!(second_mtime > first_mtime);
    }

    #[test]
    fn returns_none_for_missing_cover() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("empty_album");
        fs::create_dir_all(&folder).unwrap();

        let cache_dir = tmp.path().join("cache");
        let folder_str = folder.to_string_lossy().to_string();

        assert!(get_or_create(&cache_dir, &folder_str, ThumbSize::Small).is_none());
    }
}
