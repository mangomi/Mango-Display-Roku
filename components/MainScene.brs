sub init()
    ' ENVIRONMENT — spike runs against the TEST backend only. For production
    ' use api.mangomirror.com + app.mangodisplay.com (codes registered on one
    ' backend can only be claimed from the matching webapp).
    m.env = {
        apiBase: "https://testapi.mangomirror.com/v1.0.5/"
        setupHost: "testapp.mangodisplay.com"
    }

    m.codeLabel = m.top.findNode("codeLabel")
    m.pairingGroup = m.top.findNode("pairingGroup")
    m.pageHost = m.top.findNode("pageHost")
    m.refreshTimer = m.top.findNode("refreshTimer")
    m.pageTimer = m.top.findNode("pageTimer")
    m.spinnerPoster = m.top.findNode("spinnerPoster")
    m.spinnerWatchdog = m.top.findNode("spinnerWatchdog")
    m.spinnerWatchdog.observeField("fire", "onSpinnerWatchdog")
    m.spinAnim = invalid
    m.top.findNode("instructionsLabel").text = "Setup at " + m.env.setupHost + " using any browser"

    ' each slot = page image + that page's overlays, animated as one unit
    m.slots = {
        slotA: {
            slot: m.top.findNode("slotA")
            poster: m.top.findNode("imageA")
            overlays: m.top.findNode("overlaysA")
            under: m.top.findNode("underA")
        }
        slotB: {
            slot: m.top.findNode("slotB")
            poster: m.top.findNode("imageB")
            overlays: m.top.findNode("overlaysB")
            under: m.top.findNode("underB")
        }
    }

    ' render service endpoints; display.json carries pages + overlays
    m.assetBaseUrl = "http://10.0.0.74:8090/"
    m.pagesUrl = m.assetBaseUrl + "display.json"
    m.versionBaseUrl = "http://10.0.0.74:8091"

    ' native-widget registry: manifest overlay type -> SceneGraph component
    ' (add future types here AND in render-service/nativeWidgets.js)
    m.overlayRegistry = { clock: "ClockOverlay", gif: "GifOverlay", slideshow: "SlideshowOverlay", countdown: "CountdownOverlay", background: "SlideshowOverlay" }
    ' these render BELOW the page image (layered pages)
    m.underTypes = { background: true }

    m.slots.slotA.poster.observeField("loadStatus", "onPosterLoad")
    m.slots.slotB.poster.observeField("loadStatus", "onPosterLoad")
    m.refreshTimer.observeField("fire", "onRefreshTick")
    m.pageTimer.observeField("fire", "onPageTimer")

    m.frontKey = ""
    m.pages = invalid
    m.latestPages = invalid
    m.pageIndex = 0
    m.pendingLoad = invalid
    m.activeAnim = invalid
    m.animCtx = invalid
    m.overlayState = {}
    m.lastVersionSeconds = 0
    m.latestReason = ""

    m.deviceCode = getOrCreateCode(false)
    startPairing()
end sub

' Same scheme as Tizen: "RK" + 9 random digits 1-9, persisted like
' localStorage (survives app updates; cleared when the channel is removed)
function getOrCreateCode(forceNew as boolean) as string
    sec = CreateObject("roRegistrySection", "mangodisplay")
    if forceNew and sec.Exists("displayCode")
        sec.Delete("displayCode")
        sec.Flush()
    end if
    if sec.Exists("displayCode")
        return sec.Read("displayCode")
    end if
    code = "RK"
    for i = 1 to 9
        code = code + Rnd(9).ToStr()
    end for
    sec.Write("displayCode", code)
    sec.Flush()
    return code
end function

sub startPairing()
    m.refreshTimer.control = "stop"
    m.pageTimer.control = "stop"
    if m.versionTask <> invalid then m.versionTask.control = "STOP"
    stopActiveAnim()
    m.frontKey = ""
    m.pages = invalid
    m.latestPages = invalid
    m.pageIndex = 0
    m.pendingLoad = invalid
    for each k in m.slots
        m.slots[k].slot.visible = false
        clearOverlays(m.slots[k].overlays)
        clearOverlays(m.slots[k].under)
    end for
    m.pairingGroup.visible = true
    m.codeLabel.text = m.deviceCode

    m.task = CreateObject("roSGNode", "PairingTask")
    m.task.apiBase = m.env.apiBase
    m.task.code = m.deviceCode
    m.task.observeField("result", "onPaired")
    m.task.control = "RUN"
