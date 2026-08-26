// Port of components/PairingTask.brs - the backend half of pairing:
//  1. poll GET mirrors/deviceId/{code} every 5s
//  2. if the device is unknown (the backend answers with an error payload,
//     "Mirror not registered"), self-register once via POST
//     mirrors/saveMirror; retry on failure next cycle
//  3. when the user claims the code in the webapp, isActive flips true and
//     the response carries major/minor -> report them and stop

import Foundation

struct PairResult {
    let major: String
    let minor: String
}

enum Backend {
    // Standard headers a TV browser engine sends automatically - the
    // backend was built for browser clients (Tizen) and relies on them
    // implicitly. Same set the Roku sends, naming this platform.
    private static let headers = [
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (SMART-TV; Apple TV; tvOS) AppleWebKit/605.1.15 (KHTML, like Gecko) MangoDisplayTV/0.1",
    ]

    /// GET when postJson is nil, otherwise POST as JSON.
    /// Returns nil on transport failure/timeout (15s, like Roku's wait).
    private static func request(_ url: URL, postJson: [String: Any]? = nil) async -> (status: Int, body: Data)? {
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let postJson {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: postJson)
        }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse else { return nil }
        return (http.statusCode, data)
    }

    /// Runs until the display is claimed in the webapp - an unclaimed TV
    /// sits on the pairing screen polling indefinitely, exactly like Roku.
    /// Returns nil only if the task is cancelled.
    static func runPairing(code: String, screenW: Int, screenH: Int) async -> PairResult? {
        NSLog("[Mango] API base: %@", Env.apiBase.absoluteString)
        NSLog("[Mango] display code: %@", code)
        NSLog("[Mango] UI resolution: %dx%d", screenW, screenH)
        var registered = false
        while !Task.isCancelled {
            // plain string concat like the Roku client: the code is
            // alphanumeric by construction, nothing to escape
            let statusURL = URL(string: Env.apiBase.absoluteString + "mirrors/deviceId/" + code)!
            if let resp = await request(statusURL),
               let json = (try? JSONSerialization.jsonObject(with: resp.body)) as? [String: Any] {
                if let obj = JSON.obj(json["object"]) {
                    if JSON.truthy(obj["isActive"]) {
                        let r = PairResult(major: JSON.str(obj["major"]), minor: JSON.str(obj["minor"]))
                        NSLog("[Mango] linked! major=%@ minor=%@", r.major, r.minor)
                        return r
                    }
                    NSLog("[Mango] registered, waiting for claim")
                } else if json["error"] != nil, !registered {
                    NSLog("[Mango] not registered, calling saveMirror")
                    // Same payload as Roku/Tizen so the backend treats every
                    // painted TV identically. deviceType "Android tablet"
                    // included: it is what the Tizen flow registers as, and
                    // device-class behavior keys on the code PREFIX, not on
                    // this string (APPLE_TV.md §4).
                    let save = await request(URL(string: Env.apiBase.absoluteString + "mirrors/saveMirror")!, postJson: [
                        "deviceId": code,
                        "delay": 60,
                        "deviceMode": "portrait",
                        "deviceType": "Android tablet",
                        "isBeaconEnabled": false,
                        "deviceWidth": screenW,
                        "deviceHeight": screenH,
                    ])
                    if let save, (200..<300).contains(save.status) {
                        NSLog("[Mango] saveMirror ok")
                        registered = true
                    } else {
                        NSLog("[Mango] saveMirror failed, will retry")
                    }
                }
            } else {
                NSLog("[Mango] pairing request failed")
            }
            try? await Task.sleep(for: .seconds(5))
        }
        return nil
    }
}
