' Sends one gesture to the render service. Network calls can't run on the
' render thread, so every press goes through this Task.

sub init()
    m.top.functionName = "runInteract"
end sub

sub runInteract()
    url = m.top.serviceBase + "/interact?type=" + m.top.kind + "&page=" + m.top.pageIndex.ToStr() + "&x=" + Int(m.top.x).ToStr() + "&y=" + Int(m.top.y).ToStr() + "&id=" + m.top.targetId + m.top.identity
    req = CreateObject("roUrlTransfer")
    ' https control endpoint: TLS needs the CA bundle per transfer object
    req.SetCertificatesFile("common:/certs/ca-bundle.crt")
    req.InitClientCertificates()
    port = CreateObject("roMessagePort")
    req.SetMessagePort(port)
    req.SetUrl(url)
    if not req.AsyncGetToString() then return
    ' a tap re-renders the page in the live session, so allow for that
    msg = wait(45000, port)
    if type(msg) = "roUrlEvent"
        if msg.GetResponseCode() <> 200
            print "[Mango] interact "; m.top.kind; " failed: HTTP "; msg.GetResponseCode()
        end if
    else
        req.AsyncCancel()
        print "[Mango] interact "; m.top.kind; " timed out"
    end if
end sub
