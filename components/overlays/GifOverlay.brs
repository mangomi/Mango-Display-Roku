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
    m.frameW = Int(cfg.frameW)
    m.frameH = Int(cfg.frameH)
    ' frames live in a cols x rows sprite grid (single sheet capped at
    ' 2048px per side - GPUs reject taller single-column strips)
    m.cols = 1
    if cfg.cols <> invalid then m.cols = Int(cfg.cols)
    rows = Int((m.frameCount + m.cols - 1) / m.cols)
    if cfg.rows <> invalid then rows = Int(cfg.rows)

    win = m.top.createChild("Group")
    win.translation = [cfg.rect.x, cfg.rect.y]
    win.clippingRect = [0, 0, m.frameW, m.frameH]

    m.strip = win.createChild("Poster")
    m.strip.uri = m.top.assetBase + cfg.stripFile
    m.strip.width = m.cols * m.frameW
    m.strip.height = rows * m.frameH
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
    col = m.frame mod m.cols
    row = (m.frame - col) / m.cols
    m.strip.translation = [-col * m.frameW, -row * m.frameH]
end sub