end sub

sub onPaired()
    r = m.task.result
    if r = invalid then return
    print "[Mango] paired (major "; r.major; " minor "; r.minor; "), waiting for display.json"
    m.versionTask = CreateObject("roSGNode", "VersionTask")
    m.versionTask.waitUrl = m.versionBaseUrl
    m.versionTask.manifestUrl = m.pagesUrl
    m.versionTask.observeField("version", "onVersionChange")
    m.versionTask.observeField("busy", "onBusyChange")
    m.versionTask.control = "RUN"
    ' fallback cadence + retry loop if a fetch fails
    m.refreshTimer.control = "start"
end sub

sub onVersionChange()
    m.lastVersionSeconds = CreateObject("roDateTime").AsSeconds()
    man = m.versionTask.manifest
    if man = invalid or man.pages = invalid or man.pages.Count() = 0 then return
    print "[Mango] display.json: "; man.pages.Count(); " page(s)"
    ' never apply mid-transition/mid-load - deferred to finalizeSwap
    m.latestPages = man.pages
    m.latestReason = ""
    if man.updateReason <> invalid then m.latestReason = man.updateReason
    maybeApplyPages()
end sub

sub maybeApplyPages()
    if m.latestPages = invalid then return
    if m.activeAnim <> invalid or m.pendingLoad <> invalid then return
    m.pages = m.latestPages
    m.latestPages = invalid
    ' announce user edits once the new image is actually on screen;
    ' background refreshes (startup/scheduled/midnight) stay silent
    m.latestReason = ""
    if m.pageIndex >= m.pages.Count() then m.pageIndex = 0
    ' quiet refresh of the current page (no transition)
    loadPage(m.pageIndex, false)
end sub

sub onRefreshTick()
    ' fallback only: when the long-poll is healthy (a version event in the
    ' last 90s), reloading would just rebuild live overlays mid-dwell and
    ' visibly interrupt slideshows - skip
    now = CreateObject("roDateTime").AsSeconds()
    if m.lastVersionSeconds > 0 and now - m.lastVersionSeconds < 90 then return
    if m.pages <> invalid and m.pendingLoad = invalid and m.activeAnim = invalid
        loadPage(m.pageIndex, false)
    end if
end sub

sub onPageTimer()
    if m.pages = invalid or m.pages.Count() < 2 then return
    loadPage((m.pageIndex + 1) mod m.pages.Count(), true)
end sub

function frontEntry() as object
    if m.frontKey = "" then return invalid
    return m.slots[m.frontKey]
end function

function backKey() as string
    if m.frontKey = "slotA" then return "slotB"
    return "slotA"
end function

sub resetSlotTransforms(slot as object)
    slot.translation = [0, 0]
    slot.scale = [1.0, 1.0]
    slot.opacity = 1.0
    slot.rotation = 0.0
    slot.scaleRotateCenter = [960, 540]
end sub

sub loadPage(index as integer, animated as boolean)
    if m.pages = invalid then return
    if index >= m.pages.Count() then index = 0
    pg = m.pages[index]
    bk = backKey()
    entry = m.slots[bk]
    ' incoming slot draws on top during transitions
    m.pageHost.removeChild(entry.slot)
    m.pageHost.appendChild(entry.slot)
    resetSlotTransforms(entry.slot)
    ' the page's overlays ride inside the slot, so they move/fade with it
    applyOverlays(pg.overlays, entry.overlays, entry.under)
    m.pendingLoad = { index: index, animated: animated, transition: pg.transition, slotKey: bk }
    ts = CreateObject("roDateTime").AsSeconds().ToStr()
    entry.poster.uri = m.assetBaseUrl + pg.image + "?t=" + ts
end sub

sub onPosterLoad(ev as object)
    node = ev.getRoSGNode()
    if m.pendingLoad = invalid then return
    entry = m.slots[m.pendingLoad.slotKey]
    if node.id <> entry.poster.id then return
    status = node.loadStatus
    if status = "failed"
        print "[Mango] image load failed: "; node.uri
        m.pendingLoad = invalid
        maybeApplyPages()
        return
    end if
    if status <> "ready" then return
    pl = m.pendingLoad
    m.pendingLoad = invalid
    if pl.animated and m.frontKey <> ""
        startTransition(pl.transition, pl.slotKey, pl.index)
    else
        entry.slot.visible = true
        finalizeSwap(pl.slotKey, pl.index)
    end if
