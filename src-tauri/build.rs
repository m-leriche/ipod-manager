use std::path::Path;

fn main() {
    build_swift_helper();
    tauri_build::build()
}

/// Compile the Swift disk helper and copy it to binaries/ for Tauri sidecar bundling.
fn build_swift_helper() {
    let swift_dir = Path::new("swift-helper");
    if !swift_dir.exists() {
        return;
    }

    // Recompile when Swift sources change
    println!("cargo:rerun-if-changed=swift-helper/Sources/main.swift");
    println!("cargo:rerun-if-changed=swift-helper/Package.swift");

    let status = std::process::Command::new("swift")
        .args(["build", "-c", "release", "--package-path", "swift-helper"])
        .status()
        .expect("Failed to run `swift build`. Is the Swift toolchain installed?");

    if !status.success() {
        panic!("Swift helper compilation failed");
    }

    let target = std::env::var("TARGET").unwrap_or_else(|_| "aarch64-apple-darwin".to_string());
    let bin_dir = Path::new("binaries");
    std::fs::create_dir_all(bin_dir).expect("Cannot create binaries/ directory");

    let src = swift_dir.join(".build/release/crate-disk-helper");
    let dst = bin_dir.join(format!("crate-disk-helper-{target}"));

    std::fs::copy(&src, &dst).unwrap_or_else(|e| {
        panic!(
            "Cannot copy Swift binary from {} to {}: {e}",
            src.display(),
            dst.display()
        )
    });
}
