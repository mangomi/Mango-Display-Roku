// Environment configuration - the Echo Show analogue of source/env.brs
// and tvos/MangoDisplayTV/Env.swift.
//
// Same posture as the TV clients: the checked-in default is ALWAYS test,
// so a naive deploy can never touch production. Production is selected
// only by the Lambda's MANGO_ENV=production environment variable, set on
// the production skill's function and nowhere else.
//
// Codes registered on one backend can only be claimed from the matching
// webapp, and the control endpoint must serve the same environment the
// device paired against. The control names route by HOST HEADER - the
// hostname is the contract, never the balancer's address.

const ENVS = {
  test: {
    name: "test",
    // device-facing API version - what Tizen, Roku and tvOS speak
    apiBase: "https://testapi.mangomirror.com/v1.0.5/",
    // shown on the pairing screen - where the user claims the code
    setupHost: "testapp.mangodisplay.com",
    // the render service control endpoint (render-service/fleet.js)
    controlBase: "https://roku-control-test.mangodisplay.com",
    // the screen's code package (apl-package.js)
    aplPackageBase: "https://rokuassets.mangodisplay.com/test/echo/apl/",
  },
  production: {
    name: "production",
    apiBase: "https://api.mangomirror.com/v1.0.5/",
    setupHost: "app.mangodisplay.com",
    controlBase: "https://roku-control.mangodisplay.com",
    aplPackageBase: "https://rokuassets.mangodisplay.com/prod/echo/apl/",
  },
};

module.exports = ENVS[process.env.MANGO_ENV === "production" ? "production" : "test"];
