' Roku port of the Tizen registration flow (Mango-Display-Tizen index.html).
' The scene generates the device code and passes it in via m.top.code;
' this task only talks to the backend:
'  1. poll GET mirrors/deviceId/{code} every 5s
'  2. if the device is unknown, self-register via POST mirrors/saveMirror
'  3. when the user claims the code in the webapp, isActive flips true and
'     the response carries major/minor -> report them and stop

sub init()
    m.top.functionName = "runPairing"
end sub

sub runPairing()
    base = m.top.apiBase
    code = m.top.code
    if base = ""
        print "[Mango] PairingTask started with no apiBase - refusing (env not injected?)"
        return
    end if
    ' what this device actually renders at (720p on low-end sticks, 1080p on
    ' most TVs) - reported so the render service can match it per display
    res = CreateObject("roDeviceInfo").GetUIResolution()
    print "[Mango] API base: "; base
    print "[Mango] display code: "; code
    print "[Mango] UI resolution: "; res.width; "x"; res.height; " ("; res.name; ")"

    registered = false
    while true
        resp = httpRequest(base + "mirrors/deviceId/" + code, invalid)
        if resp <> invalid and resp.body <> ""
            json = ParseJson(resp.body)
            if json <> invalid and GetInterface(json, "ifAssociativeArray") <> invalid
                obj = json.object
                if obj <> invalid and isTruthy(obj.isActive)
                    print "[Mango] linked! major="; obj.major; " minor="; obj.minor
                    m.top.result = { major: toS(obj.major), minor: toS(obj.minor) }
                    return
                else if obj <> invalid
                    print "[Mango] registered, waiting for claim"
                else if json.error <> invalid
                    ' the backend reports unknown devices with an error payload
                    ' ("Mirror not registered") - self-register once, retry on
                    ' failure next cycle
                    if not registered
                        print "[Mango] not registered ("; toS(json.error.message); "), calling saveMirror"
                        ' keys MUST be quoted: unquoted BrightScript AA keys
                        ' are lowercased, and the backend's JSON binding is
                        ' case-sensitive (learned the hard way - it inserted
                        ' a blank record)
                        saveResp = httpRequest(base + "mirrors/saveMirror", {
                            "deviceId": code
                            "delay": 60
                            "deviceMode": "portrait"
                            "deviceType": "Android tablet"
                            "isBeaconEnabled": false
                            "deviceWidth": res.width
                            "deviceHeight": res.height
                        })
                        if saveResp <> invalid and saveResp.status >= 200 and saveResp.status < 300
                            print "[Mango] saveMirror ok"
                            registered = true
                        else
                            print "[Mango] saveMirror failed, will retry"
                        end if
                    end if
                end if
            end if
        else
            print "[Mango] request failed"
        end if
        sleep(5000)
    end while
end sub

' GET when postJson is invalid, otherwise POST as JSON.
' Returns { status, body } or invalid on transport failure/timeout.
function httpRequest(url as string, postJson as dynamic) as object
    req = CreateObject("roUrlTransfer")
    req.SetCertificatesFile("common:/certs/ca-bundle.crt")
    req.InitClientCertificates()
    req.RetainBodyOnError(true)
    ' Standard headers a TV browser engine sends automatically - the Tizen
    ' app relies on them implicitly
    req.AddHeader("Accept", "application/json, text/plain, */*")
    req.AddHeader("Accept-Language", "en-US,en;q=0.9")
    req.AddHeader("User-Agent", "Mozilla/5.0 (SMART-TV; Linux; Roku) AppleWebKit/537.36 (KHTML, like Gecko) MangoDisplayRoku/0.1")
    port = CreateObject("roMessagePort")
    req.SetMessagePort(port)
    req.SetUrl(url)

    if postJson <> invalid
        req.AddHeader("Content-Type", "application/json")
        started = req.AsyncPostFromString(FormatJson(postJson))
    else
        started = req.AsyncGetToString()
    end if
    if not started then return invalid

    msg = wait(15000, port)
    if type(msg) = "roUrlEvent"
        return { status: msg.GetResponseCode(), body: msg.GetString() }
    end if
    req.AsyncCancel()
    return invalid
end function

function isTruthy(v as dynamic) as boolean
    if v = invalid then return false
    if GetInterface(v, "ifBoolean") <> invalid then return v
    if GetInterface(v, "ifString") <> invalid then return LCase(v) = "true"
    if GetInterface(v, "ifInt") <> invalid then return v <> 0
    return false
end function

function toS(v as dynamic) as string
    if v = invalid then return ""
    if GetInterface(v, "ifString") <> invalid then return v
    if GetInterface(v, "ifInt") <> invalid then return v.ToStr()
    if GetInterface(v, "ifFloat") <> invalid then return Str(v).Trim()
    return ""
end function
