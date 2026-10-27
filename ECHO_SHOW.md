# Echo Show — Alexa skill (version 1)

**Status (2026-10-26):** V1 code in `echo-show/`. Pairing verified against
the test backend from a local run; the skill is not yet deployed to Alexa
and has not run on an Echo.

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
| Device code | `RK…` / `ATV…` + 9 digits 1–9, kept on the device | **`ET` + 9 digits 1–9**, kept in DynamoDB keyed by the Alexa device id (the Echo runs no code of ours and has no storage) |
| Pairing | loop: `mirrors/deviceId/{code}` every 5s, `saveMirror` once if unknown | same calls, one iteration per request; the pairing screen's APL `handleTick` sends a UserEvent every 5s |
| Updates | `/wait` long-poll held 50s | Lambda cannot hold one, so `/wait?since=-1` (answers at once, manifest inline) and a 60s `/version` check from the display screen's tick |
| Clock | device composes the time from manifest values every 5s | the manifest's rules become APL expressions over `utcTime + tzOffset`; the Echo re-evaluates them itself, no request per minute |

## Files

```
echo-show/
  lambda/index.js      request handler: launch, UserEvents (pair / loading / refresh)
  lambda/identity.js   ET code per Echo (DynamoDB, or memory for local runs)
  lambda/backend.js    pairing step, /wait and /version against the render service
  lambda/clock.js      manifest clock -> APL Text with live time/date expressions
  lambda/apl.js        pairing and display screens; canvas -> viewport scaling
  lambda/env.js        test by default; MANGO_ENV=production on the prod function only
  skill-package/       skill manifest + interaction model ("Alexa, open Mango Display")
  tools/try-skill.js   run the handler locally as an Echo Show 15
```

`cd echo-show/lambda && npm test` runs the unit tests (code format, clock
composition).

## Running it locally

```
node echo-show/tools/try-skill.js --out /tmp/echo --ticks 3            # mint + register a new ET code
node echo-show/tools/try-skill.js --code ET745724581 --out /tmp/echo   # resume as that Echo
```

Each screen's APL document is written to `--out`; paste it into the APL
authoring tool (developer console → Build → Multimodal Responses) to see
it. Test code from the first run: **ET745724581** (registered on test
2026-10-26).

## Deploying to a real Echo Show (test)

1. **DynamoDB** table `mango-display-echo-devices`, partition key
   `alexaDeviceId` (String), on-demand.
2. **Lambda** `mango-display-echo-test`, Node.js 20, handler
   `index.handler`, timeout 8s, code = `echo-show/lambda/` zipped. Env:
   `DEVICE_TABLE=mango-display-echo-devices` (optional
   `LOGO_URL=<public https png>` for the logo; without it the pairing
   screen shows a "Mango Display" wordmark). Role needs
   `dynamodb:GetItem`/`PutItem` on the table.
3. **Skill** in the Alexa developer console (the Amazon account the
   Echo is signed into): custom skill, own-provisioned backend. Paste
   `skill-package/skill.json` (put the Lambda ARN in `endpoint.uri`) and
   `interactionModels/custom/en-US.json`; enable the **Alexa
   Presentation Language** interface; build.
4. On the Lambda, add an **Alexa Skills Kit** trigger restricted to the
   skill id.
5. Developer console → Test → enable testing in **Development**. On the
   Echo Show: "Alexa, open Mango Display". The code appears; claim it
   at testapp.mangodisplay.com.

Logs: CloudWatch, every line prefixed `[Mango]` as on the TVs.

## Open items / risks to check on hardware

- **Screen timeout.** The session is kept open (no `shouldEndSession`)
  and the screen ticks, but Alexa may still close a skill's screen after
  a while. That is the main thing to measure on a real Echo; the home-screen
  widget is the fallback for always-on.
- **Server-side:** the test fleet's `PAINTED_DISPLAYS` should get an
  `ET` entry, like `RK` and `ATV`. Without it an ET display runs on the
  original (impersonation) pipeline.
- **Fonts:** APL cannot load the manifest's Google Fonts, so the clock
  uses the Echo's system font at the measured size.
- **Layered pages:** a PNG page with a `background` overlay behind it
  shows over black in V1 (backgrounds are not drawn yet).
- **Rotation:** `rotation` ≠ 0 is not applied yet. A portrait-mounted
  Echo Show 15 reports a portrait viewport, so it registers with portrait
  dimensions and should not need it.
- Next: touch (manifest `targets` → APL TouchWrapper → `/interact`),
  page rotation, gif/slideshow overlays, effects.
