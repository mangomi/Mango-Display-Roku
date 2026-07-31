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
    m.imageA = m.top.findNode("imageA")
    m.imageB = m.top.findNode("imageB")
    m.refreshTimer = m.top.findNode("refreshTimer")
    m.top.findNode("instructionsLabel").text = "Setup at " + m.env.setupHost + " using any browser"

    ' Rendered by render-service (watch.js re-renders on socket pushes);
    ' production swaps this for a CDN URL from a manifest
    m.imageBaseUrl = "http://10.0.0.74:8090/display.jpg"

    m.imageA.observeField("loadStatus", "onPosterLoad")
    m.imageB.observeField("loadStatus", "onPosterLoad")
    m.refreshTimer.observeField("fire", "onRefreshTick")
    m.frontId = ""

    ' The code is generated on the render thread and put on screen
    ' synchronously, before the pairing task starts — the task only
    ' consumes it
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
    m.frontId = ""
    m.imageA.visible = false
    m.imageB.visible = false
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
    print "[Mango] paired (major "; r.major; " minor "; r.minor; "), starting image loop"
    ' the timer doubles as the retry loop if the first fetch fails
    m.refreshTimer.control = "start"
    loadFreshImage()
end sub

' the poster that is NOT currently showing
function backPoster() as object
    if m.frontId = "imageA"
        return m.imageB
    end if
    return m.imageA
end function

sub loadFreshImage()
    ts = CreateObject("roDateTime").AsSeconds().ToStr()
    backPoster().uri = m.imageBaseUrl + "?t=" + ts
end sub

sub onRefreshTick()
    loadFreshImage()
end sub

sub onPosterLoad(ev as object)
    node = ev.getRoSGNode()
    if node.id = m.frontId then return
    status = node.loadStatus
    if status = "ready"
        node.visible = true
        if m.frontId = "imageA"
            m.imageA.visible = false
        else if m.frontId = "imageB"
            m.imageB.visible = false
        end if
        m.frontId = node.id
        m.pairingGroup.visible = false
    else if status = "failed"
        print "[Mango] image load failed: "; node.uri
    end if
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
