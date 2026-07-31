' Photo slideshow widget: steps through the manifest's image URL list on
' the widget's own interval, with the widget's configured transition
' (fade / slides / flip - same set as pages), clipped to the widget rect.
' A/B Posters preload the next photo; loadWidth caps decode at display
' size; failed loads skip ahead. (See NATIVE_WIDGETS.md.)

sub init()
    m.posterA = invalid
    m.posterB = invalid
    m.frontIsA = false
    m.index = 0
    m.images = []
    m.transition = "fade"
    m.rectW = 0
    m.rectH = 0
    m.pendingSwap = false
    m.anim = invalid
    m.timer = m.top.findNode("slideTimer")
    m.timer.observeField("fire", "onSlideTimer")
    m.top.observeField("config", "onConfig")
end sub

function makePoster(cfg as object, suffix as string) as object
    p = m.clip.createChild("Poster")
    ' JSON numbers parse as floats - Int() before ToStr()
    p.id = "ss" + Int(cfg.widgetSettingId).ToStr() + "_" + Int(cfg.page).ToStr() + suffix
    p.translation = [0, 0]
    p.width = cfg.rect.w
    p.height = cfg.rect.h
    p.loadWidth = Int(cfg.rect.w)
    p.loadHeight = Int(cfg.rect.h)
    if cfg.cropToFill = true
        p.loadDisplayMode = "scaleToZoom"
    else
        p.loadDisplayMode = "scaleToFit"
    end if
    p.visible = false
    p.observeField("loadStatus", "onPosterLoad")
    return p
end function

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.images = invalid or cfg.images.Count() < 2 then return
    m.images = cfg.images
    m.rectW = cfg.rect.w
    m.rectH = cfg.rect.h
    if cfg.transition <> invalid and cfg.transition <> "" then m.transition = cfg.transition

    ' slides/flips stay inside the widget box
    m.clip = m.top.createChild("Group")
    m.clip.translation = [cfg.rect.x, cfg.rect.y]
    m.clip.clippingRect = [0, 0, m.rectW, m.rectH]
    m.posterA = makePoster(cfg, "A")
    m.posterB = makePoster(cfg, "B")

    d = 60
    if cfg.intervalSeconds <> invalid then d = Int(cfg.intervalSeconds)
    if d < 3 then d = 3
    m.timer.duration = d
    m.timer.control = "start"

    ' resume where this widget left off last time its page was showing
    ' (MainScene injects startIndex); advance one so re-entry feels fresh
    m.index = 0
    if cfg.startIndex <> invalid
        m.index = (Int(cfg.startIndex) + 1) mod m.images.Count()
    end if
    m.top.lastIndex = m.index
    print "[Mango] slideshow starting at photo "; m.index
    m.pendingSwap = true
    backPoster().uri = m.images[m.index]
end sub

function backPoster() as object
    if m.frontIsA then return m.posterB
    return m.posterA
end function

function frontPoster() as object
    if m.frontIsA then return m.posterA
    return m.posterB
end function

sub onSlideTimer()
    if m.pendingSwap or m.images.Count() < 2 then return
    m.index = (m.index + 1) mod m.images.Count()
    m.top.lastIndex = m.index
    m.pendingSwap = true
    backPoster().uri = m.images[m.index]
end sub

sub onPosterLoad(ev as object)
    node = ev.getRoSGNode()
    if not m.pendingSwap then return
    back = backPoster()
    if node.id <> back.id then return
    status = node.loadStatus
    if status = "failed"
        print "[Mango] slideshow image failed, skipping: "; node.uri
        m.pendingSwap = false
        ' advance past the broken URL on the next tick
        m.index = (m.index + 1) mod m.images.Count()
        m.top.lastIndex = m.index
        return
    end if
    if status <> "ready" then return
    startSwap(back)
end sub

sub resetPoster(p as object)
    p.translation = [0, 0]
    p.scale = [1.0, 1.0]
    p.opacity = 1.0
    p.scaleRotateCenter = [m.rectW / 2, m.rectH / 2]
end sub

sub addVecI(anim as object, field as string, keyValue as object)
    i = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    i.key = [0.0, 1.0]
    i.keyValue = keyValue
    i.fieldToInterp = field
    anim.appendChild(i)
end sub

sub addFloatI(anim as object, field as string, keyValue as object)
    i = CreateObject("roSGNode", "FloatFieldInterpolator")
    i.key = [0.0, 1.0]
    i.keyValue = keyValue
    i.fieldToInterp = field
    anim.appendChild(i)
end sub

' same semantics as page transitions, scoped inside the clipped rect;
' the very first reveal always fades (nothing meaningful to slide from)
function buildSwapAnim(name as string, back as object, firstReveal as boolean) as object
    d = 3.0
    bid = back.id
    resetPoster(back)
    if firstReveal then name = "fade"

    if name = "flip"
        back.scale = [0.0001, 1.0]
        seq = CreateObject("roSGNode", "SequentialAnimation")
        a1 = CreateObject("roSGNode", "Animation")
        a1.duration = d / 2
        a1.easeFunction = "inQuad"
        addVecI(a1, frontPoster().id + ".scale", [[1.0, 1.0], [0.0001, 1.0]])
        a2 = CreateObject("roSGNode", "Animation")
        a2.duration = d / 2
        a2.easeFunction = "outQuad"
        addVecI(a2, bid + ".scale", [[0.0001, 1.0], [1.0, 1.0]])
        seq.appendChild(a1)
        seq.appendChild(a2)
        return seq
    end if

    a = CreateObject("roSGNode", "Animation")
    a.duration = d
    a.easeFunction = "inOutCubic"
    if name = "slideleft"
        back.translation = [m.rectW, 0]
        addVecI(a, bid + ".translation", [[m.rectW, 0], [0, 0]])
    else if name = "slideright"
        back.translation = [-m.rectW, 0]
        addVecI(a, bid + ".translation", [[-m.rectW, 0], [0, 0]])
    else if name = "slideup"
        back.translation = [0, m.rectH]
        addVecI(a, bid + ".translation", [[0, m.rectH], [0, 0]])
    else if name = "slidedown"
        back.translation = [0, -m.rectH]
        addVecI(a, bid + ".translation", [[0, -m.rectH], [0, 0]])
    else ' fade + unknown names
        back.opacity = 0.0
        addFloatI(a, bid + ".opacity", [0.0, 1.0])
    end if
    return a
end function

sub startSwap(back as object)
    if m.anim <> invalid
        m.anim.control = "stop"
        m.top.removeChild(m.anim)
        m.anim = invalid
    end if
    firstReveal = not frontPoster().visible
    anim = buildSwapAnim(m.transition, back, firstReveal)
    back.visible = true
    m.top.appendChild(anim)
    m.anim = anim
    anim.observeField("state", "onAnimState")
    anim.control = "start"
end sub

sub onAnimState()
    if m.anim = invalid then return
    if m.anim.state <> "stopped" then return
    m.anim.control = "stop"
    m.top.removeChild(m.anim)
    m.anim = invalid
    old = frontPoster()
    m.frontIsA = not m.frontIsA
    old.visible = false
    resetPoster(old)
    resetPoster(frontPoster())
    m.pendingSwap = false
end sub
