' Remote interaction: a pointer the user steers with the D-pad, plus the
' task checkboxes drawn natively (the render hides the real ones).
'
' The flow mirrors the portal's own remotePointer directive, which is what
' the other TV platforms run (js/directives/remotePointer.js):
'   - OK reveals the pointer; the press that reveals it does nothing else
'   - OK again taps whatever sits under the pointer
'   - arrows do nothing until the pointer is up, then move it 10px a step,
'     holding one glides it along
'   - 15s without input hides it again
' Same look, too: a 20px red dot with a 2px white ring, centred on the
' point it acts at.
'
' Pressing OK sends the gesture to the render service, which replays it
' into a live portal session - the portal runs its own handler, exactly
' as on a touch TV, and the updated screen comes back as a new render.
' The tick is drawn immediately so the press feels instant while that
' round trip happens.

sub init()
    m.boxes = m.top.findNode("boxes")
    m.preload = m.top.findNode("preload")
    m.pointer = m.top.findNode("pointer")
    m.highlight = m.top.findNode("highlight")
    m.hlTop = m.top.findNode("hlTop")
    m.hlBottom = m.top.findNode("hlBottom")
    m.hlLeft = m.top.findNode("hlLeft")
    m.hlRight = m.top.findNode("hlRight")
    m.overrides = {}
    m.hideTimer = m.top.findNode("hideTimer")
    m.hideTimer.observeField("fire", "onIdle")
    m.holdDelay = m.top.findNode("holdDelay")
    m.holdDelay.observeField("fire", "onHoldStart")
    m.holdRepeat = m.top.findNode("holdRepeat")
    m.holdRepeat.observeField("fire", "onHoldStep")
    m.dblTimer = m.top.findNode("dblTimer")
    m.dblTimer.observeField("fire", "onDblWindowEnd")
    m.dblKey = ""
    m.didGlide = false
    m.swipeBusy = false
    m.swipeCooldown = m.top.findNode("swipeCooldown")
    m.swipeCooldown.observeField("fire", "onSwipeCooldown")
    m.px = 960
    m.py = 540
    m.active = false
    m.items = []
    m.warmSent = false
    m.heldKey = ""
    m.top.observeField("targets", "onTargets")
    m.top.observeField("keyPress", "onKey")
    m.top.observeField("keyRelease", "onKeyUp")
    m.top.observeField("swipeApplied", "onSwipeApplied")
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
    m.preload.uri = m.top.assetBase + sprites.checked

    seen = {}
    for each it in t.items
        tid = ""
        if it.payload <> invalid and it.payload.id <> invalid then tid = Int(it.payload.id).ToStr()
        checked = it.checked = true
        if tid <> ""
            seen[tid] = true
            checked = resolveChecked(tid, checked)
        end if
        p = m.boxes.createChild("Poster")
        p.translation = [it.rect.x, it.rect.y]
        p.width = it.rect.w
        p.height = it.rect.h
        p.uri = m.top.assetBase + spriteFor(sprites, checked)
        ' widget/project identify the LIST a task belongs to - the portal
        ' throws its big celebration when a whole list completes, and the
        ' same grouping rule applies here (todos complete per project)
        proj = ""
        if it.payload <> invalid and it.payload.projectId <> invalid then proj = Box(it.payload.projectId).ToStr()
        wid = ""
        if it.widgetSettingId <> invalid then wid = Box(it.widgetSettingId).ToStr()
        m.items.Push({ node: p, rect: it.rect, checked: checked, sprites: sprites, id: tid, widget: wid, project: proj, kind: it.kind })
    end for

    ' a target that has left the page - a completed chore dropping out of
    ' the list - has nothing left to hold, so stop tracking it
    stale = []
    for each k in m.overrides
        if not seen.DoesExist(k) then stale.Push(k)
    end for
    for each k in stale
        m.overrides.Delete(k)
    end for
    print "[Mango] targets: "; m.items.Count(); " box(es), "; m.overrides.Count(); " held locally"
    updateHighlight()
    ' the render came back, so the gesture is done with
    if m.swipeBusy
        m.swipeBusy = false
        m.swipeCooldown.control = "stop"
    end if
end sub

' The press is the user's truth until the backend's own refresh proves it
' landed. A render can arrive before the change has propagated, and
' repainting the old state would read as the tick being thrown away.
function resolveChecked(id as string, fromManifest as boolean) as boolean
    ov = m.overrides[id]
    if ov = invalid then return fromManifest
    if ov.checked = fromManifest
        m.overrides.Delete(id)   ' backend caught up - the render owns it again
        return fromManifest
    end if
    if nowSecs() - ov.at > 180
        m.overrides.Delete(id)   ' never landed - stop pinning a state that isn't real
        return fromManifest
    end if
    return ov.checked
end function

function nowSecs() as integer
    return CreateObject("roDateTime").AsSeconds()
end function

function spriteFor(sprites as object, checked as boolean) as string
    if checked then return sprites.checked
    return sprites.empty
