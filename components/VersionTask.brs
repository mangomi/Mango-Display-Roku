' Long-polls the render service: GET {waitUrl}/wait?since=N is held open by
' the server until a newer render exists (or ~50s pass), so the scene hears
' about fresh images within ~1s of the render finishing. The scene's slow
' refresh Timer stays on as the fallback if this loop can't connect.

sub init()
    m.top.functionName = "runVersionLoop"
end sub

sub fetchManifest(ver as integer)
    url = m.top.manifestUrl
    if url = "" then return
    req = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    req.SetMessagePort(port)
    req.SetUrl(url + "?t=" + ver.ToStr())
    if not req.AsyncGetToString() then return
    msg = wait(8000, port)
    if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
        json = ParseJson(msg.GetString())
        if json <> invalid and GetInterface(json, "ifAssociativeArray") <> invalid
            m.top.manifest = json
            return
        end if
    else
        req.AsyncCancel()
    end if
    print "[Mango] manifest fetch failed"
end sub

' A long-poll connection can die silently (service restart, NAT drop):
' the server writes into a dead socket and the TV waits on nothing. This
' plain GET runs when the loop has been quiet for a while, so a wedged
' connection can never leave the display stale for long.
function heartbeatCheck(base as string, ver as integer) as dynamic
    req = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    req.SetMessagePort(port)
    req.SetUrl(base + "/version")
    if not req.AsyncGetToString() then return invalid
    msg = wait(8000, port)
    if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
        json = ParseJson(msg.GetString())
        if json <> invalid and json.version <> invalid then return Int(json.version)
    else
        req.AsyncCancel()
    end if
    return invalid
end function

sub runVersionLoop()
    base = m.top.waitUrl
    print "[Mango] version long-poll: "; base
    ver = 0
    while true
        req = CreateObject("roUrlTransfer")
        port = CreateObject("roMessagePort")
        req.SetMessagePort(port)
        ' report the busy state we currently believe: the server replies
        ' immediately when it disagrees, so a missed transition (we are
        ' offline while fetching the manifest and images) self-corrects
        bp = "0"
        if m.top.busy then bp = "1"
        req.SetUrl(base + "/wait?since=" + ver.ToStr() + "&busy=" + bp)
        if req.AsyncGetToString()
            ' server holds up to 50s; give it 55 then re-arm
            msg = wait(55000, port)
            if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
                json = ParseJson(msg.GetString())
                ' busy updates on every reply, including same-version ones
                ' (the server flushes waiters when a user edit starts)
                if json <> invalid and GetInterface(json, "ifAssociativeArray") <> invalid
                    b = false
                    if json.busy <> invalid and json.busy = true then b = true
                    if m.top.busy <> b then m.top.busy = b
                end if
                if json <> invalid and GetInterface(json, "ifAssociativeArray") <> invalid and json.version <> invalid
                    v = Int(json.version)
                    ' any CHANGE is an update, not just a higher number: a
                    ' restarted render service can come back with a lower
                    ' version, and requiring ">" left the TV deaf until it
                    ' was reinstalled
                    if v <> ver
                        ver = v
                        print "[Mango] new render version: "; ver
                        ' manifest first, so it's readable when version fires
                        fetchManifest(ver)
                        m.top.version = ver
                    end if
                end if
            else
                req.AsyncCancel()
                print "[Mango] version wait failed, checking directly"
                hb = heartbeatCheck(base, ver)
                if hb <> invalid and hb <> ver
                    ver = hb
                    print "[Mango] heartbeat found version: "; ver
                    fetchManifest(ver)
                    m.top.version = ver
                end if
                sleep(5000)
            end if
        else
            sleep(5000)
        end if
        sleep(250)
    end while
end sub
