// Multiple pages: rotation, transitions and page swipes - the Echo's
// MainScene loadPage/armPageTimer/buildTransition and tvOS DisplayView.
//
// Every page of the manifest is on the screen as its own layer (mmP<i>);
// only the current one is shown, the rest are `invisible` (still loaded,
// so a turn never waits for pixels, but not drawn and not touchable).
// A turn runs entirely on the Echo, from named commands defined once in
// the document (APL user-defined commands), so the skill is not asked:
//
//   MmTurn(from, to)  the entering page's transition, 3s inOutCubic like
//                     the portal and Roku. APL has no z-order control, so
//                     unlike the Roku (incoming drawn over a still
//                     outgoing page) BOTH layers animate: slides move both,
//                     fade/pop/rotate fade the outgoing out underneath, and
//                     flip squashes the outgoing then expands the incoming
//                     (the Roku's own flip). The result reads the same.
//   MmRotate          the dwell loop: wait the current page's delaySeconds
//                     (min 3, default 60), turn to the next if this page
//                     autoRotates; a non-rotating page simply stays.
//   MmPageNext/Prev   a horizontal swipe (when the user allows page swipes):
//                     turn, then a FRESH dwell on the page landed on.
//   MmGoTo(to)        a layout edit names the page being edited (manifest
//                     showPage): turn there and give it a fresh dwell, so
//                     the user watches the page they are changing (Roku
//                     b0c3f90, MainScene latestShowPage).
//   MmRestartDwell    any touch on a page restarts its dwell, so a page
//                     being worked on is not turned away (Roku 5f0ce93:
//                     the page rotated as Dave ticked a box).
//
// All of these run on the "rotation" sequencer, so starting one replaces
// the running dwell; a turn already in flight blocks new ones (mmTurning),
// as the Roku ignores turns mid-transition.

const ROOT = "mmRoot";
const TURN_MS = 3000;
const EASE = "cubic-bezier(0.645, 0.045, 0.355, 1)"; // inOutCubic (tvOS turnCurve)
const SWIPE_MIN_DP = 40;

const layerId = (i) => "mmP" + i;

/** delaySeconds -> ms, the Roku's rule: min 3s (0, 1, 2 too), 60s when absent. */
function dwellMs(page) {
  const raw = page && page.delaySeconds;
  const d = raw == null || raw === "" ? NaN : Math.trunc(Number(raw));
  return Math.max(3, Number.isFinite(d) ? d : 60) * 1000;
}

// One transform shape everywhere, so every AnimateItem's from/to match.
const T = (tx = 0, ty = 0, rot = 0, sx = 1, sy = 1) =>
  [{ translateX: tx }, { translateY: ty }, { rotate: rot }, { scaleX: sx }, { scaleY: sy }];

const anim = (id, ms, easing, from, to, opFrom, opTo) => {
  const value = [{ property: "transform", from, to }];
  if (opFrom !== undefined) value.push({ property: "opacity", from: opFrom, to: opTo });
  return { type: "AnimateItem", componentId: id, duration: ms, easing, value };
};

/** The document's named commands. W/H: the page layer size in dp. */
function commandDefinitions(W, H) {
  const IN = "mmP${to}";
  const OUT = "mmP${from}";
  const set = (id, property, value) => ({ type: "SetValue", componentId: id, property, value });
  // entering-page transitions other than flip: [incoming start, outgoing end, opacity?]
  const moves = {
    slideleft: [T(W), T(-W), false],
    slideright: [T(-W), T(W), false],
    slideup: [T(0, H), T(0, -H), false],
    slidedown: [T(0, -H), T(0, H), false],
    pop: [T(0, 0, 0, 0.3, 0.3), T(), true],
    rotate: [T(0, 0, 180, 0.3, 0.3), T(), true],
  };
  const known = Object.keys(moves).concat("flip");
  const variant = (name, cmds) => ({ type: "Sequential", when: "${mmTrans[to] == '" + name + "'}", commands: cmds });
  const standard = (name, [inStart, outEnd, fades]) => variant(name, [
    anim(IN, 1, "linear", inStart, inStart, fades ? 0 : 1, fades ? 0 : 1), // place it before it shows
    set(IN, "display", "normal"),
    {
      type: "Parallel",
      commands: [
        anim(IN, TURN_MS, EASE, inStart, T(), fades ? 0 : 1, 1),
        anim(OUT, TURN_MS, EASE, T(), outEnd, 1, fades ? 0 : 1),
      ],
    },
  ]);
  const fade = {
    type: "Sequential",
    when: "${" + known.map((k) => "mmTrans[to] != '" + k + "'").join(" && ") + "}",
    commands: [
      anim(IN, 1, "linear", T(), T(), 0, 0),
      set(IN, "display", "normal"),
      { type: "Parallel", commands: [anim(IN, TURN_MS, EASE, T(), T(), 0, 1), anim(OUT, TURN_MS, EASE, T(), T(), 1, 0)] },
    ],
  };
  const flip = variant("flip", [
    anim(OUT, TURN_MS / 2, "ease-in", T(), T(0, 0, 0, 0.0001, 1)),
    set(OUT, "display", "invisible"),
    anim(IN, 1, "linear", T(0, 0, 0, 0.0001, 1), T(0, 0, 0, 0.0001, 1), 1, 1),
    set(IN, "display", "normal"),
    anim(IN, TURN_MS / 2, "ease-out", T(0, 0, 0, 0.0001, 1), T()),
  ]);
  const turn = (to) => ({ type: "MmTurn", from: "${mmCur}", to });
  const loop = {
    type: "Sequential",
    repeatCount: 1000000,
    commands: [
      { type: "Idle", delay: "${mmDwell[mmCur]}" },
      { type: "Sequential", when: "${mmN > 1 && mmAuto[mmCur]}", commands: [turn("${(mmCur + 1) % mmN}")] },
    ],
  };
  const onRotation = (when, commands) => ({ type: "Sequential", sequencer: "rotation", when, commands });
  return {
    MmTurn: {
      parameters: ["from", "to"],
      commands: [
        set(ROOT, "mmTurning", true),
        set(ROOT, "mmCur", "${to}"),
        ...Object.entries(moves).map(([n, m]) => standard(n, m)),
        fade,
        flip,
        // the outgoing layer goes away and is put back to rest for its next turn
        set(OUT, "display", "invisible"),
        anim(OUT, 1, "linear", T(), T(), 1, 1),
        set(ROOT, "mmTurning", false),
      ],
    },
    MmRotate: { parameters: [], commands: [onRotation("${mmN > 1}", [loop])] },
    MmPageNext: { parameters: [], commands: [onRotation("${mmPageSwipe && mmN > 1 && !mmTurning}", [turn("${(mmCur + 1) % mmN}"), loop])] },
    MmPagePrev: { parameters: [], commands: [onRotation("${mmPageSwipe && mmN > 1 && !mmTurning}", [turn("${(mmCur + mmN - 1) % mmN}"), loop])] },
    MmRestartDwell: { parameters: [], commands: [onRotation("${mmN > 1 && !mmTurning}", [loop])] },
    MmGoTo: { parameters: ["to"], commands: [onRotation("${mmN > 1 && !mmTurning && to != mmCur}", [turn("${to}"), loop])] },
  };
}