end sub

sub finalizeSwap(newKey as string, index as integer)
    old = frontEntry()
    if old <> invalid and m.frontKey <> newKey
        old.slot.visible = false
        clearOverlays(old.overlays)
        clearOverlays(old.under)
        resetSlotTransforms(old.slot)
    end if
    m.frontKey = newKey
    entry = m.slots[newKey]
    resetSlotTransforms(entry.slot)
    entry.slot.visible = true
    m.pairingGroup.visible = false
    m.pageIndex = index
    armPageTimer()
    ' apply any manifest that arrived while a transition/load was running
    maybeApplyPages()
end sub

' spins while the render service is processing a user edit, so the change
' is visibly "on its way" instead of silently arriving ~15s later
sub onBusyChange()
    show = m.versionTask.busy = true and m.pages <> invalid
    print "[Mango] busy="; m.versionTask.busy
    if show
        startSpinner()
    else
        stopSpinner()
    end if
end sub

sub startSpinner()
    if m.spinAnim <> invalid then return ' already spinning
    m.spinnerPoster.rotation = 0.0
    m.spinnerPoster.visible = true
    anim = CreateObject("roSGNode", "Animation")
    anim.duration = 1.1
    anim.repeat = true
    anim.easeFunction = "linear"
    interp = CreateObject("roSGNode", "FloatFieldInterpolator")
    interp.key = [0.0, 1.0]
    ' NEGATIVE = clockwise on Roku (positive rotates counter-clockwise,
    ' the opposite of CSS); clockwise is the loading-spinner convention
    interp.keyValue = [0.0, -6.2831853]
    interp.fieldToInterp = "spinnerPoster.rotation"
    anim.appendChild(interp)
    m.top.appendChild(anim)
    m.spinAnim = anim
    anim.control = "start"
    m.spinnerWatchdog.control = "start"
end sub

sub stopSpinner()
    m.spinnerWatchdog.control = "stop"
    if m.spinAnim <> invalid
        m.spinAnim.control = "stop"
        m.top.removeChild(m.spinAnim)
        m.spinAnim = invalid
    end if
    m.spinnerPoster.visible = false
    m.spinnerPoster.rotation = 0.0
end sub

' safety net: never leave a spinner on screen if busy=false is missed
sub onSpinnerWatchdog()
    print "[Mango] spinner watchdog - forcing hide"
    stopSpinner()
end sub

sub armPageTimer()
    m.pageTimer.control = "stop"
    if m.pages = invalid or m.pages.Count() < 2 then return
    pg = m.pages[m.pageIndex]
    if pg.autoRotate <> true then return
    d = 60
    if pg.delaySeconds <> invalid then d = Int(pg.delaySeconds)
    if d < 3 then d = 3
    m.pageTimer.duration = d
    m.pageTimer.control = "start"
end sub

' ---- transitions (portal parity: 3s ease; see NATIVE_WIDGETS.md) -------

sub stopActiveAnim()
    if m.activeAnim <> invalid
        m.activeAnim.control = "stop"
        m.top.removeChild(m.activeAnim)
        m.activeAnim = invalid
        m.animCtx = invalid
    end if
end sub

sub addVec(anim as object, field as string, keyValue as object)
    i = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    i.key = [0.0, 1.0]
    i.keyValue = keyValue
    i.fieldToInterp = field
    anim.appendChild(i)
end sub

sub addFloat(anim as object, field as string, keyValue as object)
    i = CreateObject("roSGNode", "FloatFieldInterpolator")
    i.key = [0.0, 1.0]
    i.keyValue = keyValue
    i.fieldToInterp = field
    anim.appendChild(i)
end sub