end function

' ---- pointer ------------------------------------------------------------

sub showPointer()
    ' always the middle of the screen: the pointer is general-purpose, so
    ' it has to appear somewhere predictable rather than wherever it was
    ' last left or next to whatever happens to be tappable
    if not m.active
        m.px = 960
        m.py = 540
        placePointer()
    end if
    m.active = true
    m.pointer.visible = true
    updateHighlight()
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
    m.highlight.visible = false
    m.warmSent = false
    stopHold()
end sub

sub placePointer()
    m.pointer.translation = [m.px - 12, m.py - 12]
end sub

sub onKey()
    key = m.top.keyPress
    if key = "" then return
    m.top.keyPress = ""
    ' the pointer comes up on any page, tappable or not - it isn't only
    ' for checkboxes, and a dead OK on some pages would read as broken

    if key = "OK"
        ' the press that brings the pointer up does nothing else, so
        ' nothing can be triggered blind
        if m.active
            m.hideTimer.control = "start"
            activateUnderPointer()
        else
            showPointer()
        end if
        return
    end if

    ' Double-click left/right turns the page. This one acts on the whole
    ' page rather than on whatever the pointer is over, so - like the
    ' portal - it works whether or not the pointer is showing.
    if (key = "left" or key = "right") and key = m.dblKey
        m.dblTimer.control = "stop"
        m.dblKey = ""
        if pageSwipeAllowed()
            if key = "right" then m.top.pageTurn = "next" else m.top.pageTurn = "prev"
            return
        end if
    end if

    ' Double-click up/down over a calendar sends a swipe. Unlike the page
    ' turn this one is aimed: the pointer has to be sitting on the widget,
    ' so it only counts while the pointer is showing.
    if (key = "up" or key = "down") and m.active and key = m.dblKey
        m.dblTimer.control = "stop"
        m.dblKey = ""
        reg = regionUnderPointer()
        ' one swipe at a time: a second one sent while the first is still
        ' coming back makes the backend recompute from the same starting
        ' point and resend the dates already on screen
        if reg <> invalid and calendarScrollAllowed() and not m.swipeBusy
            m.hideTimer.control = "start"
            m.swipeBusy = true
            m.swipeCooldown.control = "start"
            ' tell the scene where to put the spinner: on the widget that
            ' is changing, not the middle of a screen where nothing is
            m.top.busyAt = [reg.rect.x + reg.rect.w / 2, reg.rect.y + reg.rect.h / 2]
            if key = "up" then sendAction2("swipeup", m.px, m.py, reg.id) else sendAction2("swipedown", m.px, m.py, reg.id)
            return
        end if
    end if

    ' arrows only steer a pointer that is already up
    if not m.active then return
    m.hideTimer.control = "start"
    if key = m.heldKey then return   ' the system's own key repeat; the hold timer drives this
    m.heldKey = key
    movePointer(key)
    m.holdDelay.control = "start"
end sub

' holding an arrow glides the pointer: one step on the press, then a
' short pause, then continuous movement until the key comes back up
sub onKeyUp()
    key = m.top.keyRelease
    if key = "" then return
    m.top.keyRelease = ""
    glided = m.didGlide
    if key = m.heldKey then stopHold()
    ' Arm the double-click window from the RELEASE, the way the portal
    ' does. Measuring press-to-press instead leaves the user only
    ' whatever is left of 250ms after however long they held the first
    ' press down - which on a real remote is usually nothing, so the
    ' second press reads as another pointer nudge.
    ' A press that glided the pointer was a hold, not a click.
    if not glided
        m.dblKey = key
        m.dblTimer.control = "stop"
        m.dblTimer.control = "start"
    end if
end sub

function calendarScrollAllowed() as boolean
    g = m.top.gestures
    return g <> invalid and g.calendarScroll = true
end function

function regionUnderPointer() as object
    r = m.top.regions
    if r = invalid then return invalid
    for each it in r
        if m.px >= it.rect.x and m.px <= it.rect.x + it.rect.w and m.py >= it.rect.y and m.py <= it.rect.y + it.rect.h
            return it
        end if
    end for
    return invalid
end function

function pageSwipeAllowed() as boolean
    g = m.top.gestures
    return g <> invalid and g.pageSwipe = true
end function

' the swipe has had its turn - accept gestures again
sub onSwipeCooldown()
    m.swipeBusy = false
end sub

' The swipe's own manifest just applied - the round trip is genuinely
' over, so release the one-swipe-at-a-time lock now instead of sitting
' out the rest of the 8s cooldown (which used to add 4-5 dead seconds
' after the new dates were already on screen, stacking on every
' consecutive month-page). The cooldown timer stays armed as the
' fallback for swipes that never produce a manifest (range edges,
' service errors). Only imageOnly (interaction) manifests bump this
' field, so a scheduled refresh mid-swipe cannot release the lock early.
sub onSwipeApplied()
    if m.swipeBusy
        print "[Mango] swipe manifest applied - gestures unlocked"
        m.swipeBusy = false
        m.swipeCooldown.control = "stop"
    end if
