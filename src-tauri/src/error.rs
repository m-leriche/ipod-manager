use serde::Serialize;

/// Structured application error type. Replaces raw `String` error propagation
/// throughout the codebase, giving type-safe error variants while remaining
/// backwards-compatible with existing `format!(...)` error chains via `From<String>`.
///
/// Serialized as a plain string for Tauri command compatibility — the frontend
/// receives the same string errors it always has.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Database(#[from] rusqlite::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    AudioTag(String),

    #[error("{0}")]
    Http(String),

    #[error("{0}")]
    ExternalCommand(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    InvalidInput(String),

    #[error("Cancelled")]
    Cancelled,

    /// Catch-all for existing `String` errors during migration.
    /// New code should prefer a specific variant.
    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Bridge: lets `?` convert any existing `String` error into `AppError::Generic`.
impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Generic(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Generic(s.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        AppError::Generic(e.to_string())
    }
}

impl From<lofty::error::LoftyError> for AppError {
    fn from(e: lofty::error::LoftyError) -> Self {
        AppError::AudioTag(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_converts() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("file missing"));
    }

    #[test]
    fn string_converts_to_generic() {
        let app_err: AppError = "something broke".to_string().into();
        assert_eq!(app_err.to_string(), "something broke");
    }

    #[test]
    fn serializes_as_string() {
        let err = AppError::NotFound("missing.txt".into());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"missing.txt\"");
    }

    #[test]
    fn cancelled_display() {
        assert_eq!(AppError::Cancelled.to_string(), "Cancelled");
    }
}
