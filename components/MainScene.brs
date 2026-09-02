sub init()
    ' ENVIRONMENT - everything env-specific comes from source/env.brs,
    ' which package.sh generates per build (checked-in default: test)
    m.env = envConfig()

    m.codeLabel = m.top.findNode("codeLabel")
    m.pairingGroup = m.top.findNode("pairingGroup")
    m.pageHost = m.top.findNode("pageHost")
    m.refreshTimer = m.top.findNode("refreshTimer")
    m.pageTimer = m.top.findNode("pageTimer")
    m.spinnerPoster = m.top.findNode("spinnerPoster")
    m.spinnerWatchdog = m.top.findNode("spinnerWatchdog")
    m.spinnerWatchdog.observeField("fire", "onSpinnerWatchdog")
    m.idleKeepAlive = m.top.findNode("idleKeepAlive")
    m.idleKeepAlive.observeField("state", "onIdleKeepAliveState")
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

    ' The control endpoint - the hosted render service behind its load
    ' balancer, on our own hostname so the address survives infrastructure
    ' rebuilds. HTTPS: the control reply carries the display's asset
    ' prefix, the only secret protecting a household's rendered content.
    ' Everything else (where images live) is learned from it at runtime,
    ' so moving assets does not need a channel update. Only this address
    ' (per environment, from env.brs) is compiled in.
    m.versionBaseUrl = m.env.controlBase
    ' placeholders until the control channel says where assets live
    m.assetBaseUrl = ""
    m.pagesUrl = ""

    ' native-widget registry: manifest overlay type -> SceneGraph component
    ' (add future types here AND in render-service/nativeWidgets.js)
    m.overlayRegistry = { clock: "ClockOverlay", gif: "GifOverlay", scroll: "ScrollOverlay", slideshow: "SlideshowOverlay", countdown: "CountdownOverlay", background: "SlideshowOverlay" }
    ' these render BELOW the page image (layered pages)
    m.underTypes = { background: true }

    ' display-wide visual overlays: manifest effect type -> component
    ' spritesheet effects reuse GifOverlay (animated strip at a fixed rect)
    m.effectRegistry = { balloons: "ParticleEffect", snow: "ParticleEffect", leaves: "ParticleEffect", hearts: "ParticleEffect", spritesheet: "GifOverlay", spritemover: "SpriteMover", popup: "PopupEffect", dropper: "DropperEffect" }
    m.effectLayer = m.top.findNode("effectLayer")
    m.effectsKey = ""

    m.interaction = m.top.findNode("interaction")
    m.interaction.assetBase = m.assetBaseUrl
    m.interaction.serviceBase = m.versionBaseUrl
    m.interaction.observeField("pageTurn", "onPageTurn")
    m.celebrationLayer = m.top.findNode("celebrationLayer")
    m.interaction.observeField("celebrate", "onCelebrate")
    ' the manifest's coordinate space and how it sits on this screen
    m.stage = m.top.findNode("stage")
    m.canvasW = 1920
    m.canvasH = 1080
    m.rotation = 0

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
    m.overlaysKey = invalid
    ' fallback content tag for manifests without per-page image hashes;
    ' bumped per applied manifest, never per load - a page turn must NOT
    ' mint a new URL for pixels the device already holds
    m.contentTag = 0
    m.loadWatchdog = m.top.findNode("loadWatchdog")
    m.loadWatchdog.observeField("fire", "onLoadWatchdog")
    m.forceInPlace = false
    m.latestImageOnly = false
    m.lastVersionSeconds = 0
    m.latestReason = ""

    ' without focus the scene never receives remote key events
    m.top.setFocus(true)

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
    ' an unclaimed TV on the pairing screen is allowed to idle out
    m.idleKeepAlive.control = "stop"
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
    ' The render service manages a fleet: every control request carries
    ' this display's identity so the service can route it - and, after a
    ' service restart, rebuild the display's worker from the request
    ' alone. w/h is what THIS device renders at, re-read each boot.
    res = CreateObject("roDeviceInfo").GetUIResolution()
    m.identity = "&device=" + m.deviceCode + "&major=" + r.major + "&minor=" + r.minor + "&w=" + res.width.ToStr() + "&h=" + res.height.ToStr()
    m.interaction.identity = m.identity
    m.versionTask = CreateObject("roSGNode", "VersionTask")
    m.versionTask.identity = m.identity
    m.versionTask.waitUrl = m.versionBaseUrl
    m.versionTask.manifestUrl = m.pagesUrl
    ' why did the PREVIOUS run end? (crash, system kill, Roku idle exit,
    ' user exit.) Read AFTER the fact via GetLastExitInfo - Roku gives no
    ' shutdown hook to save anything in, so the answer is fetched at the
    ' next boot and rides the launch poll for the service to log next to
    ' the session's start/duration.
    m.versionTask.launchInfo = lastExitQuery()
    m.versionTask.observeField("version", "onVersionChange")
    m.versionTask.observeField("busy", "onBusyChange")
    m.versionTask.observeField("assetBase", "onAssetBase")
    m.versionTask.control = "RUN"
    ' fallback cadence + retry loop if a fetch fails
    m.refreshTimer.control = "start"
