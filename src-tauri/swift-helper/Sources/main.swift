// crate-disk-helper
// macOS disk helper using DiskArbitration.framework.
// Uses diskutil plist output for disk enumeration (DA has no "list all external disks" API),
// then reads disk properties and performs mount/unmount via DiskArbitration.
//
// Commands:
//   detect        — JSON array of external FAT32 disk candidates
//   mount ID      — mount disk at /Volumes/IPOD (no sudo needed)
//   unmount [path] — unmount volume (defaults to /Volumes/IPOD)

import DiskArbitration
import Foundation

// MARK: - Types

struct DiskCandidate: Encodable {
    let identifier: String
    let size: String
    let name: String
    let mounted: Bool
    let mountPoint: String?
    let freeSpace: UInt64?
    let usedSpace: UInt64?
    let totalSpace: UInt64?
    let mediaName: String?
}

// MARK: - Detect

func detectDisks() -> [DiskCandidate] {
    let partitionIds = findExternalFAT32Partitions()
    if partitionIds.isEmpty { return [] }

    guard let session = DASessionCreate(kCFAllocatorDefault) else { return [] }

    var candidates: [DiskCandidate] = []

    for id in partitionIds {
        guard let disk = DADiskCreateFromBSDName(kCFAllocatorDefault, session, id),
              let desc = DADiskCopyDescription(disk) as NSDictionary?
        else {
            continue
        }

        let volumeName = desc[kDADiskDescriptionVolumeNameKey] as? String ?? ""
        let mediaSize = (desc[kDADiskDescriptionMediaSizeKey] as? NSNumber)?.uint64Value ?? 0
        let mountURL = desc[kDADiskDescriptionVolumePathKey] as? URL
        let mountPoint = mountURL?.path

        let parentMediaName = getParentMediaName(identifier: id, session: session)

        var freeSpace: UInt64?
        var usedSpace: UInt64?
        var totalSpace: UInt64?

        if let mp = mountPoint {
            let space = getSpaceInfo(path: mp)
            totalSpace = space.total
            freeSpace = space.free
            usedSpace = space.used
        }

        candidates.append(DiskCandidate(
            identifier: id,
            size: formatBytes(mediaSize),
            name: volumeName,
            mounted: mountPoint != nil,
            mountPoint: mountPoint,
            freeSpace: freeSpace,
            usedSpace: usedSpace,
            totalSpace: totalSpace,
            mediaName: parentMediaName
        ))
    }

    return candidates
}

/// Parse `diskutil list -plist external physical` to find FAT32 partition identifiers.
func findExternalFAT32Partitions() -> [String] {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/diskutil")
    process.arguments = ["list", "-plist", "external", "physical"]
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice

    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        return []
    }

    guard process.terminationStatus == 0 else { return [] }

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    guard
        let plist = try? PropertyListSerialization.propertyList(from: data, format: nil)
            as? [String: Any],
        let allDisks = plist["AllDisksAndPartitions"] as? [[String: Any]]
    else {
        return []
    }

    var identifiers: [String] = []

    for disk in allDisks {
        guard let partitions = disk["Partitions"] as? [[String: Any]] else { continue }
        for partition in partitions {
            guard let content = partition["Content"] as? String,
                  content == "DOS_FAT_32" || content == "Windows_FAT_32",
                  let id = partition["DeviceIdentifier"] as? String
            else {
                continue
            }
            identifiers.append(id)
        }
    }

    return identifiers
}

/// Get the parent (whole) disk's media name via DiskArbitration.
/// e.g., for "disk5s2" checks "disk5" — returns names like "iPod Classic".
func getParentMediaName(identifier: String, session: DASession) -> String? {
    guard let parentId = parentDiskId(identifier) else { return nil }

    guard let parentDisk = DADiskCreateFromBSDName(kCFAllocatorDefault, session, parentId),
          let desc = DADiskCopyDescription(parentDisk) as NSDictionary?
    else {
        return nil
    }

    return desc[kDADiskDescriptionMediaNameKey] as? String
}

/// Extract parent disk identifier: "disk5s2" -> "disk5".
func parentDiskId(_ identifier: String) -> String? {
    // Find the last "s" followed only by digits (the partition separator).
    // "disk5s2"  -> lastS at index 5, remainder "2" (all digits) -> parent "disk5"
    // "disk12s3" -> parent "disk12"
    guard let lastS = identifier.lastIndex(of: "s"),
          lastS > identifier.startIndex,
          identifier[identifier.index(after: lastS)...].allSatisfy(\.isNumber),
          !identifier[identifier.index(after: lastS)...].isEmpty
    else {
        return nil
    }
    return String(identifier[..<lastS])
}

/// Get disk space via FileManager.
func getSpaceInfo(path: String) -> (total: UInt64?, free: UInt64?, used: UInt64?) {
    guard let attrs = try? FileManager.default.attributesOfFileSystem(forPath: path) else {
        return (nil, nil, nil)
    }
    let total = (attrs[.systemSize] as? NSNumber)?.uint64Value
    let free = (attrs[.systemFreeSize] as? NSNumber)?.uint64Value
    let used: UInt64?
    if let t = total, let f = free {
        used = t - f
    } else {
        used = nil
    }
    return (total, free, used)
}

func formatBytes(_ bytes: UInt64) -> String {
    let gb = Double(bytes) / 1_000_000_000
    if gb >= 1000 {
        return String(format: "%.1f TB", gb / 1000)
    } else if gb >= 1 {
        return String(format: "%.1f GB", gb)
    } else {
        return String(format: "%.1f MB", Double(bytes) / 1_000_000)
    }
}