end sub

sub onDblWindowEnd()
    m.dblKey = ""
end sub

sub stopHold()
    m.heldKey = ""
    m.didGlide = false
    m.holdDelay.control = "stop"
    m.holdRepeat.control = "stop"
end sub

sub onHoldStart()
    if m.heldKey <> "" then m.holdRepeat.control = "start"
end sub

sub onHoldStep()
    m.didGlide = true
    if m.heldKey = ""
        m.holdRepeat.control = "stop"
        return
    end if
    m.hideTimer.control = "start"
    movePointer(m.heldKey)
end sub

sub movePointer(key as string)
    stepPx = 10
    if key = "up"
        m.py = m.py - stepPx
    else if key = "down"
        m.py = m.py + stepPx
    else if key = "left"
        m.px = m.px - stepPx
    else if key = "right"
        m.px = m.px + stepPx
    end if
    if m.px < 12 then m.px = 12
    if m.px > 1908 then m.px = 1908
    if m.py < 12 then m.py = 12
    if m.py > 1068 then m.py = 1068
    placePointer()
    updateHighlight()
end sub

' small forgiveness margin - the portal hits the exact point, but its
' checkbox has a label around it that ours doesn't
function itemUnderPointer() as object
    pad = 12
    for each it in m.items
        if m.px >= it.rect.x - pad and m.px <= it.rect.x + it.rect.w + pad and m.py >= it.rect.y - pad and m.py <= it.rect.y + it.rect.h + pad
            return it
        end if
    end for
    return invalid
end function

' Outline whatever the pointer is over, so it is obvious what can be acted
' on. Without this the pointer is a dot on a photo: nothing says which
' parts of the screen do anything, which reads as the remote being broken.
sub updateHighlight()
    if not m.active
        m.highlight.visible = false
        return
    end if
    r = invalid
    reg = regionUnderPointer()
    if reg <> invalid
        r = reg.rect
    else
        it = itemUnderPointer()
        if it <> invalid
            pad = 10
            r = { x: it.rect.x - pad, y: it.rect.y - pad, w: it.rect.w + pad * 2, h: it.rect.h + pad * 2 }
        end if
    end if
    if r = invalid
        m.highlight.visible = false
        return
    end if
    t = 4
    m.hlTop.translation = [r.x, r.y]
    m.hlTop.width = r.w
    m.hlTop.height = t
    m.hlBottom.translation = [r.x, r.y + r.h - t]
    m.hlBottom.width = r.w
    m.hlBottom.height = t
    m.hlLeft.translation = [r.x, r.y]
    m.hlLeft.width = t
    m.hlLeft.height = r.h
    m.hlRight.translation = [r.x + r.w - t, r.y]
    m.hlRight.width = t
    m.hlRight.height = r.h
    m.highlight.visible = true
end sub

' Is every box in this task's LIST now checked? The visible targets are
' the list as far as the TV can aim at it; todos group per project inside
' a widget (the portal's own rule), chores per widget.
function listComplete(hit as object) as boolean
    for each it in m.items
        if it.widget = hit.widget
            if hit.kind <> "todo" or it.project = hit.project
                if it.checked <> true then return false
            end if
        end if
    end for
    return true
end function

sub activateUnderPointer()
    print "[Mango] OK at "; Int(m.px); ","; Int(m.py)
    hit = itemUnderPointer()
    if hit = invalid then return

    ' tick now, ask later: the press paints locally and that state is held
    ' across refreshes until the portal's own render agrees with it
    hit.checked = not hit.checked
    hit.node.uri = m.top.assetBase + spriteFor(hit.sprites, hit.checked)
    if hit.id <> "" then m.overrides[hit.id] = { checked: hit.checked, at: nowSecs() }
    print "[Mango] tick "; hit.id; " -> "; hit.checked
    ' celebrate exactly like the portal: a burst at the box for a
    ' check-off, the full-display finale when its whole list is done
    if hit.checked
        info = { kind: "burst", x: hit.rect.x + hit.rect.w / 2, y: hit.rect.y + hit.rect.h / 2 }
        if listComplete(hit) then info.kind = "finale"
        m.top.celebrate = info
    end if
    sendAction2("tap", hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h / 2, hit.id)
end sub

' ---- service channel ----------------------------------------------------

sub sendAction(kind as string, x as float, y as float)
    sendAction2(kind, x, y, "")
end sub

' identity travels with the gesture: the live page's task list can differ
' from the render the device is showing, so position alone can misfire
sub sendAction2(kind as string, x as float, y as float, id as string)
    task = CreateObject("roSGNode", "InteractTask")
    task.serviceBase = m.top.serviceBase
    task.identity = m.top.identity
    task.kind = kind
    task.x = x
    task.y = y
    task.pageIndex = m.top.pageIndex
    task.targetId = id
    task.control = "RUN"
    m.pendingTask = task
end sub