end sub

' The service can move its assets - a different bucket prefix, or a real
' CDN domain instead of the development one - without a channel update.
sub onAssetBase()
    base = m.versionTask.assetBase
    if base = "" then return
    if Right(base, 1) <> "/" then base = base + "/"
    m.assetBaseUrl = base
    m.pagesUrl = base + "display.json"
    m.interaction.assetBase = base
    print "[Mango] fetching assets from "; base
end sub

sub onVersionChange()
    m.lastVersionSeconds = CreateObject("roDateTime").AsSeconds()
    man = m.versionTask.manifest
    if man = invalid or man.pages = invalid or man.pages.Count() = 0 then return
    print "[Mango] display.json: "; man.pages.Count(); " page(s)"
    applyCanvas(man)
    applyEffects(man.effects)
    if man.gestures <> invalid
        m.interaction.gestures = man.gestures
    end if
    ' never apply mid-transition/mid-load - deferred to finalizeSwap
    m.latestPages = man.pages
    m.latestImageOnly = (man.imageOnly = true)
    ' a layout edit names the page being edited (mirrors the portal)
    m.latestShowPage = invalid
    if man.showPage <> invalid then m.latestShowPage = Int(man.showPage)
    m.latestReason = ""
    if man.updateReason <> invalid then m.latestReason = man.updateReason
    maybeApplyPages()
end sub

' The manifest's coordinate space, and how it sits on this screen. The
' render service draws a rotated display UNROTATED at a portrait canvas
' (1080x1920) and asks for one rotation here: the stage group carries the
' page slots, overlays, effects, pointer and celebrations, so a single
' transform turns all of them together. rotation is degrees CLOCKWISE as
' the viewer sees it (0, 90, 270). Roku's rotation field is positive
' counter-clockwise, hence the sign flip. The stage is placed so the
' canvas centre lands on the screen centre, then rotated about it.
sub applyCanvas(man as object)
    w = 1920
    h = 1080
    rot = 0
    if man.canvas <> invalid and man.canvas.width <> invalid and man.canvas.height <> invalid
        w = Int(man.canvas.width)
        h = Int(man.canvas.height)
    end if
    if man.rotation <> invalid then rot = Int(man.rotation)
    if w = m.canvasW and h = m.canvasH and rot = m.rotation then return
    m.canvasW = w
    m.canvasH = h
    m.rotation = rot
    print "[Mango] canvas "; w; "x"; h; " rotation "; rot
    for each k in m.slots
        p = m.slots[k].poster
        p.width = w
        p.height = h
        p.loadWidth = w
        p.loadHeight = h
    end for
    m.interaction.canvasW = w
    m.interaction.canvasH = h
    m.interaction.rotation = rot
    if rot = 90 or rot = 270
        m.stage.scaleRotateCenter = [w / 2, h / 2]
        m.stage.translation = [(1920 - w) / 2, (1080 - h) / 2]
        if rot = 90 then m.stage.rotation = -1.5707963 else m.stage.rotation = 1.5707963
    else
        m.stage.scaleRotateCenter = [0, 0]
        m.stage.translation = [0, 0]
        m.stage.rotation = 0.0
    end if
    ' effects spawn against the canvas bounds: rebuild them on the next apply
    m.effectsKey = ""
