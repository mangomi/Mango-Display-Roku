const test = require("node:test");
const assert = require("node:assert");
const touch = require("../touch");
const apl = require("../apl");

const now = 1_800_000_000_000;
const page = {
  image: "display_p0.png",
  overlays: [],
  targets: {
    sprites: { empty: "box_empty.png", checked: "box_checked.png" },
    items: [
      { rect: { x: 100, y: 200, w: 30, h: 30 }, checked: false, widgetSettingId: 7, payload: { id: 501, projectId: 9 } },
      { rect: { x: 100, y: 260, w: 30, h: 30 }, checked: true, widgetSettingId: 7, payload: { id: 502, projectId: 9 } },
    ],
  },
  regions: [{ kind: "calendar", rect: { x: 400, y: 100, w: 600, h: 800 }, id: 31 }],
};

test("overrides: a press holds until the render agrees", () => {
  // 501 pressed to checked, render still says unchecked -> hold it
  let r = touch.applyOverrides(page, "501:1:" + (now - 2000) + ",", now);
  assert.deepStrictEqual(r.states, [true, true]);
  assert.strictEqual(r.overrides, "501:1:" + (now - 2000) + ",");
  // the render caught up -> drop it
  const agreed = { ...page, targets: { ...page.targets, items: [{ ...page.targets.items[0], checked: true }, page.targets.items[1]] } };
  r = touch.applyOverrides(agreed, "501:1:" + (now - 2000) + ",", now);
  assert.deepStrictEqual(r.states, [true, true]);
  assert.strictEqual(r.overrides, "");
});

test("overrides: latest press per task wins; stale and departed tasks dropped", () => {
  const s = "501:1:" + (now - 5000) + ",501:0:" + (now - 1000) + ",502:0:" + (now - 60000) + ",999:1:" + now + ",";
  const r = touch.applyOverrides(page, s, now);
  assert.deepStrictEqual(r.states, [false, true]); // 501 back to unchecked = what the render says; 502 press too old
  assert.strictEqual(r.overrides, "");
});

test("overrides: garbage in the string is ignored", () => {
  assert.strictEqual(touch.parseOverrides("x,::,501:2:5,,501:1:abc").size, 1);
});

const place = apl.placement({ width: 1080, height: 1920 }, { w: 1080, h: 1920 });
const ctx = (gestures, states = [false, true]) => ({
  page, pageIndex: 0, place, assetBase: "https://a/", states, gestures,
  refreshArgs: ["refresh", "3", "1", "822", "${overrides}"], major: "1", minor: "822",
});

test("checkboxes: drawn with the manifest's sprites, press ticks then tells the portal", () => {
  const comps = touch.touchComponents(ctx({ calendarScroll: false }));
  assert.strictEqual(comps.length, 1); // the page's box layer
  const layer = comps[0];
  assert.deepStrictEqual(layer.bind.map((b) => [b.name, b.value]), [["mmBoxE", "https://a/box_empty.png"], ["mmBoxC", "https://a/box_checked.png"]]);
  const box = layer.items[0];
  assert.strictEqual(box.type, "MmBox");
  assert.deepStrictEqual([box.id, box.mmT0, box.mmTid, box.mmPg, box.mmCx, box.mmCy], ["mmBox0_501", false, "501", "0", "115", "215"]);
  assert.ok(JSON.stringify(box).length < 400, "a box instance stays small");
  // the behaviour lives once, in the layout
  const tw = touch.layouts(["refresh", "3", "1", "822", "${overrides}", "${mmBusy ? 1 : 0}", "${mmLayout}", "${mmPageUrls}", "${mmCur}"], "1", "822").MmBox.items[0];
  assert.strictEqual(tw.type, "TouchWrapper");
  assert.deepStrictEqual(tw.bind, [{ name: "mmTicked", value: "${mmT0}" }]);
  assert.strictEqual(tw.item.items[0].source, "${mmTicked ? mmBoxC : mmBoxE}");
  const [tick, hold, send, fast, dwell] = tw.onPress;
  assert.deepStrictEqual([tick.property, tick.value], ["mmTicked", "${!mmTicked}"]);
  assert.strictEqual(hold.componentId, touch.ROOT_ID);
  assert.match(hold.value, /mmTid \+ ':' \+ \(mmTicked \? 1 : 0\)/);
  // ver + the presses ride along so the reply can be the result screen
  assert.deepStrictEqual(send.arguments.slice(0, 10), ["touch", "tap", "${mmPg}", "${mmCx}", "${mmCy}", "${mmTid}", "1", "822", "3", "${overrides}"]);
  assert.strictEqual(fast.sequencer, "fastcheck");
  assert.strictEqual(dwell.type, "MmRestartDwell");
});
test("calendar swipes only when the user allows calendar scrolling, and under the boxes", () => {
  assert.strictEqual(touch.touchComponents(ctx({ calendarScroll: false })).length, 1);
  const comps = touch.touchComponents(ctx({ calendarScroll: true }));
  assert.strictEqual(comps.length, 2);
  const cal = comps[0]; // first = drawn underneath
  // onDown/onUp run in fast mode where SendEvent is ignored: they may only
  // record; the send happens in onPress (normal mode)
  const sends = (cmds) => JSON.stringify(cmds || []).includes("SendEvent");
  assert.ok(!sends(cal.onDown) && !sends(cal.onUp), "SendEvent in a fast-mode handler");
  assert.strictEqual(cal.onUp.find((c) => /mmDownY - event/.test(c.when)).value, "swipeup");
  const gate = cal.onPress[0];
  assert.match(gate.when, /utcTime - mmLastSent > 1200/); // one swipe, one send
  const up = gate.commands.find((c) => /'swipeup'/.test(c.when || ""));
  const ev = up.commands.find((c) => c.type === "SendEvent");
  assert.deepStrictEqual(ev.arguments.slice(0, 6), ["touch", "swipeup", "0", "700", "500", "31"]);
});