// MARK: - Mount / Unmount via DiskArbitration

/// Map common DAReturn status codes to human-readable messages.
/// DAReturn is Int32; DA error codes use the high bits, so we compare as UInt32.
func describeDAStatus(_ status: DAReturn) -> String {
    let code = UInt32(bitPattern: status)
    switch code {
    case 0xF8DA_0001: return "not permitted"
    case 0xF8DA_0002: return "device is busy"
    case 0xF8DA_0003: return "bad argument"
    case 0xF8DA_0004: return "device is locked"
    case 0xF8DA_0005: return "already mounted"
    case 0xF8DA_0006: return "not found"
    case 0xF8DA_0007: return "not mounted"
    case 0xF8DA_0008: return "not permitted (operation denied)"
    case 0xF8DA_000C: return "unsupported filesystem"
    default: return "error code \(String(format: "0x%08X", code))"
    }
}

// File-level globals for C-compatible DA callbacks (cannot capture local state).
// Note: safe only because this is a single-threaded CLI — callbacks fire on the
// main run loop thread. Not safe for concurrent use.
private var gCallbackError: String?
private var gCallbackDone = false

private let onMountComplete: DADiskMountCallback = { _, dissenter, _ in
    if let dissenter = dissenter {
        let status = DADissenterGetStatus(dissenter)
        gCallbackError = "Mount failed: \(describeDAStatus(status))"
    }
    gCallbackDone = true
    CFRunLoopStop(CFRunLoopGetMain())
}

private let onUnmountComplete: DADiskUnmountCallback = { _, dissenter, _ in
    if let dissenter = dissenter {
        let status = DADissenterGetStatus(dissenter)
        gCallbackError = "Unmount failed: \(describeDAStatus(status))"
    }
    gCallbackDone = true
    CFRunLoopStop(CFRunLoopGetMain())
}

/// Wait for a DA callback to fire, with a timeout.
private func waitForCallback(timeoutSeconds: Double) {
    let deadline = Date().addingTimeInterval(timeoutSeconds)
    while !gCallbackDone, Date() < deadline {
        CFRunLoopRunInMode(.defaultMode, 0.1, true)
    }
}

func mountDisk(identifier: String) -> String? {
    guard let session = DASessionCreate(kCFAllocatorDefault) else {
        return "Cannot create DiskArbitration session"
    }
    DASessionScheduleWithRunLoop(session, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    defer {
        DASessionUnscheduleFromRunLoop(
            session, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    }

    guard let disk = DADiskCreateFromBSDName(kCFAllocatorDefault, session, identifier) else {
        return "Cannot find disk \(identifier)"
    }

    // Step 1: Unmount from any current mount point (best-effort, ignore errors).
    gCallbackDone = false
    gCallbackError = nil
    DADiskUnmount(disk, DADiskUnmountOptions(kDADiskUnmountOptionDefault), onUnmountComplete, nil)
    waitForCallback(timeoutSeconds: 5)

    // Step 2: Mount at /Volumes/IPOD.
    gCallbackDone = false
    gCallbackError = nil
    let mountURL = URL(fileURLWithPath: "/Volumes/IPOD") as CFURL
    DADiskMount(
        disk, mountURL, DADiskMountOptions(kDADiskMountOptionDefault), onMountComplete, nil)
    waitForCallback(timeoutSeconds: 15)

    if !gCallbackDone {
        return "Mount timed out"
    }
    return gCallbackError
}

func unmountDisk(volumePath: String = "/Volumes/IPOD") -> String? {
    guard FileManager.default.fileExists(atPath: volumePath) else {
        return "Nothing mounted at \(volumePath)"
    }

    guard let session = DASessionCreate(kCFAllocatorDefault) else {
        return "Cannot create DiskArbitration session"
    }
    DASessionScheduleWithRunLoop(session, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    defer {
        DASessionUnscheduleFromRunLoop(
            session, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    }

    let volumeURL = URL(fileURLWithPath: volumePath) as CFURL
    guard let disk = DADiskCreateFromVolumePath(kCFAllocatorDefault, session, volumeURL) else {
        return "No disk found at \(volumePath)"
    }

    gCallbackDone = false
    gCallbackError = nil
    DADiskUnmount(disk, DADiskUnmountOptions(kDADiskUnmountOptionDefault), onUnmountComplete, nil)
    waitForCallback(timeoutSeconds: 15)

    if !gCallbackDone {
        return "Unmount timed out"
    }
    return gCallbackError
}

// MARK: - Entry Point

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: crate-disk-helper <detect|mount|unmount>\n", stderr)
    exit(1)
}

let encoder = JSONEncoder()
encoder.keyEncodingStrategy = .convertToSnakeCase

switch args[1] {
case "detect":
    let candidates = detectDisks()
    if let json = try? encoder.encode(candidates),
       let str = String(data: json, encoding: .utf8)
    {
        print(str)
    } else {
        print("[]")
    }

case "mount":
    guard args.count >= 3 else {
        fputs("Usage: crate-disk-helper mount <identifier>\n", stderr)
        exit(1)
    }
    if let error = mountDisk(identifier: args[2]) {
        fputs(error + "\n", stderr)
        exit(1)
    }

case "unmount":
    let volumePath = args.count >= 3 ? args[2] : "/Volumes/IPOD"
    if let error = unmountDisk(volumePath: volumePath) {
        fputs(error + "\n", stderr)
        exit(1)
    }

default:
    fputs("Unknown command: \(args[1])\n", stderr)
    exit(1)
}
