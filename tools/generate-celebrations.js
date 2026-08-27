/*
 * Films the portal's own confetti library into sprite sheets the Roku
 * plays natively. Real-time particle physics fights the Express (the
 * reason Fireworks/Bursting Hearts were dropped from v1); a pre-rendered
 * burst is the string-lights technique: film once at build time, play as
 * frames forever. Run on a dev machine; outputs are committed.
 *
 *   node tools/generate-celebrations.js
 *
 * Produces:
 *   images/celebrations/burst.png                  channel-bundled task-check burst
 *   source/celebrationMap.brs                      its geometry, compiled into the channel
 *   render-service/effect-assets/effect_firework_sheet.{png,json}
 *   render-service/effect-assets/effect_bsheart_sheet.{png,json}
 */
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const SVC = path.join(REPO, "render-service");
const { chromium } = require(path.join(SVC, "node_modules", "playwright"));
const sharp = require(path.join(SVC, "node_modules", "sharp"));

const PORTAL = process.env.PORTAL_DIR || path.join(process.env.HOME, "Projects", "Mangomirror-Portal", "WebContent");
const CANVAS = 512;
const FRAME_MS = 70;
const SHEET_CAP = 2048;

const ASSETS = [
  {
    name: "burst",
    frames: 24,
    // the portal's "realistic" task-check preset, centered
    fire: `
      const base = { origin: { x: 0.5, y: 0.55 }, zIndex: 9 };
      confetti(Object.assign({}, base, { particleCount: 50, spread: 26, startVelocity: 55 }));
      confetti(Object.assign({}, base, { particleCount: 40, spread: 60 }));
      confetti(Object.assign({}, base, { particleCount: 70, spread: 100, decay: 0.91, scalar: 0.8 }));
      confetti(Object.assign({}, base, { particleCount: 20, spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 }));
      confetti(Object.assign({}, base, { particleCount: 20, spread: 120, startVelocity: 45 }));`,
  },
  {
    name: "firework",
    frames: 26,
    // one 360-degree shell burst; the overlay loops it at varied positions
    fire: `
      confetti({ particleCount: 110, spread: 360, startVelocity: 30, ticks: 70,
                 gravity: 0.9, scalar: 1.6, origin: { x: 0.5, y: 0.5 }, zIndex: 9 });`,
  },
  {
    name: "bsheart",
    frames: 30,
    // Bursting hearts, drawn by hand (Dave 2026-08-26: the filmed emoji
    // preset "looks like a mess of things falling"). A heart grows with
    // two heartbeat thumps, pops with a flash ring, and shatters into
    // small hearts that fly out confetti-style, slow under drag and fade.
    // Deterministic canvas per frame - no physics library, no waiting.
    custom: `
      (() => {
        const C = document.createElement("canvas");
        C.width = 512; C.height = 512;
        C.style.cssText = "position:fixed;left:0;top:0";
        document.body.appendChild(C);
        const ctx = C.getContext("2d");
        let s = 42;                       // seeded so every frame agrees
        const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
        const COLORS = ["#ff2d55", "#ff5c8a", "#ff8fab", "#e6255f", "#ff6b9d"];
        const parts = [];
        for (let i = 0; i < 14; i++) {
          parts.push({
            a: (i / 14) * Math.PI * 2 + rnd() * 0.5,
            sp: 26 + rnd() * 22,
            size: 20 + rnd() * 18,
            color: COLORS[i % COLORS.length],
            rot: rnd() * Math.PI * 2,
            rotV: (rnd() - 0.5) * 0.5,
          });
        }
        function heart(x, y, size, rot, color, alpha) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.scale(size / 100, size / 100);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, 30);
          ctx.bezierCurveTo(-50, -12, -28, -55, 0, -28);
          ctx.bezierCurveTo(28, -55, 50, -12, 0, 30);
          ctx.fill();
          ctx.restore();
        }
        const POP = 12, FRAMES = 30, cx = 256, cy = 250;
        window.renderFrame = (f) => {
          ctx.clearRect(0, 0, 512, 512);
          if (f < POP) {
            // smoothstep growth 0.15 -> 1 with thumps that strengthen
            const t = f / (POP - 1);
            const sc = 0.15 + 0.85 * (t * t * (3 - 2 * t)) + Math.sin(t * Math.PI * 4) * 0.06 * t;
            heart(cx, cy, 260 * sc, 0, "#ff2d55", 1);
          } else {
            const k = f - POP;
            if (k < 2) {                  // pop flash
              ctx.save();
              ctx.globalAlpha = 0.4 - k * 0.18;
              ctx.strokeStyle = "#ffd7e2";
              ctx.lineWidth = 10 - k * 4;
              ctx.beginPath();
              ctx.arc(cx, cy, 45 + k * 40, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
            for (const p of parts) {
              let x = cx, y = cy, vx = Math.cos(p.a) * p.sp, vy = Math.sin(p.a) * p.sp - 6;
              for (let i = 0; i < k; i++) { x += vx; y += vy; vx *= 0.86; vy = vy * 0.86 + 2.1; }
              const life = k / (FRAMES - POP - 1);
              const alpha = life < 0.65 ? 1 : Math.max(0, 1 - (life - 0.65) / 0.3);
              if (alpha > 0.01) heart(x, y, p.size * (1 - life * 0.25), p.rot + p.rotV * k, p.color, alpha);
            }
          }
        };
      })();`,
  },
];

