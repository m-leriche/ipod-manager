// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "crate-disk-helper",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "crate-disk-helper",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("DiskArbitration"),
            ]
        ),
    ]
)