/** Root bindings the commands read. */
function rootBinds(pages, current, gestures) {
  return [
    { name: "mmCur", value: current },
    { name: "mmN", value: pages.length },
    { name: "mmTurning", value: false },
    { name: "mmDwell", value: pages.map(dwellMs) },
    { name: "mmAuto", value: pages.map((p) => p && p.autoRotate === true) },
    { name: "mmTrans", value: pages.map((p) => String((p && p.transition) || "fade")) },
    { name: "mmPageSwipe", value: !!(gestures && gestures.pageSwipe === true) },
  ];
}

/** onUp commands that record "next"/"prev" in `dirVar` for a horizontal
 * swipe (needs mmDownX/mmDownY recorded on the same component). */
function horizontalSwipe(dirVar) {
  const dx = "(event.component.x - mmDownX)";
  const dy = "(event.component.y - mmDownY)";
  const horiz = "Math.abs(" + dx + ") > " + SWIPE_MIN_DP + " && Math.abs(" + dx + ") > Math.abs(" + dy + ")";
  return [
    { type: "SetValue", property: dirVar, when: "${" + horiz + " && " + dx + " < 0}", value: "next" },
    { type: "SetValue", property: dirVar, when: "${" + horiz + " && " + dx + " > 0}", value: "prev" },
  ];
}

/** onPress commands acting on a recorded page direction. */
function pageTurnFrom(dirVar) {
  return [
    { type: "MmPageNext", when: "${" + dirVar + " == 'next'}" },
    { type: "MmPagePrev", when: "${" + dirVar + " == 'prev'}" },
    { type: "SetValue", property: dirVar, value: "" },
  ];
}

/** One page's layer, and its page swipe. The layer IS the TouchWrapper:
 * on the Echo only the topmost component under the finger gets a touch,
 * and a wrapper gets one because it wraps what was touched. A first
 * version put a full-screen catcher BENEATH the pages; the page image
 * above it took every touch, so page swipes never worked on the Echo
 * Show 15 (found by the Roku session, 2026-10-28). The checkboxes and
 * calendar areas inside stay topmost and keep their own presses; a
 * horizontal drag anywhere else turns the page (finger left = next).
 * onDown/onUp run in fast mode (SendEvent and most commands dropped), so
 * they only record; onPress acts. The wrapper carries the layer id and
 * `display`, so MmTurn animates and hides it, and an invisible page takes
 * no touches. */
function layer(i, current, vp, items, extra) {
  const g = extra || {};
  return {
    type: "TouchWrapper", id: layerId(i),
    position: "absolute", left: 0, top: 0, width: vp.w, height: vp.h,
    display: i === current ? "normal" : "invisible",
    bind: [{ name: "mmDownX", value: 0 }, { name: "mmDownY", value: 0 }, { name: "mmDir", value: "" }].concat(g.binds || []),
    item: { type: "Container", width: "100%", height: "100%", items },
    onDown: [
      { type: "SetValue", property: "mmDownX", value: "${event.component.x}" },
      { type: "SetValue", property: "mmDownY", value: "${event.component.y}" },
      { type: "SetValue", property: "mmDir", value: "" },
    ].concat(g.onDown || []),
    // `extra`: the page's calendar swipes (touch.calendarGestures), read
    // here too, since this wrapper is the one that gets the drag
    onUp: horizontalSwipe("mmDir").concat(g.onUp || []),
    onPress: pageTurnFrom("mmDir").concat(g.onPress || []),
  };
}

module.exports = {
  commandDefinitions, rootBinds, horizontalSwipe, pageTurnFrom, layer, layerId, dwellMs,
  TURN_MS, EASE,
};