function buildTransition(name as string, frontSlotId as string, back as object) as object
    d = 3.0
    bid = back.id
    if name = "flip"
        ' Roku has no 3D transforms; approximate the card flip with a
        ' horizontal squash-and-expand (whole slot, overlays included)
        back.scale = [0.0001, 1.0]
        seq = CreateObject("roSGNode", "SequentialAnimation")
        a1 = CreateObject("roSGNode", "Animation")
        a1.duration = d / 2
        a1.easeFunction = "inQuad"
        addVec(a1, frontSlotId + ".scale", [[1.0, 1.0], [0.0001, 1.0]])
        a2 = CreateObject("roSGNode", "Animation")
        a2.duration = d / 2
        a2.easeFunction = "outQuad"
        addVec(a2, bid + ".scale", [[0.0001, 1.0], [1.0, 1.0]])
        seq.appendChild(a1)
        seq.appendChild(a2)
        return seq
    end if

    a = CreateObject("roSGNode", "Animation")
    a.duration = d
    a.easeFunction = "inOutCubic"
    if name = "slideleft"
        back.translation = [1920, 0]
        addVec(a, bid + ".translation", [[1920, 0], [0, 0]])
    else if name = "slideright"
        back.translation = [-1920, 0]
        addVec(a, bid + ".translation", [[-1920, 0], [0, 0]])
    else if name = "slideup"
        back.translation = [0, 1080]
        addVec(a, bid + ".translation", [[0, 1080], [0, 0]])
    else if name = "slidedown"
        back.translation = [0, -1080]
        addVec(a, bid + ".translation", [[0, -1080], [0, 0]])
    else if name = "pop"
        back.scale = [0.3, 0.3]
        back.opacity = 0.0
        addVec(a, bid + ".scale", [[0.3, 0.3], [1.0, 1.0]])
        addFloat(a, bid + ".opacity", [0.0, 1.0])
    else if name = "rotate"
        back.rotation = 3.14159
        back.opacity = 0.0
        back.scale = [0.3, 0.3]
        addFloat(a, bid + ".rotation", [3.14159, 0.0])
        addFloat(a, bid + ".opacity", [0.0, 1.0])
        addVec(a, bid + ".scale", [[0.3, 0.3], [1.0, 1.0]])
    else ' fade + unknown names
        back.opacity = 0.0
        addFloat(a, bid + ".opacity", [0.0, 1.0])
    end if
    return a
end function

sub startTransition(name as string, slotKey as string, index as integer)
    stopActiveAnim()
    entry = m.slots[slotKey]
    anim = buildTransition(name, m.frontKey, entry.slot)
    entry.slot.visible = true
    m.top.appendChild(anim)
    m.activeAnim = anim
    m.animCtx = { slotKey: slotKey, index: index }
    anim.observeField("state", "onAnimState")
    anim.control = "start"
end sub

sub onAnimState()
    if m.activeAnim = invalid then return
    if m.activeAnim.state <> "stopped" then return
    ctx = m.animCtx
    stopActiveAnim()
    finalizeSwap(ctx.slotKey, ctx.index)
end sub

' ---- overlays ----------------------------------------------------------

function overlayStateKey(cfg as object) as string
    if cfg = invalid or cfg.widgetSettingId = invalid then return ""
    return "ov_" + Int(cfg.widgetSettingId).ToStr() + "_" + Int(cfg.page).ToStr()
end function

sub clearOverlays(container as object)
    while container.getChildCount() > 0
        child = container.getChild(0)
        ' stateful overlays (slideshows) remember their position across
        ' page rotations, so each visit continues instead of restarting
        if child.hasField("lastIndex")
            key = overlayStateKey(child.config)
            if key <> "" then m.overlayState[key] = child.lastIndex
        end if
        container.removeChildIndex(0)
    end while
end sub

sub applyOverlays(overlays as object, container as object, under as object)
    clearOverlays(container)
    if under <> invalid then clearOverlays(under)
    if overlays = invalid then return
    for each ov in overlays
        compName = m.overlayRegistry.Lookup(ov.type)
        if compName <> invalid
            node = CreateObject("roSGNode", compName)
            ' assetBase before config: config observers build asset URLs
            if node.hasField("assetBase") then node.assetBase = m.assetBaseUrl
            if node.hasField("lastIndex")
                key = overlayStateKey(ov)
                if key <> "" and m.overlayState.DoesExist(key) then ov.startIndex = m.overlayState[key]
            end if
            node.config = ov
            target = container
            if m.underTypes.DoesExist(ov.type) and under <> invalid then target = under
            target.appendChild(node)
        end if
    end for
end sub

' Hidden dev helper (no on-screen hint): * discards the code and starts
' over, like clearing localStorage on the Tizen app
function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "options"
        if m.task <> invalid then m.task.control = "STOP"
        m.deviceCode = getOrCreateCode(true)
        startPairing()
        return true
    end if
    return false
end function
