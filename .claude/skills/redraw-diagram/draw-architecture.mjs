// Draws the architecture + IPC diagram from docs/diagrams/architecture.json, with every
// channel cross-checked against src/main/ipc/*.ts and every api name against src/preload/index.ts.
// No dependencies: Node 18+, plus Edge or Chrome for the PNG.
//
//   node .claude/skills/redraw-diagram/draw-architecture.mjs [--check] [--no-png] [--out <path-without-ext>]
//
// --check   validate only (code cross-check and text fit); write nothing
// --no-png  write the SVG only
// --out     write to another path (e.g. a scratch file) instead of architecture.json's "output"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPng } from "./render-png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);

const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/diagrams/architecture.json"), "utf8"));
const errors = [];

// ---------- cross-check: handlers in main ----------
const ipcDir = path.join(ROOT, "src/main/ipc");
const handlers = new Map(); // channel → file
for (const f of fs.readdirSync(ipcDir).filter((f) => f.endsWith(".ts"))) {
  const src = fs.readFileSync(path.join(ipcDir, f), "utf8");
  for (const m of src.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)) handlers.set(m[1], `ipc/${f}`);
}

// ---------- cross-check: preload methods ----------
const preload = fs.readFileSync(path.join(ROOT, "src/preload/index.ts"), "utf8");
const bridged = new Map(); // api → channel
for (const m of preload.matchAll(/^\s*(\w+):\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/gm)) bridged.set(m[1], m[2]);
const topLevel = new Set([...preload.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));

const drawn = new Set();
for (const d of spec.domains) {
  if (!fs.existsSync(path.join(ROOT, "src/main", d.handler))) errors.push(`domain ${d.id}: handler file src/main/${d.handler} not found`);
  for (const { api, channel } of d.calls) {
    if (drawn.has(channel)) errors.push(`channel ${channel} drawn twice`);
    drawn.add(channel);
    if (!handlers.has(channel)) errors.push(`domain ${d.id}: ${channel} has no ipcMain.handle in src/main/ipc/`);
    else if (handlers.get(channel) !== d.handler) errors.push(`domain ${d.id}: ${channel} is handled in ${handlers.get(channel)}, not ${d.handler}`);
    if (!bridged.has(api)) errors.push(`domain ${d.id}: window.api.${api} is not an ipcRenderer.invoke in src/preload/index.ts`);
    else if (bridged.get(api) !== channel) errors.push(`domain ${d.id}: window.api.${api} invokes ${bridged.get(api)}, not ${channel}`);
  }
}
for (const [channel, file] of handlers) if (!drawn.has(channel)) errors.push(`${channel} (${file}) is missing from the diagram`);
for (const [api, channel] of bridged) if (!drawn.has(channel)) errors.push(`window.api.${api} → ${channel} is missing from the diagram`);
for (const l of spec.local || []) if (!topLevel.has(l.api)) errors.push(`local api ${l.api} not found in src/preload/index.ts`);

