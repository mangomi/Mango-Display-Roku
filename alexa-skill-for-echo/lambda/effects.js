// Display-wide effects (manifest `effects`): snow, balloons, Santa... - the
// Echo's effectRegistry (MainScene.brs). They fly above every page so they
// keep going through page transitions. Filled in as each effect type lands
// (PARITY.md); unknown types draw nothing.
//
// build(cfg, ctx) -> [APL components]; ctx = { place, canvas, assetBase, vp, idPrefix }

const BUILDERS = { ...require("./effect-all").builders };

function register(type, build) {
  BUILDERS[type] = build;
}

function displayEffects(list, ctxBase) {
  const out = [];
  (list || []).forEach((e, i) => {
    const build = e && BUILDERS[e.type];
    if (build) out.push(...(build(e, { ...ctxBase, idPrefix: "fx" + i }) || []));
  });
  return out;
}

module.exports = { displayEffects, register, BUILDERS };
