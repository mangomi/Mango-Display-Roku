' Remote interaction: a pointer the user steers with the D-pad, plus the
' task checkboxes drawn natively (the render hides the real ones).
'
' Pressing OK sends the gesture to the render service, which replays it
' into a live portal session - the portal runs its own handler, exactly
' as on a touch TV, and the updated screen comes back as a new render.
' The tick is drawn immediately so the press feels instant while that
' round trip happens.

sub init()
    m.boxes = m.top.findNode("boxes")
    m.pointer = m.top.findNode("pointer")
    m.hideTimer = m.top.findNode("hideTimer")
    m.hideTimer.observeField("fire", "onIdle")
    m.px = 960
    m.py = 540
    m.active = false
    m.items = []
    m.warmSent = false
    m.top.observeField("targets", "onTargets")
    m.top.observeField("keyPress", "onKey")
end sub

' ---- checkboxes ---------------------------------------------------------

sub onTargets()
    while m.boxes.getChildCount() > 0
        m.boxes.removeChildIndex(0)
    end while
    m.items = []
    t = m.top.targets
    if t = invalid or t.items = invalid then return
    sprites = t.sprites
    if sprites = invalid then return

    for each it in t.items
        p = m.boxes.createChild("Poster")
        p.translation = [it.rect.x, it.rect.y]
        p.width = it.rect.w
        p.height = it.rect.h
        p.uri = m.top.assetBase + spriteFor(sprites, it.checked = true)
        m.items.Push({ node: p, rect: it.rect, checked: it.checked = true, sprites: sprites })
    end for
end sub

function spriteFor(sprites as object, checked as boolean) as string
    if checked then return sprites.checked
    return sprites.empty
end function

' ---- pointer ------------------------------------------------------------

sub showPointer()
    m.active = true
    m.pointer.visible = true
    m.hideTimer.control = "start"
    ' warm the portal session while the user is still aiming
    if not m.warmSent
        m.warmSent = true
        sendAction("warm", 0, 0)
    end if
end sub

sub onIdle()
    m.active = false
    m.pointer.visible = false
    m.warmSent = false
end sub

sub placePointer()
    m.pointer.translation = [m.px - 48, m.py - 48]
end sub

sub onKey()
    key = m.top.keyPress
    if key = "" then return
    m.top.keyPress = ""
    if m.top.targets = invalid or m.items.Count() = 0 then return

    if not m.active
        ' first press only reveals the pointer, so nothing fires by accident
        snapToNearestTarget()
        placePointer()
        showPointer()
        return
    end if
    m.hideTimer.control = "start"

    stepPx = 42
    if key = "up"
        m.py = m.py - stepPx
    else if key = "down"
        m.py = m.py + stepPx
    else if key = "left"
        m.px = m.px - stepPx
    else if key = "right"
        m.px = m.px + stepPx
    else if key = "OK"
        activateUnderPointer()
        return
    end if
    if m.px < 20 then m.px = 20
    if m.px > 1900 then m.px = 1900
    if m.py < 20 then m.py = 20
    if m.py > 1060 then m.py = 1060
    placePointer()
end sub

' first reveal drops the pointer on the closest actionable thing rather
' than wherever it happened to be left
sub snapToNearestTarget()
    best = invalid
    bestD = 1e12
    for each it in m.items
        cx = it.rect.x + it.rect.w / 2
        cy = it.rect.y + it.rect.h / 2
        d = (cx - m.px) * (cx - m.px) + (cy - m.py) * (cy - m.py)
        if d < bestD
            bestD = d
            best = it
        end if
    end for
    if best <> invalid
        m.px = best.rect.x + best.rect.w / 2
        m.py = best.rect.y + best.rect.h / 2
    end if
end sub

sub activateUnderPointer()
    hit = invalid
    for each it in m.items
        ' generous hit box: checkboxes are small targets on a TV
        pad = 26
        if m.px >= it.rect.x - pad and m.px <= it.rect.x + it.rect.w + pad and m.py >= it.rect.y - pad and m.py <= it.rect.y + it.rect.h + pad
            hit = it
            exit for
        end if
    end for
    if hit = invalid then return

    ' optimistic tick - the portal's real state arrives with the next render
    hit.checked = not hit.checked
    hit.node.uri = m.top.assetBase + spriteFor(hit.sprites, hit.checked)
    sendAction("tap", hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h / 2)
end sub

' ---- service channel ----------------------------------------------------

sub sendAction(kind as string, x as float, y as float)
    task = CreateObject("roSGNode", "InteractTask")
    task.serviceBase = m.top.serviceBase
    task.kind = kind
    task.x = x
    task.y = y
    task.pageIndex = m.top.pageIndex
    task.control = "RUN"
    m.pendingTask = task
end sub
