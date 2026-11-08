// Expands a package layout instance the way the Echo does, for tests:
// the layout's parameters (defaults, then the instance's own, evaluated in
// `outer`), the instance's other properties on the layout's top
// component, then the top component's binds. ev() evaluates an APL
// expression string in a scope (the expressions the skill writes are also
// JavaScript); a string with text around ${...} is a template.
const aplPackage = require("../apl-package");

const LAYOUTS = aplPackage.contents().layouts;

function ev(v, scope) {
  if (typeof v !== "string" || !v.includes("${")) return v;
  // eslint-disable-next-line no-new-func
  const run = (e) => new Function("s", "with (s) { return (" + e + "); }")(new Proxy(scope, {
    has: (t, k) => k in t || k === "Math",
    get: (t, k) => (k === "Math" ? Math : t[k]),
  }));
  const whole = /^\$\{([^}]*)\}$/.exec(v);
  if (whole) return run(whole[1]);
  return v.replace(/\$\{([^}]*)\}/g, (_, e) => String(run(e)));
}

/** { node, scope }: the inflated top component and what its expressions see. */
function inflate(inst, outer = {}) {
  const L = LAYOUTS[inst.type];
  if (!L) throw new Error("no package layout " + inst.type);
  const scope = { ...outer };
  const names = new Set();
  for (const p of L.parameters) {
    const name = typeof p === "string" ? p : p.name;
    names.add(name);
    if (typeof p === "object") scope[name] = p.default;
  }
  const node = { ...L.items[0] };
  for (const [k, v] of Object.entries(inst)) {
    if (k === "type") continue;
    if (names.has(k)) scope[k] = ev(v, outer);
    else node[k] = v;
  }
  for (const b of node.bind || []) scope[b.name] = ev(b.value, scope);
  return { node, scope };
}

/** The children a data-bound container makes: per row, the first
 * template whose `when` holds, with its scope (data, index). */
function dataChildren(container, scope) {
  const rows = ev(container.data, scope) || [];
  return rows.map((data, index) => {
    const s = { ...scope, data, index };
    const t = container.items.find((c) => c.when === undefined || ev(c.when, s));
    return { template: t, scope: s };
  });
}

module.exports = { ev, inflate, dataChildren, LAYOUTS };