async function filmAsset(browser, asset) {
  const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } });
  await page.setContent("<html><body style='margin:0;background:transparent'></body></html>");
  const frames = [];
  if (asset.custom) {
    // deterministic renderer: draw frame i, shoot it, no clocks involved
    await page.addScriptTag({ content: asset.custom });
    for (let i = 0; i < asset.frames; i++) {
      await page.evaluate("renderFrame(" + i + ")");
      // the screenshot can beat the canvas layer's compositor commit
      // (seen live: 13 blank frames); two rAFs guarantee the draw landed
      await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
      frames.push(await page.screenshot({ omitBackground: true, type: "png" }));
    }
  } else {
    const lib = fs.readFileSync(path.join(PORTAL, "js/vendor/tsparticles.confetti.bundle.min.js"), "utf8");
    await page.addScriptTag({ content: lib });
    await page.evaluate(asset.fire);
    for (let i = 0; i < asset.frames; i++) {
      frames.push(await page.screenshot({ omitBackground: true, type: "png" }));
      await page.waitForTimeout(FRAME_MS);
    }
  }
  await page.close();
  return frames;
}

async function packSheet(frames) {
  // scale frames until a grid fits under the texture cap
  let scale = 1;
  let fw, fh, cols, rows;
  for (;;) {
    fw = Math.floor(CANVAS * scale);
    fh = fw;
    cols = Math.max(1, Math.floor(SHEET_CAP / fw));
    rows = Math.ceil(frames.length / cols);
    if (rows * fh <= SHEET_CAP) break;
    scale -= 0.05;
    if (scale < 0.2) throw new Error("cannot fit sheet under texture cap");
  }
  const composites = [];
  for (let i = 0; i < frames.length; i++) {
    const buf = scale === 1 ? frames[i] : await sharp(frames[i]).resize(fw, fh).png().toBuffer();
    composites.push({ input: buf, left: (i % cols) * fw, top: Math.floor(i / cols) * fh });
  }
  const sheet = await sharp({
    create: { width: cols * fw, height: rows * fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
  return { sheet, meta: { frameW: fw, frameH: fh, frameCount: frames.length, cols, rows, frameMs: FRAME_MS } };
}

(async () => {
  // regenerate selectively: `node tools/generate-celebrations.js bsheart`
  // (filming is non-deterministic for the tsparticles assets, so an
  // untouched asset should not be refilmed into a noisy diff)
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(REPO, "images", "celebrations"), { recursive: true });
  fs.mkdirSync(path.join(SVC, "effect-assets"), { recursive: true });

  for (const asset of ASSETS) {
    if (only.length && !only.includes(asset.name)) continue;
    process.stdout.write("filming " + asset.name + "... ");
    const frames = await filmAsset(browser, asset);
    const { sheet, meta } = await packSheet(frames);
    if (asset.name === "burst") {
      fs.writeFileSync(path.join(REPO, "images", "celebrations", "burst.png"), sheet);
      fs.writeFileSync(
        path.join(REPO, "source", "celebrationMap.brs"),
        "' GENERATED by tools/generate-celebrations.js - do not edit by hand.\n" +
          "function celebrationBurstMeta() as object\n" +
          "    return { uri: \"pkg:/images/celebrations/burst.png\", frameW: " + meta.frameW +
          ", frameH: " + meta.frameH + ", frameCount: " + meta.frameCount + ", cols: " + meta.cols +
          ", rows: " + meta.rows + ", frameMs: " + meta.frameMs + " }\n" +
          "end function\n",
      );
      // the tvOS app bundles the SAME sheet (folder reference) and reads
      // the map as JSON - one filming run feeds both clients
      fs.writeFileSync(
        path.join(REPO, "tvos", "MangoDisplayTV", "celebrationMap.json"),
        JSON.stringify({ file: "celebrations/burst.png", ...meta }) + "\n",
      );
    } else {
      const base = path.join(SVC, "effect-assets", "effect_" + asset.name + "_sheet");
      fs.writeFileSync(base + ".png", sheet);
      fs.writeFileSync(base + ".json", JSON.stringify(meta));
    }
    console.log(meta.frameCount + " frames, " + meta.cols + "x" + meta.rows + " grid @ " + meta.frameW + "px, " + Math.round(sheet.length / 1024) + "KB");
  }
  await browser.close();
  console.log("done");
})();
