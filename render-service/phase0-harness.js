/* Phase 0 density test: how many live-portal-shaped browsers fit in one
 * Fargate task? Ramps one designer-mode portal per SEPARATE Chromium
 * (the real architecture: one browser per display) to MAX_N, sampling
 * whole-task memory/CPU from the container's own cgroup counters, then
 * holds at peak to watch for creep. Designer mode takes no socket, so N
 * copies of one display coexist; media the device would draw is blocked
 * exactly like the painted fleet does, so the browser profile matches
 * painted-mode conditions. Logs PHASE0 lines to stdout -> CloudWatch.
 */
const fs = require("fs");
const { chromium } = require("/app/render-service/node_modules/playwright");

const MAX_N = 20;
const SETTLE_MS = 90000;
const HOLD_MIN = 25;
const VCPUS = 4;
const MEM_LIMIT_MB = 8192;
const URL =
  "https://testportal.mangodisplay.com/?major=1&minor=1715&macaddress=MD4454256172&designer=true&page=0";
const BLOCKED_MEDIA = /\/visualoverlays\/|myimages\.mangodisplay\.com|\/backgrounds\//;

function readFirst(paths) {
  for (const p of paths) {
    try {
      return fs.readFileSync(p, "utf8").trim();
    } catch (e) {}
  }
  return null;
}
function memMB() {
  const v = readFirst(["/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory/memory.usage_in_bytes"]);
  return v ? Math.round(parseInt(v, 10) / 1048576) : -1;
}
function cpuUsec() {
  const v2 = readFirst(["/sys/fs/cgroup/cpu.stat"]);
  if (v2) {
    const m = v2.match(/usage_usec (\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const v1 = readFirst(["/sys/fs/cgroup/cpuacct/cpuacct.usage", "/sys/fs/cgroup/cpu/cpuacct.usage"]);
  return v1 ? Math.round(parseInt(v1, 10) / 1000) : -1;
}

const browsers = [];
async function addPortal(i) {
  const browser = await chromium.launch({
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1366 / 1920,
    hasTouch: true,
  });
  await page.route(BLOCKED_MEDIA, (r) => r.fulfill({ status: 204, body: "" }));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  browsers.push(browser);
}

(async () => {
  console.log("PHASE0 start maxN=" + MAX_N + " memLimitMB=" + MEM_LIMIT_MB);
  let prevCpu = cpuUsec();
  let prevT = Date.now();
  const sample = (label) => {
    const nowCpu = cpuUsec();
    const nowT = Date.now();
    const pct =
      nowCpu > 0 && prevCpu > 0
        ? Math.round(((nowCpu - prevCpu) / ((nowT - prevT) * 1000) / VCPUS) * 1000) / 10
        : -1;
    prevCpu = nowCpu;
    prevT = nowT;
    console.log("PHASE0 " + label + " memMB=" + memMB() + " cpuPct=" + pct);
  };
  sample("N=0 baseline");

  let reached = 0;
  for (let n = 1; n <= MAX_N; n++) {
    if (memMB() > MEM_LIMIT_MB * 0.88) {
      console.log("PHASE0 WALL: memory guard hit before N=" + n + " - stopping ramp");
      break;
    }
    try {
      await addPortal(n);
    } catch (e) {
      console.log("PHASE0 WALL: portal " + n + " failed to open: " + e.message.split("\n")[0]);
      break;
    }
    reached = n;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    sample("N=" + n);
  }

  console.log("PHASE0 hold at N=" + reached + " for " + HOLD_MIN + "min (creep check)");
  for (let m = 1; m <= HOLD_MIN; m++) {
    await new Promise((r) => setTimeout(r, 60000));
    sample("hold+" + m + "min N=" + reached);
  }
  console.log("PHASE0 done - closing " + browsers.length + " browsers");
  for (const b of browsers) await b.close().catch(() => {});
  process.exit(0);
})().catch((e) => {
  console.log("PHASE0 FATAL: " + e.message);
  process.exit(1);
});
