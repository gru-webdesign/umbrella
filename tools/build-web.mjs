// Copies the static game into www/ for Capacitor (the Android wrapper).
import { cpSync, rmSync, mkdirSync } from "node:fs";

const keep = ["index.html", "manifest.webmanifest", "sw.js", "src", "assets", "icons", "fonts"];
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const p of keep) cpSync(p, `www/${p}`, { recursive: true });
console.log("www/ ready:", keep.join(", "));
