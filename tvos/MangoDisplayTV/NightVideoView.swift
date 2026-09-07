// Night mode's backdrop: the shared black clip (media/silent_loop.mp4,
// the same file the Roku loops for keep-alive) played full screen and
// muted under the transparent night page. A VIDEO rather than a black
// picture because TVs dim their backlight for video (Dave, 2026-09-03;
// Roku 456ec95 applyNight). tvOS needs no keep-alive player, so this
// only exists while `night` is true.

import AVFoundation
import SwiftUI

struct NightVideoView: UIViewRepresentable {
    func makeUIView(context: Context) -> NightVideoUIView { NightVideoUIView() }
    func updateUIView(_ uiView: NightVideoUIView, context: Context) {}
}

final class NightVideoUIView: UIView {
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?

    override class var layerClass: AnyClass { AVPlayerLayer.self }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("media/silent_loop.mp4"),
              FileManager.default.fileExists(atPath: url.path) else {
            NSLog("[Mango] night clip missing from bundle")
            return
        }
        let item = AVPlayerItem(url: url)
        let queue = AVQueuePlayer()
        queue.isMuted = true
        queue.preventsDisplaySleepDuringVideoPlayback = true
        looper = AVPlayerLooper(player: queue, templateItem: item)
        player = queue
        let layer = self.layer as! AVPlayerLayer
        layer.player = queue
        layer.videoGravity = .resize
        queue.play()
        NSLog("[Mango] night mode on")
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        player?.pause()
        NSLog("[Mango] night mode off")
    }
}
