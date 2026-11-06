#!/usr/bin/env node
/*
  The comic stats card on the profile README: reads the public contributions calendar
  (github.com/users/<user>/contributions — no token needed) and draws assets/stats.svg.
  Runs daily from .github/workflows/stats.yml. Node 20+, no dependencies.

  If "Private contributions" is switched on in the profile's contribution settings, the public
  calendar (and so this card) counts private work too.
*/
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const USER = process.env.GH_USER || "Mohamad44p"

const res = await fetch(`https://github.com/users/${USER}/contributions`, {
  headers: { accept: "text/html", "user-agent": `${USER}-profile-stats` },
})
if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
const html = await res.text()

const days = []
for (const m of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
  const level = Number(m[0].match(/data-level="(\d)"/)?.[1] ?? NaN)
  const id = m[0].match(/\bid="([^"]+)"/)?.[1]
  if (Number.isFinite(level)) days.push({ date: m[1], level, id, count: null })
}
if (days.length < 200) throw new Error("calendar not found")
const counts = new Map()
for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
  const t = m[2].trim()
  const n = /^No contributions/i.test(t) ? 0 : Number((t.match(/^([\d,]+)\s+contribution/i)?.[1] ?? "").replace(/,/g, ""))
  if (Number.isFinite(n)) counts.set(m[1], n)
}
for (const d of days) d.count = counts.get(d.id) ?? null
days.sort((a, b) => a.date.localeCompare(b.date))

const total =
  Number((html.match(/([\d,]+)\s+contributions?\s+in the last year/i)?.[1] ?? "").replace(/,/g, "")) ||
  days.reduce((a, d) => a + (d.count ?? 0), 0)
const active = (d) => (d.count ?? d.level) > 0

// streaks (today may still be empty — a streak that ended yesterday is still "current")
let longest = 0
let run = 0
for (const d of days) {
  run = active(d) ? run + 1 : 0
  longest = Math.max(longest, run)
}
let current = 0
for (let i = days.length - 1; i >= 0; i--) {
  if (active(days[i])) current++
  else if (i === days.length - 1) continue
  else break
}
const busiest = days.reduce((a, d) => ((d.count ?? 0) > (a.count ?? 0) ? d : a), days[0])
const activeDays = days.filter(active).length

/* ── draw ─────────────────────────────────────────────────────────────────── */
const fontB64 = fs.readFileSync(path.join(ROOT, "assets", "fonts", "archivo.woff2")).toString("base64")
const fmt = (n) => n.toLocaleString("en-US")
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
const monthName = (iso) => new Date(iso + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" })

const W = 1000
const H = 350
const INK = "#17110b"
const PAPER = "#fff3dc"

// heatmap: weeks as columns (GitHub's layout), each day a halftone dot sized by its level
const CELL = 11.6
const GX = 360
const GY = 92
const first = new Date(days[0].date + "T00:00:00Z").getUTCDay()
const RAD = [1.6, 2.6, 3.4, 4.3, 5.3]
const COL = ["#cfbd99", INK, INK, "#e0457b", "#e23a2c"]
let dots = ""
let months = ""
let lastMonth = ""
days.forEach((d, i) => {
  const k = i + first
  const x = GX + Math.floor(k / 7) * CELL
  const y = GY + (k % 7) * CELL
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${RAD[d.level]}" fill="${COL[d.level]}"/>`
  const mo = monthName(d.date)
  if (k % 7 === 0 && mo !== lastMonth && Math.floor(k / 7) < 52) {
    months += `<text x="${x.toFixed(1)}" y="${GY - 14}" class="lab">${mo.toUpperCase()}</text>`
    lastMonth = mo
  }
})
const weeks = Math.ceil((days.length + first) / 7)
const gridW = weeks * CELL

const chip = (x, label, value, fill, fg = INK) => `
  <g transform="translate(${x},262) rotate(-1)">
    <rect x="6" y="6" width="188" height="60" fill="${INK}"/>
    <rect width="188" height="60" fill="${fill}" stroke="${INK}" stroke-width="4"/>
    <text x="14" y="22" class="lab" fill="${fg}">${esc(label)}</text>
    <text x="14" y="51" class="big" font-size="28" fill="${fg}" style="font-stretch:72%;word-spacing:3px">${esc(value)}</text>
  </g>`

const totalStr = fmt(total)
const totalSize = totalStr.length > 6 ? 92 : totalStr.length > 4 ? 108 : 124

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(total)} GitHub contributions in the last year; longest streak ${longest} days; current streak ${current} days">
<title>${fmt(total)} contributions in the last year</title>
<defs>
  <style>
    @font-face{font-family:"Archivo";src:url(data:font/woff2;base64,${fontB64}) format("woff2");font-weight:100 900;font-stretch:62% 125%}
    text{font-family:"Archivo",Impact,"Arial Narrow",sans-serif;fill:${INK}}
    .big{font-weight:900;font-stretch:62%}
    .lab{font-weight:800;font-stretch:100%;font-size:11px;letter-spacing:.14em}
    @keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
    @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .pop{transform-box:fill-box;transform-origin:left bottom;animation:pop .7s cubic-bezier(.3,1.4,.5,1) both}
    .dots{animation:rise .9s .2s ease-out both}
  </style>
  <pattern id="ht" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="1.5" fill="rgba(23,17,11,.10)"/></pattern>
