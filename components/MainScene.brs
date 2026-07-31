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
    m.displayImage = m.top.findNode("displayImage")
    m.top.findNode("instructionsLabel").text = "Setup at " + m.env.setupHost + " using any browser"

    ' Placeholder until the server-side render pipeline exists. Swap for a
    ' per-display rendered page URL in the next phase.
    m.testImageUrl = "https://picsum.photos/id/1015/1920/1080.jpg"

    m.displayImage.observeField("loadStatus", "onImageLoad")

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
    m.displayImage.visible = false
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
    print "[Mango] paired (major "; r.major; " minor "; r.minor; "), loading image"
    m.displayImage.uri = m.testImageUrl
end sub

sub onImageLoad()
    status = m.displayImage.loadStatus
    if status = "ready"
        m.pairingGroup.visible = false
        m.displayImage.visible = true
    else if status = "failed"
        print "[Mango] test image failed to load: "; m.displayImage.uri
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
