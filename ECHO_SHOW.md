# Echo Show — Alexa skill (version 1)

**Status (2026-10-27):** V1 code in `echo-show/`. Verified end to end from
a local run against test: ET745724581 registered, claimed by Dave
(major 1 / minor 822), "Connected" for ~15s while the fleet booted it,
then the page with its background and live clock. Since then the code is
derived from the Alexa device and user ids instead of stored (no
database), so the local fake Echo's code is now **ET218914363**
(registered on test, not claimed); ET745724581, ET871919413 and
ET224532747 are orphaned test records. Not yet deployed to
Alexa; has not run on an Echo.

V1 scope, as asked by Dave: **register the device, then show the
display's clock widget.** No touch, effects, gifs, slideshows or page
rotation yet.

## Why a skill, and how it maps onto the TV clients

The Echo Show browser (Silk) is too clumsy for an always-on display, and
Fire TV apps on the Show have no touch and no portrait. A custom Alexa
skill draws with APL (Alexa Presentation Language), which has touch and
follows the screen's orientation.

The skill is a third thin client of the same render service, like Roku
and tvOS (`LIVE_PORTAL.md`, `MANIFEST.md`). Nothing server-side is new:

| | Roku / Apple TV | Echo Show |
|---|---|---|
| Device code | `RK…` / `ATV…` + 9 digits 1–9, kept on the device | **`ET` + 9 digits 1–9**, derived from a hash of the Alexa device id + user id (the Echo has no storage of ours). Same on every launch; **disabling and re-enabling the skill rerolls it**, because Amazon issues a new user id then |
| Pairing | loop: `mirrors/deviceId/{code}` every 5s, `saveMirror` once if unknown | same calls, one iteration per request; the pairing screen's APL `handleTick` sends a UserEvent every 5s |
| Updates | `/wait` long-poll held 50s | Lambda cannot hold one, so `/wait?since=-1` (answers at once, manifest inline) and a 60s `/version` check from the display screen's tick |
| Clock | device composes the time from manifest values every 5s | the manifest's rules become APL expressions over `utcTime + tzOffset`; the Echo re-evaluates them itself, no request per minute |

## Files

```
echo-show/
  lambda/index.js      request handler: launch, UserEvents (pair / loading / refresh)
  lambda/identity.js   ET code per Echo, derived from the Alexa device + user ids
  lambda/backend.js    pairing step, /wait and /version against the render service
  lambda/clock.js      manifest clock -> APL Text with live time/date expressions
  lambda/apl.js        pairing and display screens; canvas -> viewport scaling
  lambda/env.js        test by default; MANGO_ENV=production on the prod function only
  skill-package/       skill manifest + interaction model ("Alexa, open Mango Display")
  tools/try-skill.js   run the handler locally as an Echo Show 15
  tools/preview-apl.js rough HTML preview of a screen try-skill.js wrote
```

`cd echo-show/lambda && npm test` runs the unit tests (code format, clock
composition).

## Running it locally

```
node echo-show/tools/try-skill.js --out /tmp/echo --ticks 3                  # the fake Echo (ET218914363)
node echo-show/tools/try-skill.js --device amzn1.ask.device.X --out /tmp/echo  # a different Echo, new code
node echo-show/tools/try-skill.js --user amzn1.ask.account.X --out /tmp/echo   # skill re-enabled, new code
```

Each screen's APL document is written to `--out`;
`node echo-show/tools/preview-apl.js <out>/apl-display.json > p.html` turns
one into a rough HTML preview (clock expressions evaluated). For the real
renderer, paste the JSON into the APL authoring tool (developer console →
Build → Multimodal Responses).

## Deployed (test) - 2026-10-27

| Resource | Name |
|---|---|
| Lambda | `arn:aws:lambda:us-east-1:945710099949:function:echo-show-app-test` (Node.js 22, arm64, 256 MB, 8s) |
| IAM role | `echo-show-app-test-lambda` (AWSLambdaBasicExecutionRole only) |
| Log group | `/aws/lambda/echo-show-app-test` (14 days) |

All tagged `Project=echo show app`, `Environment=test`,
`Purpose=Mango Display Alexa skill for Echo Show`. Smoke-tested by a
direct invoke: pairing screen in ~1s. Redeploy after a code change:

