/*
 * A synthetic display, for load and ownership testing. TEST ONLY - the
 * fleet only builds one when SIM_DISPLAYS=1 (and refuses to start with
 * that switch on a production API base).
 *
 * It is a painted worker whose portal opens in designer mode: the same
 * layout as the "claude test" display, the same Chromium, the same
 * captures and publishes - but no socket, so hundreds of copies coexist
 * and the backend never hears from them. Designer mode also means the
 * portal announces no socket-driven changes, so the worker re-captures
 * on its own clock (SIM_RECAPTURE_MS, default 5 minutes) to stand in for
 * the weather/calendar ticks a real display gets. Assets publish under
 * the synthetic id's own prefix, exactly like a real display's.
 */
const { PaintedWorker } = require("./paintedWorker");
const { LivePortal } = require("./livePortal");

const RECAPTURE_MS = parseInt(process.env.SIM_RECAPTURE_MS || String(5 * 60 * 1000), 10);

class SimWorker extends PaintedWorker {
  constructor(opts) {
    super(opts);
    this.synthetic = true;
  }

  async start() {
    await super.start();
    this.log("synthetic display: designer portal, recapture every " + Math.round(RECAPTURE_MS / 1000) + "s");
    /* jittered so 300 of them do not all render on the same tick */
    const jitter = Math.floor(Math.random() * RECAPTURE_MS);
    this.simTimer = setTimeout(() => {
      this.simTimer = setInterval(() => {
        if (this.portal && this.portal.ready) this.queueCapture(null, "sim tick");
      }, RECAPTURE_MS);
    }, jitter);
  }

  /* the designer URL, otherwise the painted worker's own open path
   * (timezone learning included - designer pages carry the display's
   * settings just the same) */
  async openPortalOnce() {
    if (this.portal && this.portal.ready) return this.portal;
    this.portal = new LivePortal({
      portalBase: this.env.portalBase,
      major: this.display.major,
      minor: this.display.minor,
      deviceId: this.display.deviceId,
      canvasW: this.display.canvasW,
      canvasH: this.display.canvasH,
      outW: this.display.outW,
      outH: this.display.outH,
      embed: false,
      designer: true,
      timezoneId: this.savedTimezone(),
      log: (...a) => this.log(...a),
      onChange: (message) => this.onPortalChange(message),
    });
    await this.portal.open();
    this.portalOpenedAt = Date.now();
    return this.portal;
  }

  /* no timezone re-checks, no orientation refresh: a synthetic display
   * never changes its settings */
  async checkPortalTimezone() {}
  async refreshOrientation() {}

  async stop(why) {
    if (this.simTimer) {
      clearTimeout(this.simTimer);
      clearInterval(this.simTimer);
    }
    return super.stop(why);
  }
}

module.exports = { SimWorker };
