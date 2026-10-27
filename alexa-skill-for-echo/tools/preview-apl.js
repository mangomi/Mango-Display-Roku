#!/usr/bin/env node
// Rough HTML preview of a skill screen written by try-skill.js, for a look
// without an Echo. Absolute layout only (what the skill's screens use).
// The clock's ${...} expressions are evaluated as JavaScript - APL's
// expression syntax for what clock.js emits (Time.*, ternary, %, array
// index) is also valid JS - so the preview shows the text the Echo should.
//
//   node tools/preview-apl.js apl-display.json > preview.html

const fs = require("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const now = Date.now();
const local = now - new Date().getTimezoneOffset() * 60000;
const d = (t) => new Date(t);
const Time = {
  hours: (t) => d(t).getUTCHours(), minutes: (t) => d(t).getUTCMinutes(),
  weekDay: (t) => d(t).getUTCDay(), month: (t) => d(t).getUTCMonth(), date: (t) => d(t).getUTCDate(),
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function evalText(text, bind) {
  const scope = { Time, utcTime: now, localTime: local };
  for (const b of bind || []) scope[b.name] = b.value;
  return text.replace(/\$\{([^}]*)\}/g, (_, e) => new Function(...Object.keys(scope), "return (" + e + ")")(...Object.values(scope)));
}

function el(c) {
  const pos = c.position === "absolute"
    ? `position:absolute;left:${c.left}px;top:${c.top}px;width:${c.width}px;height:${c.height}px;` : "";
  if (c.type === "Image") return `<img src="${esc(c.source)}" style="${pos}object-fit:${/fill/.test(c.scale) ? "cover" : "contain"}">`;
  if (c.type === "Frame") return `<div style="${pos}background:${c.backgroundColor};opacity:${c.opacity ?? 1}">${(c.items || []).map(el).join("")}</div>`;
  if (c.type === "Text") return `<div style="${pos}display:flex;align-items:center;justify-content:${{ left: "flex-start", right: "flex-end" }[c.textAlign] || "center"};text-align:${c.textAlign || "left"};color:${c.color};font-size:${c.fontSize}px;font-weight:${c.fontWeight || "normal"};white-space:nowrap;${c.paddingBottom ? "padding-bottom:" + c.paddingBottom + "px;" : ""}">${esc(evalText(c.text, c.bind))}</div>`;
  if (c.type === "Container") return `<div style="${pos}display:flex;flex-direction:column;align-items:${c.alignItems || "stretch"};width:${c.width || "auto"};padding-top:${c.paddingTop || 0}px">${(c.items || []).map(el).join("")}</div>`;
  return "";
}

const root = doc.mainTemplate.items[0];
console.log(`<!doctype html><meta charset="utf-8"><title>APL preview</title><body style="margin:0;background:#333">
<div style="position:relative;width:1920px;height:1080px;overflow:hidden;background:${root.backgroundColor};font-family:'Amazon Ember',Helvetica,Arial,sans-serif">${root.items.map(el).join("")}</div>`);
