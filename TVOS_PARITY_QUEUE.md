# tvOS parity queue — running trace for the Apple TV agent

Maintained by the server-side session (Dave's ask, 2026-08-28): every
change landing after the tvOS app's build that NEEDS (or should be
verified against) Apple TV client-side work, curated as behavior, not
diffs. Complements `tvos/PARITY.md`'s commit-diff workflow — that finds
everything mechanically; this file says which of it matters and why.

Hand this file to the tvOS agent when Dave says so. Items get checked
off there, not deleted here.

## REQUIRED — new client behavior

- [ ] **`manifest.showPage` — jump to the page being edited**
  (Roku commits `b0c3f90`, `29daa64`). A layout edit in the webapp now
  navigates the portal to the edited page, and the published
  `display.json` carries a top-level `showPage` (integer page index)
  on every publish inside a ~15s window after the edit. On applying a
  manifest: if `showPage` is present, in range, and differs from the
  page currently shown → transition to it (animated, like a manual
  page turn) and restart that page's rotation dwell. Same page or out
  of range → normal in-place refresh. Repeats inside the window are
  idempotent (only jump when different). Roku reference:
  `components/MainScene.brs` `maybeApplyPages`.

## VERIFY — server behavior changed; client likely fine as built

- [ ] **Two popup entries can share one sprite sheet** (firework runs
  two concurrent players, `8d01b6d`): the effects array may contain
  multiple `popup` entries whose `stripFile` is the same file with
  different `dwellMsRange`. One player node per ENTRY, fetch/decode
  the shared sheet once.
- [ ] **Layout edits now arrive fast and page-targeted** (`5fcdbe5`,
  `d0c5763`, `ea6d385`): no client change — they land as ordinary
  version bumps (~4s after a webapp edit) — but expect much more
  frequent single-page updates than the old restart-display cadence.
- [ ] **`imageOnly` may be promoted to full** when an interaction
  changes a page's overlay set (`4e88eb6`, e.g. calendar scrolled off
  the 10-day weather window): the client must rebuild that page's
  overlays on a full manifest even mid-gesture. If the tvOS gesture
  path assumes swipe answers are always imageOnly, revisit.

## DONE by the tvOS session already (listed for the record)

- [x] Calendar cell-weather overlays (`overlay_cw_*` gif entries,
  mixed per-entry frameMs) — tvOS verified 2026-08-27.
- [x] Content-hashed sheet filenames / cache eviction — tvOS commit
  `2937646` predates and covers it.
- [x] Celebrations burst + finale — tvOS Phase B chunk 5.

## NO client impact (noted so nobody re-checks)

- Assets moved R2 → S3+CloudFront (`81d5eb3`, `2a8769a`): clients
  follow `assetBase` from display.json; r2.dev URLs are gone, Roku
  needed no change and neither does tvOS. Page images now carry
  `Cache-Control: no-cache` (served via CloudFront revalidation) —
  only matters if a client caches by URL ignoring headers AND ignores
  `imageHash`; the tvOS ImageCache keys on hash, so fine.
- Weather icon / cell-weather / rain-drop filming fixes (`a9e91c4`,
  `7244211`, `96011e8`, `fcbe2fb`): sheet CONTENT quality only.
- Effect-tiles capture fix, weather settle, portal console piping,
  layout-signal portal hooks: all server/portal-side.

*Baseline context: tvOS parity marker sits at Roku `56392b2`; this
queue covers everything after it. Last updated: 2026-08-28 (showPage).*
