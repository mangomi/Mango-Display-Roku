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
    // "Mango Display Test" on the company developer account
    skillId: "amzn1.ask.skill.9d53ff8a-88ee-48c1-bb87-3c8b9427918f",
    // the old test skill on a personal account, until Dave's Echo has the
    // new one; nothing that ships uses it
    alsoAccepts: ["amzn1.ask.skill.ccb7fdb4-ecce-462b-965b-f01016ff42b8"],
  },
  production: {
    name: "production",
    apiBase: "https://api.mangomirror.com/v1.0.5/",
    setupHost: "app.mangodisplay.com",
    controlBase: "https://roku-control.mangodisplay.com",
    aplPackageBase: "https://rokuassets.mangodisplay.com/prod/echo/apl/",
    // "Mango Display" on the company developer account, the public skill
    skillId: "amzn1.ask.skill.117359b3-7ca0-4ca7-929f-c748c96fe8b9",
    alsoAccepts: [],
  },
};

module.exports = ENVS[process.env.MANGO_ENV === "production" ? "production" : "test"];
