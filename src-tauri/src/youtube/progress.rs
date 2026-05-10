use super::DownloadProgress;

pub(super) fn parse_progress_line(line: &str) -> Option<DownloadProgress> {
    // Lines look like: [download]  45.2% of  5.23MiB at  2.34MiB/s ETA 00:02
    // or: [download] 100% of 5.23MiB in 00:02
    if !line.contains("[download]") || !line.contains('%') {
        return None;
    }

    let after_tag = line.split("[download]").nth(1)?.trim();
    let tokens: Vec<&str> = after_tag.split_whitespace().collect();

    if tokens.is_empty() {
        return None;
    }

    let percent_str = tokens[0].trim_end_matches('%');
    let percent: f64 = percent_str.parse().ok()?;

    let mut speed = None;
    let mut eta = None;

    for (i, token) in tokens.iter().enumerate() {
        if *token == "at" {
            speed = tokens.get(i + 1).map(|s| s.to_string());
        }
        if *token == "ETA" {
            eta = tokens.get(i + 1).map(|s| s.to_string());
        }
    }

    Some(DownloadProgress {
        phase: "downloading".to_string(),
        percent,
        speed,
        eta,
        title: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress_typical() {
        let line = "[download]  45.2% of  5.23MiB at  2.34MiB/s ETA 00:02";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 45.2).abs() < 0.01);
        assert_eq!(p.speed.as_deref(), Some("2.34MiB/s"));
        assert_eq!(p.eta.as_deref(), Some("00:02"));
        assert_eq!(p.phase, "downloading");
    }

    #[test]
    fn parse_progress_100() {
        let line = "[download] 100% of 5.23MiB in 00:02";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 100.0).abs() < 0.01);
    }

    #[test]
    fn parse_non_progress_line() {
        assert!(parse_progress_line("[info] Extracting URL").is_none());
        assert!(parse_progress_line("[ExtractAudio] Destination: /foo.flac").is_none());
        assert!(parse_progress_line("").is_none());
    }
}
