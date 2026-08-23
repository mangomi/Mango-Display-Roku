# TEMPORARY — delete when Mangomirror-Portal PR #68 merges

These are the painted-mode portal files from that PR, vendored so the
render service can serve them into the live portal before they are
deployed. `livePortal.js` serves them by request interception, so the
page still loads from the real portal origin (its API, socket and cookies
behave normally) with only these two files replaced.

When #68 is merged and deployed:

1. drop `PORTAL_PREVIEW_DIR` from the task definition
2. delete this directory
3. delete the `PREVIEW_DIR` block in `render-service/livePortal.js`

Until then the service REFUSES to start a painted display without these,
rather than silently running the deployed portal — which has no painted
mode and would look healthy while never signalling.