end sub

sub maybeApplyPages()
    if m.latestPages = invalid then return
    if m.activeAnim <> invalid or m.pendingLoad <> invalid then return
    m.pages = m.latestPages
    m.latestPages = invalid
    ' busy may have arrived while no page was up yet (app launch): the
    ' pages-guard in onBusyChange dropped it then, so re-evaluate now.
    ' Idempotent: start/stop both no-op when already in that state.
    onBusyChange()
    ' new manifest = pixels may have changed under the stable filenames.
    ' Hash-carrying manifests make this precise per page; the tag only
    ' matters as the fallback when a hash is missing.
    m.contentTag = m.contentTag + 1
    ' a hidden slot may still pin textures this manifest no longer uses
    releaseStale(m.slots[backKey()])
    ' announce user edits once the new image is actually on screen;
    ' background refreshes (startup/scheduled/midnight) stay silent
    m.latestReason = ""
    if m.pageIndex >= m.pages.Count() then m.pageIndex = 0
    ' quiet refresh of the current page (no transition)
    wasImageOnly = (m.latestImageOnly = true)
    m.forceInPlace = wasImageOnly
    m.latestImageOnly = false
    ' a layout edit carries the page being edited: mirror the portal and
    ' take the TV there (animated, like a manual page turn), so the user
    ' watches the page they are changing. The dwell timer restarts for
    ' that page via finalizeSwap.
    sp = m.latestShowPage
    m.latestShowPage = invalid
    if sp <> invalid and sp >= 0 and sp < m.pages.Count() and sp <> m.pageIndex
        print "[Mango] layout edit on page "; sp; " - showing it"
        m.forceInPlace = false
        m.pageTimer.control = "stop"
        loadPage(sp, true)
    else
        loadPage(m.pageIndex, false)
    end if
    m.forceInPlace = false
    ' an imageOnly manifest is a swipe's answer landing: tell the
    ' interaction layer so its one-swipe-at-a-time lock releases now
    ' rather than waiting out the fallback cooldown
    if wasImageOnly then m.interaction.swipeApplied = m.interaction.swipeApplied + 1
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

' Double-click left/right on the remote. The device already holds every
' page, so a turn is local and instant - no round trip to the render
' service, unlike the gestures that change what a widget shows.
sub onPageTurn()
    dir = m.interaction.pageTurn
    if dir = "" then return
    m.interaction.pageTurn = ""
    if m.pages = invalid or m.pages.Count() < 2 then return
    ' turning mid-transition would fight the animation in flight
    if m.activeAnim <> invalid or m.pendingLoad <> invalid then return
    n = m.pages.Count()
    delta = 1
    if dir = "prev" then delta = -1
    ' + n keeps the result positive: BrightScript MOD follows the sign of
    ' the left operand, so (0 - 1) MOD 3 would be -1, not 2
    idx = (m.pageIndex + delta + n) mod n
    print "[Mango] page turn "; dir; " -> "; idx
    ' the dwell restarts for the page the user landed on (armPageTimer in
    ' finalizeSwap), so a manual turn doesn't get cut short by a timer
    ' that was already most of the way through the previous page
    m.pageTimer.control = "stop"
    loadPage(idx, true)
end sub

' the native layers a page asks for, as a comparable string
function overlayConfigKey(overlays as object) as string
    if overlays = invalid then return ""
    return FormatJson(overlays)
end function

function overlaysUnchanged(overlays as object) as boolean
    if m.overlaysKey = invalid then return false
    return m.overlaysKey = overlayConfigKey(overlays)
end function

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
    slot.scaleRotateCenter = [m.canvasW / 2, m.canvasH / 2]
end sub

