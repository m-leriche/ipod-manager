//! Minimal XML builder for Subsonic API responses.
//!
//! Subsonic responses always wrap content in:
//! ```xml
//! <?xml version="1.0" encoding="UTF-8"?>
//! <subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1">
//!   ...
//! </subsonic-response>
//! ```

const API_VERSION: &str = "1.16.1";

/// Escape special characters for XML attribute values and text content.
pub fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Build a successful `<subsonic-response>` wrapping the given inner XML.
pub fn ok_response(inner: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <subsonic-response xmlns=\"http://subsonic.org/restapi\" status=\"ok\" version=\"{API_VERSION}\">\
         {inner}\
         </subsonic-response>"
    )
}

/// Build a failed `<subsonic-response>` with an error element.
pub fn error_response(code: u32, message: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <subsonic-response xmlns=\"http://subsonic.org/restapi\" status=\"failed\" version=\"{API_VERSION}\">\
         <error code=\"{code}\" message=\"{}\"/>\
         </subsonic-response>",
        escape(message)
    )
}

/// Build an XML attribute string: ` key="escaped_value"`.
/// Returns empty string if value is None.
pub fn attr(key: &str, value: &str) -> String {
    format!(" {key}=\"{}\"", escape(value))
}

/// Build an optional XML attribute. Returns empty string if None.
pub fn opt_attr<T: std::fmt::Display>(key: &str, value: &Option<T>) -> String {
    match value {
        Some(v) => format!(" {key}=\"{}\"", escape(&v.to_string())),
        None => String::new(),
    }
}

/// Subsonic error codes.
pub mod error_codes {
    /// A required parameter is missing.
    pub const MISSING_PARAMETER: u32 = 10;
    /// Wrong username or password.
    pub const AUTH_FAILED: u32 = 40;
    /// User not authorized for the given operation.
    #[allow(dead_code)]
    pub const NOT_AUTHORIZED: u32 = 50;
    /// The requested data was not found.
    pub const NOT_FOUND: u32 = 70;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_special_chars() {
        assert_eq!(escape("A & B"), "A &amp; B");
        assert_eq!(escape("<tag>"), "&lt;tag&gt;");
        assert_eq!(escape(r#"say "hi""#), "say &quot;hi&quot;");
        assert_eq!(escape("it's"), "it&apos;s");
    }

    #[test]
    fn ok_response_format() {
        let xml = ok_response("<ping/>");
        assert!(xml.contains("status=\"ok\""));
        assert!(xml.contains("<ping/>"));
        assert!(xml.contains("version=\"1.16.1\""));
    }

    #[test]
    fn error_response_format() {
        let xml = error_response(40, "Wrong password");
        assert!(xml.contains("status=\"failed\""));
        assert!(xml.contains("code=\"40\""));
        assert!(xml.contains("message=\"Wrong password\""));
    }

    #[test]
    fn error_response_escapes_message() {
        let xml = error_response(10, "bad <input>");
        assert!(xml.contains("message=\"bad &lt;input&gt;\""));
    }

    #[test]
    fn attr_escapes_value() {
        assert_eq!(attr("name", "A & B"), " name=\"A &amp; B\"");
    }

    #[test]
    fn opt_attr_none_returns_empty() {
        assert_eq!(opt_attr::<String>("year", &None), "");
    }

    #[test]
    fn opt_attr_some_returns_attr() {
        assert_eq!(opt_attr("year", &Some(2020)), " year=\"2020\"");
    }
}
