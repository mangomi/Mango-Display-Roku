' Natively scrolled widget content (calendar cells, lists).
'
' The render service captures the cell's content ONCE as a tall
' transparent strip and publishes where it sits and how far to move it.
' This component does the motion itself with a SceneGraph Animation -
' every refresh, sub-pixel - instead of stepping through a filmed sprite
' sheet (GifOverlay). One image per cell instead of hundreds of frames,
' and the pace is a number in the manifest, not a refilm.
' (See NATIVE_WIDGETS.md and MANIFEST.md "scroll".)
'
' config:
'   rect        { x, y, w, h }    the window, canvas px
'   segments    [ { file, h } ]   strip pieces top-to-bottom; each PNG is
'                                 kept <= 2048px tall for the GPU
'   stripW      strip width, canvas px
'   stripH      total strip height, canvas px
'   fromY, toY  strip translation at the start / end of a loop, canvas px
'   durationMs  one loop
'   loop        false to play once (default: repeat)

sub init()
    m.anim = invalid
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.rect = invalid or cfg.segments = invalid then return

    ' a re-config rebuilds from scratch - never stack a second strip
    if m.anim <> invalid
        m.anim.control = "stop"
        m.anim = invalid
    end if
    while m.top.getChildCount() > 0
        m.top.removeChildIndex(0)
    end while

    win = m.top.createChild("Group")
    win.translation = [cfg.rect.x, cfg.rect.y]
    win.clippingRect = [0, 0, cfg.rect.w, cfg.rect.h]

    strip = win.createChild("Group")
    strip.id = "mmScrollStrip"
    y = 0
    for each seg in cfg.segments
        p = strip.createChild("Poster")
        p.uri = m.top.assetBase + seg.file
        p.width = cfg.stripW
        p.height = seg.h
        p.translation = [0, y]
        p.observeField("loadStatus", "onSegLoad")
        y = y + seg.h
    end for

    fromY = 0
    toY = -cfg.stripH
    if cfg.fromY <> invalid then fromY = cfg.fromY
    if cfg.toY <> invalid then toY = cfg.toY
    strip.translation = [0, fromY]

    ms = 10000
    if cfg.durationMs <> invalid then ms = cfg.durationMs
    if ms < 100 then ms = 100
    rep = true
    if cfg.loop <> invalid and cfg.loop = false then rep = false

    anim = CreateObject("roSGNode", "Animation")
    anim.duration = ms / 1000.0
    anim.repeat = rep
    anim.easeFunction = "linear"
    interp = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    interp.key = [0.0, 1.0]
    interp.keyValue = [[0, fromY], [0, toY]]
    interp.fieldToInterp = "mmScrollStrip.translation"
    anim.appendChild(interp)
    m.top.appendChild(anim)
    m.anim = anim

    ' Start NOW, not on loadStatus: a texture Roku already has cached can be
    ' ready before the observer exists and then never fires (GifOverlay
    ' learned this the hard way). Moving an empty poster is harmless.
    anim.control = "start"
end sub

sub onSegLoad()
    strip = m.top.findNode("mmScrollStrip")
    if strip = invalid then return
    for i = 0 to strip.getChildCount() - 1
        p = strip.getChild(i)
        if p.loadStatus = "failed" then print "[Mango] scroll strip failed: "; p.uri
    end for
end sub