```
cd echo-show/lambda && zip -q -r /tmp/lambda.zip index.js env.js identity.js backend.js clock.js apl.js package.json
aws lambda update-function-code --region us-east-1 --function-name echo-show-app-test --zip-file fileb:///tmp/lambda.zip
```

Remove everything: delete the function, the log group, detach the policy
and delete the role (and the skill in the developer console).

## Stay-awake test (go/no-go before building more)

The display screen runs a heartbeat that waits 10s holding `screenLock`
(pauses the screen's inactivity timer), then asks the skill for updates;
every event is logged as `[Mango] event ... session=...`. Pass if, with
nobody touching the Echo:

- after 1h, 8h and 24h the display is still on screen and the log shows
  events every ~10s throughout (including after Alexa closes the first
  session - watch for `(new)` sessions or `session ended` lines);
- a calendar edit in the webapp appears within ~10s;
- (Echo Show 15) rotating it redraws full-screen for the new orientation.

## Deploying to a real Echo Show (test)

AWS account 945710099949, us-east-1. Every resource tagged
`Project=echo show app`, `Environment=test`,
`Purpose=Mango Display Alexa skill for Echo Show`.

1. **IAM role** `echo-show-app-test-lambda`: Lambda trust, logs only
   (AWSLambdaBasicExecutionRole).
2. **Log group** `/aws/lambda/echo-show-app-test`, 14-day retention.
3. **Lambda** `echo-show-app-test`, Node.js 22, 256 MB, handler
   `index.handler`, timeout 8s, code = `echo-show/lambda/` zipped (no
   dependencies). Optional env `LOGO_URL=<public https png>` for the logo;
   without it the pairing screen shows a "Mango Display" wordmark.
4. **Skill** in the Alexa developer console (the Amazon account the
   Echo is signed into): custom skill, own-provisioned backend. Paste
   `skill-package/skill.json` (put the Lambda ARN in `endpoint.uri`) and
   `interactionModels/custom/en-US.json`; enable the **Alexa
   Presentation Language** interface; build.
5. On the Lambda, add an **Alexa Skills Kit** trigger restricted to the
   skill id.
6. Developer console → Test → enable testing in **Development**. On the
   Echo Show: "Alexa, open Mango Display". The code appears; claim it
   at testapp.mangodisplay.com.

Logs: CloudWatch, every line prefixed `[Mango]` as on the TVs.

Cost: about $0/month while testing (Lambda free tier). The render
service share stays under `Project=Roku` - it is shared.

## Open items / risks to check on hardware

- **Shared codes:** 9 digits 1-9 is 387M codes. Like the random Roku and
  tvOS codes, N displays share one with odds ~N²/774M (about 1 in 800 at
  1,000 Echos, ~13 pairs at 100,000). Same exposure as the other
  platforms today. The way out is the same as a reinstall: disable and
  re-enable the skill, which rerolls the code.
- **Verify on hardware** that re-enabling the skill really changes the
  code (Amazon documents a new user id on re-enable) and that an
  ordinary relaunch keeps it.

- **Screen timeout.** The session is kept open (no `shouldEndSession`)
  and the screen ticks, but Alexa may still close a skill's screen after
  a while. That is the main thing to measure on a real Echo; the home-screen
  widget is the fallback for always-on.
- **Server-side:** the test fleet's `PAINTED_DISPLAYS` should get an
  `ET` entry, like `RK` and `ATV`. Without it an ET display runs on the
  original (impersonation) pipeline.
- **Fonts:** APL cannot load the manifest's Google Fonts, so the clock
  uses the Echo's system font at the measured size.
- **Backgrounds:** a layered page's `background` shows its FIRST photo,
  still (brightness and pageColor honored); rotating through the rest
  comes with slideshows.
- **Not drawn yet:** `gif` (weather icons, animated cells), `slideshow`,
  `countdown`, `scroll`, `motion` overlays and effects - their spots on
  the page are empty.
- **Rotation:** `rotation` ≠ 0 is not applied yet. A portrait-mounted
  Echo Show 15 reports a portrait viewport, so it registers with portrait
  dimensions and should not need it.
- Next: touch (manifest `targets` → APL TouchWrapper → `/interact`),
  page rotation, gif/slideshow overlays, effects.
