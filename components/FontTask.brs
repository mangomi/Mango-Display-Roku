sub init()
    m.top.functionName = "fetchFonts"
end sub

sub fetchFonts()
    fs = CreateObject("roFileSystem")
    base = m.top.base
    files = m.top.files
    if files = invalid then files = []
    ready = []
    for each f in files
        dest = rokuFontCachePath(f)
        if fs.Exists(dest)
            ready.push(f)
            continue for
        end if
        req = CreateObject("roUrlTransfer")
        req.SetCertificatesFile("common:/certs/ca-bundle.crt")
        req.InitClientCertificates()
        port = CreateObject("roMessagePort")
        req.SetMessagePort(port)
        req.SetUrl(base + f)
        tmp = dest + ".part"
        ok = false
        if req.AsyncGetToFile(tmp)
            msg = wait(15000, port)
            if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
                ok = fs.Rename(tmp, dest)
            else
                req.AsyncCancel()
            end if
        end if
        if ok
            ready.push(f)
            print "[Mango] font fetched: "; f
        else
            fs.Delete(tmp)
            print "[Mango] font fetch failed: "; f; " (falls back to Source Sans Pro)"
        end if
    end for
    m.top.ready = ready
    m.top.done = true
end sub