sub loadPage(index as integer, animated as boolean)
    if m.pages = invalid then return
    if index >= m.pages.Count() then index = 0
    pg = m.pages[index]

    ' Only this page's IMAGE changed - a calendar swipe, which the service
    ' marks imageOnly. Swap it under the live overlays rather than
    ' rebuilding them: a rebuild restarts every GIF from frame one and
    ' blanks them while their sheets reload, which reads as the screen
    ' freezing whenever anything updates.
    if not animated and m.frontKey <> "" and index = m.pageIndex and (m.forceInPlace = true or overlaysUnchanged(pg.overlays))
        ' Deliberately does NOT track a pending load. There is no slot to
        ' swap and nothing to finalise - the visible Poster just picks up
        ' the new bitmap (or keeps it: identical uri = identical pixels =
        ' nothing to do). Waiting on loadStatus here wedged the display:
        ' when Roku serves the image from its own cache the field never
        ' leaves "ready", so no change event arrives, pendingLoad is never
        ' cleared, and every later update is deferred behind it.
        m.slots[m.frontKey].poster.uri = pageUri(pg)
        m.pageIndex = index
        armPageTimer()
        return
    end if

    bk = backKey()
    entry = m.slots[bk]
    ' incoming slot draws on top during transitions
    m.pageHost.removeChild(entry.slot)
    m.pageHost.appendChild(entry.slot)
    resetSlotTransforms(entry.slot)
    ' the page's overlays ride inside the slot, so they move/fade with it
    applyOverlays(pg.overlays, entry.overlays, entry.under)
    m.overlaysKey = overlayConfigKey(pg.overlays)
    target = pageUri(pg)
    ' The texture is often already on this poster - with two pages each
    ' slot keeps showing the same page, so every turn after the first
    ' cycle needs no fetch, no decode and no load event. Setting a field
    ' to the value it already holds fires NO change event (that once
    ' wedged the display), so when the uri matches we must not wait for
    ' one: proceed as if the load just completed.
    if entry.poster.uri = target and entry.poster.loadStatus = "ready"
        if animated and m.frontKey <> ""
            startTransition(pg.transition, bk, index)
        else
            entry.slot.visible = true
            finalizeSwap(bk, index)
        end if
        return
    end if
    ' same uri but not ready (an earlier load failed): force a reload by
    ' clearing first, so the assignment is a real change and fires events
    if entry.poster.uri = target then entry.poster.uri = ""
    m.pendingLoad = { index: index, animated: animated, transition: pg.transition, slotKey: bk }
    m.loadWatchdog.control = "start"
    entry.poster.uri = target
end sub

' The image URL for a page. Keyed by CONTENT (the render service hashes
' every page image), so unchanged pixels keep an unchanged URL: Roku's
' texture cache reuses them and nothing is re-downloaded. Old-manifest
' fallback: a per-manifest tag - coarser, but still bounded by content
' changes rather than by page turns.
function pageUri(pg as object) as string
    tag = ""
    if pg.imageHash <> invalid and pg.imageHash <> "" then tag = pg.imageHash
    if tag = "" then tag = "v" + m.contentTag.ToStr()
    return m.assetBaseUrl + pg.image + "?t=" + tag
end function

' Drop a slot's poster reference when it shows content no current page
' uses - the last reference is what keeps the old texture resident, and
' hours of retained stale versions is exactly the slow memory famine
' that ends with the OS killing the channel.
sub releaseStale(entry as object)
    if entry = invalid or entry.poster.uri = "" then return
    if m.pages <> invalid
        for each pg in m.pages
            if entry.poster.uri = pageUri(pg) then return
        end for
    end if
    entry.poster.uri = ""
end sub

' last line of defence: nothing may leave a load pending, or the display
' silently stops accepting updates
sub onLoadWatchdog()
    if m.pendingLoad = invalid then return
    print "[Mango] load watchdog: clearing a stuck page load"
    m.pendingLoad = invalid
    maybeApplyPages()
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
        m.loadWatchdog.control = "stop"
        maybeApplyPages()
        return
    end if
    if status <> "ready" then return
    pl = m.pendingLoad
    m.pendingLoad = invalid
    m.loadWatchdog.control = "stop"
    if pl.animated and m.frontKey <> ""
        startTransition(pl.transition, pl.slotKey, pl.index)
    else
        entry.slot.visible = true
        finalizeSwap(pl.slotKey, pl.index)
    end if
end sub