// ---------- layout ----------
const M = 40, LABEL_W = 190, CW = 300, CG = 36, HEAD_Y = 118, CARD_GAP = 46;
const FS = { title: 28, sub: 14, lane: 19, lanes: 12, h: 16, t: 13, mono: 12, foot: 13 };
const FONT = "Segoe UI, Helvetica, Arial, sans-serif", MONO = "Consolas, Menlo, monospace";
const textW = (s, size, kind) => [...s].length * size * (kind === "bold" ? 0.57 : kind === "mono" ? 0.6 : 0.5);
const fit = (s, size, kind, max, where) => {
  if (textW(s, size, kind) > max) errors.push(`text too wide in ${where}: "${s}" — shorten it or split the line`);
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const INK = "#1f2328", MUTED = "#57606a", ARROW = "#57606a", DATA = "#1a7f37";

const maxCalls = Math.max(...spec.domains.map((d) => d.calls.length));
const maxScreen = Math.max(...spec.domains.map((d) => d.screen.length));
const maxService = Math.max(...spec.domains.map((d) => d.service.length));
// One row of cards per lane, all columns the same height so the lanes line up
const rowH = {
  renderer: 40 + maxScreen * 18 + 8 + maxCalls * 17 + 12,
  preload: 22 + maxCalls * 17 + 12,
  main: 40 + maxService * 18 + 10,
};
const rowY = {};
let y = HEAD_Y;
for (const lane of spec.lanes) { rowY[lane.id] = y; y += rowH[lane.id] + CARD_GAP; }
const DATA_Y = y, DATA_H = 44;
const colX = (i) => M + LABEL_W + i * (CW + CG);
const W = colX(spec.domains.length) - CG + M;

const out = [];
const text = (tx, ty, s, size, extra = "") => out.push(`<text x="${tx}" y="${ty}" font-size="${size}" ${extra}>${esc(s)}</text>`);
const card = (x, y0, h, color) => {
  out.push(`<rect x="${x}" y="${y0}" width="${CW}" height="${h}" rx="10" fill="#fff" stroke="${color}" stroke-width="2"/>`);
  out.push(`<rect x="${x}" y="${y0}" width="6" height="${h}" rx="3" fill="${color}"/>`);
};

// lane labels on the left
for (const lane of spec.lanes) {
  const ly = rowY[lane.id];
  fit(lane.name, FS.lane, "bold", LABEL_W - 24, `lane ${lane.id}`);
  fit(lane.tagline, FS.lanes, "", LABEL_W - 24, `lane ${lane.id}`);
  out.push(`<rect x="${M}" y="${ly}" width="${LABEL_W - 20}" height="${rowH[lane.id]}" rx="10" fill="${lane.color}"/>`);
  text(M + 14, ly + 30, lane.name, FS.lane, `font-weight="700" fill="#fff"`);
  text(M + 14, ly + 50, lane.tagline, FS.lanes, `fill="#fff"`);
}
out.push(`<rect x="${M}" y="${DATA_Y}" width="${LABEL_W - 20}" height="${DATA_H}" rx="10" fill="${DATA}"/>`);
text(M + 14, DATA_Y + 28, "Data", FS.lane, `font-weight="700" fill="#fff"`);

const laneColor = Object.fromEntries(spec.lanes.map((l) => [l.id, l.color]));
spec.domains.forEach((d, i) => {
  const x = colX(i), tx = x + 18, max = CW - 30, where = `domain ${d.id}`;

  // renderer: where it starts + window.api calls
  let ry = rowY.renderer;
  card(x, ry, rowH.renderer, laneColor.renderer);
  fit(d.title, FS.h, "bold", max, where);
  text(tx, ry + 26, d.title, FS.h, `font-weight="700" fill="${INK}"`);
  d.screen.forEach((s, j) => { fit(s, FS.t, "", max, where); text(tx, ry + 48 + j * 18, s, FS.t, `fill="${MUTED}"`); });
  d.calls.forEach((c, j) => {
    const s = `window.api.${c.api}()`;
    fit(s, FS.mono, "mono", max, where);
    text(tx, ry + 48 + maxScreen * 18 + 6 + j * 17, s, FS.mono, `font-family="${MONO}" fill="${INK}"`);
  });

  // preload: the channels
  const py = rowY.preload;
  card(x, py, rowH.preload, laneColor.preload);
  d.calls.forEach((c, j) => {
    fit(c.channel, FS.mono, "mono", max, where);
    text(tx, py + 26 + j * 17, `'${c.channel}'`, FS.mono, `font-family="${MONO}" fill="${INK}"`);
  });

  // main: handler → services
  const my = rowY.main;
  card(x, my, rowH.main, laneColor.main);
  fit(d.handler, FS.mono, "mono", max, where);
  text(tx, my + 26, d.handler, FS.mono, `font-family="${MONO}" font-weight="700" fill="${INK}"`);
  d.service.forEach((s, j) => { fit(`→ ${s}`, FS.t, "", max, where); text(tx, my + 48 + j * 18, `→ ${s}`, FS.t, `fill="${MUTED}"`); });

  // data
  fit(d.store, FS.t, "", max, where);
  out.push(`<rect x="${x}" y="${DATA_Y}" width="${CW}" height="${DATA_H}" rx="10" fill="#fff" stroke="${DATA}" stroke-width="2" stroke-dasharray="${d.store === "No data stored" ? "5 4" : "0"}"/>`);
  text(x + CW / 2, DATA_Y + 27, d.store, FS.t, `text-anchor="middle" fill="${INK}"`);

  // arrows down the column
  const ax = x + CW / 2;
  for (const [from, to] of [[rowY.renderer + rowH.renderer, rowY.preload], [rowY.preload + rowH.preload, rowY.main], [rowY.main + rowH.main, DATA_Y]]) {
    out.push(`<path d="M${ax} ${from} V${to - 3}" stroke="${ARROW}" stroke-width="2" fill="none" marker-end="url(#a)"/>`);
  }
});

// footnotes
let fy = DATA_Y + DATA_H + 34;
const notes = [
  "Each arrow is one window.api call: preload invokes the channel, the handler unpacks the arguments and calls a service.",
  "Errors travel back as codes (e.g. PDF_EXPORT_FAILED) and the renderer shows them as error.* text.",
  ...(spec.local || []).map((l) => l.note),
];
for (const n of notes) { fit(n, FS.foot, "", W - 2 * M, "footnote"); text(M, fy, n, FS.foot, `fill="${MUTED}"`); fy += 20; }
const H = Math.round(fy + 10);

fit(spec.title, FS.title, "bold", W - 2 * M, "title");
fit(spec.subtitle, FS.sub, "", W - 2 * M, "subtitle");

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
if (has("--check")) {
  console.log(`ok: ${spec.domains.length} domains, ${drawn.size} channels checked against ipc/ and preload, ${W}x${H}`);
  process.exit(0);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${ARROW}"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${M}" y="${M + 18}" font-size="${FS.title}" font-weight="700" fill="${INK}">${esc(spec.title)}</text>
<text x="${M}" y="${M + 44}" font-size="${FS.sub}" fill="${MUTED}">${esc(spec.subtitle)}</text>
${out.join("\n")}
</svg>
`;

const base = path.resolve(ROOT, argVal("--out") || spec.output);
fs.mkdirSync(path.dirname(base), { recursive: true });
fs.writeFileSync(base + ".svg", svg);
console.log(`wrote ${path.relative(ROOT, base)}.svg (${W}x${H})`);
if (!has("--no-png")) process.exit(renderPng(base, W, H, ROOT));
