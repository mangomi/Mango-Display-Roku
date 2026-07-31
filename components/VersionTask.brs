' Long-polls the render service: GET {waitUrl}/wait?since=N is held open by
' the server until a newer render exists (or ~50s pass), so the scene hears
' about fresh images within ~1s of the render finishing. The scene's slow
' refresh Timer stays on as the fallback if this loop can't connect.

sub init()
    m.top.functionName = "runVersionLoop"
end sub

sub runVersionLoop()
    base = m.top.waitUrl
    print "[Mango] version long-poll: "; base
    ver = 0
    while true
        req = CreateObject("roUrlTransfer")
        port = CreateObject("roMessagePort")
        req.SetMessagePort(port)
        req.SetUrl(base + "/wait?since=" + ver.ToStr())
        if req.AsyncGetToString()
            ' server holds up to 50s; give it 55 then re-arm
            msg = wait(55000, port)
            if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
                json = ParseJson(msg.GetString())
                if json <> invalid and GetInterface(json, "ifAssociativeArray") <> invalid and json.version <> invalid
                    v = Int(json.version)
                    if v > ver
                        ver = v
                        print "[Mango] new render version: "; ver
                        m.top.version = ver
                    end if
                end if
            else
                req.AsyncCancel()
                print "[Mango] version wait failed, retrying in 5s"
                sleep(5000)
            end if
        else
            sleep(5000)
        end if
        sleep(250)
    end while
end sub