sub finalizeSwap(newKey as string, index as integer)
    ' content is on screen: from here the channel must read as "playing"
    keepAliveEnsureRunning()
    old = frontEntry()
    if old <> invalid and m.frontKey <> newKey
        old.slot.visible = false
        clearOverlays(old.overlays)
        clearOverlays(old.under)
        resetSlotTransforms(old.slot)
        ' keep the poster only if some current page still shows these
        ' pixels (the two-page rotation reuses it on the next turn);
        ' anything stale is released so its texture can be reclaimed
        releaseStale(old)
    end if
    m.frontKey = newKey
    entry = m.slots[newKey]
    resetSlotTransforms(entry.slot)
    entry.slot.visible = true
    m.pairingGroup.visible = false
    m.pageIndex = index
    ' actionable items belong to the page on screen
    pg = m.pages[index]
    m.interaction.pageIndex = index
    if pg.targets <> invalid
        m.interaction.targets = pg.targets
    else
        m.interaction.targets = {}
    end if
    if pg.regions <> invalid
        m.interaction.regions = pg.regions
    else
        m.interaction.regions = []
    end if
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

' Put the spinner on the thing that is actually changing. A calendar
' swipe only alters that widget, so a spinner in the middle of the screen
' points at nothing - the portal shows it on the widget too.
sub placeSpinner()
    cx = 960
    cy = 540
    at = m.interaction.busyAt
    if at <> invalid and at.Count() = 2
        cx = at[0]
        cy = at[1]
    end if
    m.spinnerPoster.translation = [cx - 40, cy - 40]
end sub

sub startSpinner()
    if m.spinAnim <> invalid then return ' already spinning
    placeSpinner()
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
    m.interaction.busyAt = []
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
        back.translation = [m.canvasW, 0]
        addVec(a, bid + ".translation", [[m.canvasW, 0], [0, 0]])
    else if name = "slideright"
        back.translation = [-m.canvasW, 0]
        addVec(a, bid + ".translation", [[-m.canvasW, 0], [0, 0]])
    else if name = "slideup"
        back.translation = [0, m.canvasH]
        addVec(a, bid + ".translation", [[0, m.canvasH], [0, 0]])
    else if name = "slidedown"
        back.translation = [0, -m.canvasH]
        addVec(a, bid + ".translation", [[0, -m.canvasH], [0, 0]])
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

' Visual overlays are display-wide and long-running, so they are only
' rebuilt when the effect set actually changes - otherwise every render
' would restart the balloons mid-flight.
sub applyEffects(effects as object)
    ' fingerprint the whole config, not just the effect names: tuning
    ' changes (sprite art, sizes, counts) must rebuild too
    key = ""
    if effects <> invalid then key = FormatJson(effects)
    if key = m.effectsKey then return
    m.effectsKey = key
    print "[Mango] effects: "; key
    while m.effectLayer.getChildCount() > 0
        m.effectLayer.removeChildIndex(0)
    end while
    if effects = invalid then return
    for each e in effects
        compName = m.effectRegistry.Lookup(e.type)
        if compName <> invalid
            node = CreateObject("roSGNode", compName)
            ' assetBase before config: generated sprites resolve against it
            if node.hasField("assetBase") then node.assetBase = m.assetBaseUrl
            ' effects spawn and travel against the canvas, not the screen
            e.canvasW = m.canvasW
            e.canvasH = m.canvasH
            node.config = e
            m.effectLayer.appendChild(node)
        end if
    end for
end sub

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
            ov.canvasW = m.canvasW
            ov.canvasH = m.canvasH
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
    ' releases matter: holding an arrow glides the pointer, so the layer
    ' needs to know when the key comes back up
    if not press
        if m.pages <> invalid and (key = "up" or key = "down" or key = "left" or key = "right")
            m.interaction.keyRelease = key
            return true
        end if
        return false
    end if
    if key = "options"
        if m.task <> invalid then m.task.control = "STOP"
        m.deviceCode = getOrCreateCode(true)
        startPairing()
        return true
    end if
    ' D-pad and OK drive the interaction pointer (only once paired)
    if m.pages <> invalid and (key = "up" or key = "down" or key = "left" or key = "right" or key = "OK")
        m.interaction.keyPress = key
        return true
    end if
    return false
end function

' --- celebrations ----------------------------------------------------
' The portal's confetti, natively: a burst at the checked box; when a
' whole list completes, the volley the portal calls fireWorkConfetti -
' bursts from the left and right bands, staggered. The painted portal
' suppresses its own canvas confetti so none is ever baked into a
' capture; the TV is the only one celebrating.
sub onCelebrate()
    c = m.interaction.celebrate
    if c = invalid or c.kind = invalid then return
    if c.kind = "finale"
        playFinale(Int(c.x), Int(c.y))
    else
        spawnBurst(Int(c.x), Int(c.y), 380, 0)
    end if
