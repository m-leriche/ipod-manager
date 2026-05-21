use std::path;

/// Validate that an output directory path is safe (absolute, no traversal components).
pub fn validate_output_dir(output_dir: &str) -> Result<(), String> {
    let p = path::Path::new(output_dir);
    if !p.is_absolute() {
        return Err(format!("Output directory must be absolute: {}", output_dir));
    }
    for component in p.components() {
        if let path::Component::ParentDir = component {
            return Err(format!(
                "Output directory must not contain '..': {}",
                output_dir
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_path() {
        assert!(validate_output_dir("relative/path").is_err());
        assert!(validate_output_dir("../escape").is_err());
    }

    #[test]
    fn rejects_traversal() {
        assert!(validate_output_dir("/safe/../../etc").is_err());
        assert!(validate_output_dir("/tmp/../../../etc").is_err());
    }

    #[test]
    fn accepts_clean_absolute_path() {
        assert!(validate_output_dir("/Users/test/output").is_ok());
        assert!(validate_output_dir("/tmp").is_ok());
    }
}
