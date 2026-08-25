' One confetti burst, played once and gone: the portal's task-check
' celebration, filmed into a sprite sheet at build time
' (tools/generate-celebrations.js) because real-time particle physics is
' exactly what the Express cannot do. The parent observes `done` and
' removes the node.
'
' Clipping lesson (Santa): Roku clips a node AFTER its transform, so the
' scaling happens on the Poster's own width/height (Poster resamples the
' bitmap) - never by scaling the clipping group.

sub init()
    m.frame = 0
    m.tick = m.top.findNode("frameTick")
    m.tick.observeField("fire", "onFrame")
    m.delay = m.top.findNode("delayTimer")
    m.delay.observeField("fire", "onDelayDone")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid then return
    meta = celebrationBurstMeta()
    m.meta = meta
    size = 380
    if cfg.size <> invalid then size = Int(cfg.size)
    m.size = size

    m.clip = m.top.createChild("Group")
    m.clip.translation = [Int(cfg.x) - size \ 2, Int(cfg.y) - size \ 2]
    m.clip.clippingRect = [0, 0, size, size]
    m.sheet = m.clip.createChild("Poster")
    m.sheet.uri = meta.uri
    ' scale the whole sheet so one frame fills `size`
    m.sheet.width = meta.cols * size
    m.sheet.height = meta.rows * size
    m.sheet.translation = [0, 0]

    m.tick.duration = meta.frameMs / 1000.0
    delayMs = 0
    if cfg.delayMs <> invalid then delayMs = Int(cfg.delayMs)
    if delayMs > 0
        m.clip.visible = false
        m.delay.duration = delayMs / 1000.0
        m.delay.control = "start"
    else
        m.tick.control = "start"
    end if
end sub

sub onDelayDone()
    m.clip.visible = true
    m.tick.control = "start"
end sub

sub onFrame()
    m.frame = m.frame + 1
    if m.frame >= m.meta.frameCount
        m.tick.control = "stop"
        m.clip.visible = false
        m.top.done = true
        return
    end if
    col = m.frame mod m.meta.cols
    row = m.frame \ m.meta.cols
    m.sheet.translation = [-col * m.size, -row * m.size]
end sub
