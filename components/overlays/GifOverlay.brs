' Animated GIF/sticker widget: the render service decodes the GIF into a
' vertical PNG film strip (alpha preserved); this component shows one
' frame through a clipped window and steps the strip on a timer.
' Any number can animate at once - no Video node involved.
' (See NATIVE_WIDGETS.md.)

sub init()
    m.strip = invalid
    m.frame = 0
    m.frameCount = 1
    m.frameH = 0
    m.tick = m.top.findNode("frameTick")
    m.tick.observeField("fire", "onFrame")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.stripFile = invalid then return
    m.frameCount = Int(cfg.frameCount)
    m.frameH = Int(cfg.frameH)

    win = m.top.createChild("Group")
    win.translation = [cfg.rect.x, cfg.rect.y]
    win.clippingRect = [0, 0, Int(cfg.frameW), m.frameH]

    m.strip = win.createChild("Poster")
    m.strip.uri = m.top.assetBase + cfg.stripFile
    m.strip.width = Int(cfg.frameW)
    m.strip.height = m.frameH * m.frameCount
    m.strip.observeField("loadStatus", "onStripLoad")

    ms = 100
    if cfg.frameMs <> invalid then ms = Int(cfg.frameMs)
    if ms < 33 then ms = 33 ' cap at ~30fps
    m.tick.duration = ms / 1000.0
end sub

sub onStripLoad()
    if m.strip.loadStatus = "ready" and m.frameCount > 1
        m.tick.control = "start"
    else if m.strip.loadStatus = "failed"
        print "[Mango] gif strip failed: "; m.strip.uri
    end if
end sub

sub onFrame()
    m.frame = (m.frame + 1) mod m.frameCount
    m.strip.translation = [0, -m.frame * m.frameH]
end sub
