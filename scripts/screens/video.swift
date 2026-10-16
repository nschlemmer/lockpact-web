// Trim + re-encode a Simulator screen recording to a small H.264 MP4, and export a poster frame.
//   swiftc -O scripts/screens/video.swift -o /tmp/lpvideo
//   /tmp/lpvideo <in.mp4> <out.mp4> <startSeconds> <durationSeconds> <poster.png> [widthPx=540] [bitrate=450000]
// AVFoundation only (no ffmpeg). The page budget is 2.5 MB: ~25 s at 540 px / 450 kbps is about 1.4 MB.
import AVFoundation
import AppKit
import Foundation

let a = CommandLine.arguments
guard a.count >= 6, let start = Double(a[3]), let dur = Double(a[4]) else {
    print("usage: lpvideo in out start duration poster.png [widthPx] [bitrate]"); exit(2)
}
let width = a.count > 6 ? Int(a[6]) ?? 540 : 540
let bitrate = a.count > 7 ? Int(a[7]) ?? 450_000 : 450_000
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let out = URL(fileURLWithPath: a[2]); try? FileManager.default.removeItem(at: out)

let sem = DispatchSemaphore(value: 0)
var keepAlive: [AnyObject] = []   // the reader and writer must outlive the Task's do-block
Task {
    do {
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { print("no video track"); exit(1) }
        let size = try await track.load(.naturalSize)
        let height = Int((Double(width) * Double(size.height) / Double(size.width)) / 2) * 2
        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), duration: CMTime(seconds: dur, preferredTimescale: 600))
        let rOut = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(rOut)
        let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
        let wIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate, AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel, AVVideoMaxKeyFrameIntervalKey: 60]])
        wIn.expectsMediaDataInRealTime = false
        writer.add(wIn); writer.shouldOptimizeForNetworkUse = true
        keepAlive = [reader, writer, wIn, rOut]
        reader.startReading(); writer.startWriting()
        writer.startSession(atSourceTime: .zero)
        let q = DispatchQueue(label: "enc")
        var first: CMTime?
        wIn.requestMediaDataWhenReady(on: q) {
            while wIn.isReadyForMoreMediaData {
                if let sb = rOut.copyNextSampleBuffer() {
                    let pts = CMSampleBufferGetPresentationTimeStamp(sb)
                    if first == nil { first = pts }
                    var timing = CMSampleTimingInfo(duration: CMSampleBufferGetDuration(sb), presentationTimeStamp: CMTimeSubtract(pts, first!), decodeTimeStamp: .invalid)
                    var shifted: CMSampleBuffer?
                    CMSampleBufferCreateCopyWithNewTiming(allocator: nil, sampleBuffer: sb, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleBufferOut: &shifted)
                    if let s = shifted { wIn.append(s) }
                } else {
                    wIn.markAsFinished(); writer.finishWriting { sem.signal() }; return
                }
            }
        }
    } catch { print("error: \(error)"); exit(1) }
}
sem.wait()
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: out)); gen.appliesPreferredTrackTransform = true
if let img = try? gen.copyCGImage(at: CMTime(seconds: 1, preferredTimescale: 600), actualTime: nil) {
    NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:]).map { try? $0.write(to: URL(fileURLWithPath: a[5])) }
}
let bytes = (try? FileManager.default.attributesOfItem(atPath: a[2])[.size] as? Int) ?? 0
print("wrote \(a[2]) \(bytes / 1024) KB")
