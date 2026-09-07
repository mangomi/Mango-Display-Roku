/*
 * What this task is using: memory and CPU as fractions of its limits.
 *
 * Scaling runs on the service's real usage (ECS memory/CPU target
 * tracking) and so does claim refusal: a task stops taking new displays
 * when IT is nearly full, whatever the display count says - a one-page
 * clock and a five-page calendar wall are not the same load (Dave,
 * 2026-09-06). Usage-based scaling lags a surge by a couple of minutes;
 * refusal is what keeps a task from being pushed into exhaustion while
 * the new task starts.
 *
 * On Fargate the cgroup counters are the truth (the same ones the
 * 2026-08-24 density test read). The limits come from the ECS task
 * metadata endpoint, or TASK_VCPUS / TASK_MEMORY_MB when running
 * elsewhere. Locally, with no cgroup, the process's own RSS against the
 * machine's memory is reported, which is only ever a rough number.
 */
const fs = require("fs");
const os = require("os");
const http = require("http");

const REFUSE_MEM = parseFloat(process.env.REFUSE_MEM_FRACTION || "0.85");
/* CPU binds long before memory: ~30 portals saturate 2 vCPU while memory
 * sits at a third (phase 1). Refuse earlier than the 80%/60s first
 * proposed, so a burst of claims cannot push a task to 100% before the
 * next sample - at 100% even the health check fails. */
const REFUSE_CPU = parseFloat(process.env.REFUSE_CPU_FRACTION || "0.70");
const REFUSE_CPU_SUSTAIN_MS = parseInt(process.env.REFUSE_CPU_SUSTAIN_MS || "30000", 10);
const SAMPLE_MS = 15000;

function readFirst(paths) {
  for (const p of paths) {
    try {
      return fs.readFileSync(p, "utf8").trim();
    } catch (e) {}
  }
  return null;
}

function cgroupMemBytes() {
  const v = readFirst(["/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory/memory.usage_in_bytes"]);
  return v ? parseInt(v, 10) : null;
}
function cgroupMemLimitBytes() {
  const v = readFirst(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]);
  if (!v || v === "max") return null;
  const n = parseInt(v, 10);
  return n > 0 && n < 1e15 ? n : null;
}
function cgroupCpuUsec() {
  const v2 = readFirst(["/sys/fs/cgroup/cpu.stat"]);
  if (v2) {
    const m = v2.match(/usage_usec (\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const v1 = readFirst(["/sys/fs/cgroup/cpuacct/cpuacct.usage", "/sys/fs/cgroup/cpu/cpuacct.usage"]);
  return v1 ? Math.round(parseInt(v1, 10) / 1000) : null;
}

function getJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs || 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

class UsageSampler {
  constructor(log) {
    this.log = log || (() => {});
    this.vcpus = parseFloat(process.env.TASK_VCPUS || "0") || null;
    this.memLimit = (parseInt(process.env.TASK_MEMORY_MB || "0", 10) || 0) * 1048576 || null;
    this.mem = 0; /* fraction */
    this.cpu = 0; /* fraction of all vCPUs, last interval */
    this.cpuHighSince = null;
    this.lastCpuUsec = null;
    this.lastAt = null;
    this.source = "none";
    this.timer = null;
    this.processCpuLast = process.cpuUsage();
  }

  /* limits from the ECS task metadata endpoint, when there is one */
  async init() {
    const base = process.env.ECS_CONTAINER_METADATA_URI_V4;
    if (base) {
      const task = await getJson(base + "/task");
      if (task && task.Limits) {
        if (!this.vcpus && task.Limits.CPU) this.vcpus = task.Limits.CPU;
        if (!this.memLimit && task.Limits.Memory) this.memLimit = task.Limits.Memory * 1048576;
      }
    }
    if (!this.memLimit) this.memLimit = cgroupMemLimitBytes();
    if (!this.vcpus) this.vcpus = os.cpus().length;
    if (!this.memLimit) this.memLimit = os.totalmem();
    this.sample();
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.timer.unref && this.timer.unref();
    this.log("usage: limits " + this.vcpus + " vCPU / " + Math.round(this.memLimit / 1048576) + " MB (" + this.source + ")");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  sample() {
    const now = Date.now();
    const cgMem = cgroupMemBytes();
    const cgCpu = cgroupCpuUsec();
    if (cgMem !== null && cgCpu !== null) {
      this.source = "cgroup";
      this.mem = cgMem / this.memLimit;
      if (this.lastCpuUsec !== null && this.lastAt) {
        const dUsec = cgCpu - this.lastCpuUsec;
        const dWall = (now - this.lastAt) * 1000;
        this.cpu = dWall > 0 ? dUsec / dWall / this.vcpus : 0;
      }
      this.lastCpuUsec = cgCpu;
    } else {
      /* no cgroup: this process only. Chromium children are not counted,
       * so locally the numbers understate; they exist so the code path
       * runs, not to be believed */
      this.source = "process";
      this.mem = process.memoryUsage().rss / this.memLimit;
      const u = process.cpuUsage(this.processCpuLast);
      this.processCpuLast = process.cpuUsage();
      if (this.lastAt) {
        const dWall = (now - this.lastAt) * 1000;
        this.cpu = dWall > 0 ? (u.user + u.system) / dWall / this.vcpus : 0;
      }
    }
    this.lastAt = now;
    if (this.cpu >= REFUSE_CPU) {
      if (!this.cpuHighSince) this.cpuHighSince = now;
    } else {
      this.cpuHighSince = null;
    }
  }

  /* why this task should not take another display right now, or null */
  refusal() {
    if (this.mem >= REFUSE_MEM) return "memory " + Math.round(this.mem * 100) + "%";
    if (this.cpuHighSince && Date.now() - this.cpuHighSince >= REFUSE_CPU_SUSTAIN_MS) {
      return "cpu " + Math.round(this.cpu * 100) + "% for " + Math.round((Date.now() - this.cpuHighSince) / 1000) + "s";
    }
    return null;
  }

  snapshot() {
    return {
      memFraction: Math.round(this.mem * 1000) / 1000,
      cpuFraction: Math.round(this.cpu * 1000) / 1000,
      memLimitMb: Math.round(this.memLimit / 1048576),
      vcpus: this.vcpus,
      source: this.source,
      refusing: this.refusal(),
    };
  }
}

module.exports = { UsageSampler };
