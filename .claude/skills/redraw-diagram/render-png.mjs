// Renders an SVG to a PNG of the same size through headless Edge or Chrome.
// Used by draw-architecture.mjs. No dependencies.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const browsers = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
];

// base: path without extension; base.svg must exist. Returns an exit code (0 = written).
export function renderPng(base, W, H, root) {
  const browser = browsers.find((b) => fs.existsSync(b));
  if (!browser) { console.error("No Edge or Chrome found: SVG written, PNG not rendered."); return 2; }
  const profile = path.join(path.dirname(base), ".render-profile");
  const url = "file:///" + (base + ".svg").replace(/\\/g, "/").replace(/^\/+/, "");
  const r = spawnSync(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--user-data-dir=${profile}`, "--default-background-color=ffffffff",
    `--window-size=${W},${H}`, `--screenshot=${base}.png`, url,
  ], { encoding: "utf8", timeout: 60000 });
  fs.rmSync(profile, { recursive: true, force: true });
  if (!fs.existsSync(base + ".png") || r.status !== 0) {
    console.error(`PNG render failed (status ${r.status}): ${(r.stderr || "").slice(0, 500)}`);
    return 3;
  }
  console.log(`wrote ${path.relative(root, base)}.png`);
  return 0;
}