test("display screen carries the touch layer and the held presses", () => {
  const manifest = { canvas: { width: 1080, height: 1920 }, gestures: { calendarScroll: true }, pages: [page] };
  const d = apl.displayScreen({ w: 1080, h: 1920 }, { manifest, assetBase: "https://a/", version: 3 }, { major: "1", minor: "822" },
    "501:1:" + Date.now() + ",");
  const root = d.document.mainTemplate.items[0].items[0];
  assert.strictEqual(root.id, touch.ROOT_ID);
  assert.match(root.bind[0].value, /^501:1:/);
  const layer = root.items.find((i) => i.id === "mmP0").items;
  assert.strictEqual(layer.filter((i) => i.type === "TouchWrapper").length, 1); // the calendar
  const boxes = layer.find((i) => i.bind && i.bind[0].name === "mmBoxE").items;
  assert.strictEqual(boxes.length, 2);
  assert.ok(d.document.layouts.MmBox, "the checkbox is defined once on the screen");
  assert.deepStrictEqual(root.onMount[0].commands[1].arguments,
    ["refresh", "${mmVer}", "1", "822", "${overrides}", "${mmBusy ? 1 : 0}", "${mmLayout}", "${mmPageUrls}", "${mmCur}", "${mmDiagLoads}"]);
  assert.strictEqual(root.bind.find((b) => b.name === "mmVer").value, "3");
  assert.strictEqual(boxes.find((b) => b.id === "mmBox0_501").mmT0, true); // the held press
  const tap = d.document.layouts.MmBox.items[0].onPress.find((c) => c.type === "SendEvent");
  assert.deepStrictEqual(tap.arguments.slice(8), ["${mmVer}", "${overrides}", "${mmLayout}", "${mmPageUrls}", "${mmCur}"]);
});

// APL component properties a bind/SetValue name must never shadow: SetValue
// on such a name changes the component, not the variable (the "checked"
// bug). Not exhaustive - the common state and layout ones.
const RESERVED = ["checked", "disabled", "pressed", "focused", "hover", "opacity", "display", "width", "height",
  "source", "text", "color", "id", "type", "position", "left", "top", "bind", "item", "items"];

test("no bound variable or SetValue target shadows a built-in component property", () => {
  const manifest = { canvas: { width: 1080, height: 1920 }, gestures: { calendarScroll: true }, pages: [page] };
  const d = apl.displayScreen({ w: 1080, h: 1920 }, { manifest, assetBase: "https://a/", version: 3 }, { major: "1", minor: "822" }, "");
  const names = [];
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n.bind)) n.bind.forEach((b) => names.push(b.name));
    if (n.type === "SetValue" && !n.componentId) names.push(n.property);
    Object.values(n).forEach(walk);
  })(d.document);
  assert.ok(names.length > 3);
  for (const nm of names) assert.ok(!RESERVED.includes(nm), "reserved name used: " + nm);
});

test("swipe: the Roku spinner centred on the calendar at once, cleared after 15s if no redraw", () => {
  const cal = touch.touchComponents(ctx({ calendarScroll: true }))[0];
  const sp = cal.item.items[0];
  assert.match(sp.source, /^data:image\/png;base64,/);
  assert.strictEqual(sp.opacity, "${mmSwiping == '31' ? 1 : 0}");
  assert.strictEqual(sp.left + sp.width / 2, 600 / 2); // centre of the 600-wide region
  const send = cal.onPress[0].commands.find((c) => /'swipeup'/.test(c.when || "")).commands;
  assert.deepStrictEqual([send[0].componentId, send[0].property, send[0].value], [touch.ROOT_ID, "mmSwiping", "31"]);
  assert.ok(send.findIndex((c) => c.type === "SendEvent") > 0); // spinner before the round trip
  const hide = send.find((c) => c.sequencer === "busyhide");
  assert.strictEqual(hide.commands[0].delay, 15000);
});