</defs>
<rect x="14" y="14" width="${W - 24}" height="${H - 24}" fill="${INK}"/>
<rect x="4" y="4" width="${W - 24}" height="${H - 24}" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>
<rect x="7" y="7" width="${W - 30}" height="${H - 30}" fill="url(#ht)"/>

<g transform="translate(34,30) rotate(-1.5)">
  <rect x="5" y="5" width="250" height="34" fill="${INK}"/>
  <rect width="250" height="34" fill="#e23a2c" stroke="${INK}" stroke-width="4"/>
  <text x="14" y="23" class="lab" font-size="13" fill="#fff8ea" style="fill:#fff8ea">THE LAST 12 MONTHS</text>
</g>
<g class="pop">
  <text x="36" y="${170 + (124 - totalSize) * 0.2}" class="big" font-size="${totalSize}" fill="#ffd23f" stroke="${INK}" stroke-width="6" paint-order="stroke fill" style="fill:#ffd23f">${totalStr}</text>
</g>
<text x="40" y="212" class="big" font-size="30">CONTRIBUTIONS</text>
<text x="40" y="236" class="lab" font-size="12">${fmt(activeDays)} ACTIVE DAYS · @${esc(USER).toUpperCase()}</text>

<g class="dots">${months}${dots}</g>
<g transform="translate(${GX + gridW - 185},${GY + 7 * CELL + 16})"><text x="0" y="4" class="lab" font-size="10">LESS</text>${RAD.map((r, i) => `<circle cx="${44 + i * 14}" cy="0" r="${r}" fill="${COL[i]}"/>`).join("")}<text x="${44 + 5 * 14}" y="4" class="lab" font-size="10">MORE</text></g>

${chip(360, "LONGEST STREAK", `${fmt(longest)} day${longest === 1 ? "" : "s"}`, "#ffd23f")}
${chip(564, "CURRENT STREAK", `${fmt(current)} day${current === 1 ? "" : "s"}`, "#29b6e6")}
${chip(768, "BUSIEST DAY", busiest.count ? `${fmt(busiest.count)} · ${monthName(busiest.date)} ${Number(busiest.date.slice(8))}` : "—", "#fff8ea")}

<text x="40" y="${H - 52}" class="lab" font-size="10">UPDATED DAILY · ${new Date().toISOString().slice(0, 10)}</text>
</svg>`

fs.mkdirSync(path.join(ROOT, "assets"), { recursive: true })
fs.writeFileSync(path.join(ROOT, "assets", "stats.svg"), svg)
console.log(`stats.svg — ${fmt(total)} contributions, longest ${longest}, current ${current}, busiest ${busiest.date} (${busiest.count})`)