end sub

sub playFinale(cx as integer, cy as integer)
    for i = 0 to 5
        side = i mod 2
        x = Rnd(0) * 380 + 190                  ' left band ~190-570
        if side = 1 then x = m.canvasW - (Rnd(0) * 380 + 190)
        y = Rnd(0) * 430 + 55                   ' upper half
        spawnBurst(Int(x), Int(y), 560, i * 210)
    end for
    ' and one on the box itself so the press is answered instantly
    spawnBurst(cx, cy, 380, 0)
end sub

sub spawnBurst(x as integer, y as integer, size as integer, delayMs as integer)
    b = m.celebrationLayer.createChild("CelebrationBurst")
    b.observeField("done", "onBurstDone")
    b.config = { x: x, y: y, size: size, delayMs: delayMs }
end sub

sub onBurstDone(ev as object)
    n = ev.GetRoSGNode()
    if n <> invalid then m.celebrationLayer.RemoveChild(n)
end sub

' --- idle keep-alive -------------------------------------------------
' While content is up, looping the bundled silent clip makes the OS see
' an actively playing channel, which is the only way (short of remote
' presses) to stop the ~2h idle force-close. Started from finalizeSwap,
' stopped by startPairing. See MainScene.xml for why the node must stay
' the scene's FIRST child.
sub keepAliveEnsureRunning()
    state = m.idleKeepAlive.state
    if state = "playing" or state = "buffering" then return
    clip = CreateObject("roSGNode", "ContentNode")
    clip.url = "pkg:/media/silent_loop.mp4"
    clip.streamFormat = "mp4"
    m.idleKeepAlive.content = clip
    m.idleKeepAlive.control = "play"
    print "[Mango] idle keep-alive: play requested (was "; state; ")"
end sub

sub onIdleKeepAliveState()
    ' the console trail is the proof the mechanism runs - its first
    ' incarnation failed with no visible symptom at all
    print "[Mango] idle keep-alive: "; m.idleKeepAlive.state
    ' loop=true should make both of these unreachable; restart only while
    ' content is up, so the deliberate stop on pairing stays stopped
    if m.idleKeepAlive.state = "finished" or m.idleKeepAlive.state = "error"
        if m.pages <> invalid then m.idleKeepAlive.control = "play"
    end if
end sub

' Why did the previous run of this app end? Roku OS 13+ records it
' (crash, low-memory kill, idle auto-exit, user exit) and hands it to
' the NEXT launch - there is no shutdown hook to save anything in, so
' asking afterwards is the only reliable way. Returns a ready-to-append
' query fragment, or "" when the OS has nothing recorded.
function lastExitQuery() as string
    appMgr = CreateObject("roAppManager")
    if appMgr = invalid then return ""
    if FindMemberFunction(appMgr, "GetLastExitInfo") = invalid then return ""
    info = appMgr.GetLastExitInfo()
    if info = invalid then return ""
    q = ""
    if info.exit_code <> invalid
        q = q + "&lastexit=" + sanitizeParam(info.exit_code)
    end if
    if info.timestamp <> invalid
        q = q + "&lastexitat=" + sanitizeParam(info.timestamp)
    end if
    if q <> "" then print "[Mango] previous session exit: "; q
    return q
end function

' query-safe subset only; anything else becomes an underscore
function sanitizeParam(v as dynamic) as string
    s = ""
    if type(v) = "roString" or type(v) = "String"
        s = v
    else if v <> invalid
        s = v.ToStr()
    end if
    out = ""
    for i = 1 to Len(s)
        c = Mid(s, i, 1)
        ok = (c >= "0" and c <= "9") or (c >= "A" and c <= "Z") or (c >= "a" and c <= "z")
        if ok = false then ok = (c = "_" or c = "-" or c = "." or c = ":")
        if ok
            out = out + c
        else
            out = out + "_"
        end if
    end for
    if Len(out) > 64 then out = Left(out, 64)
    return out
end function
