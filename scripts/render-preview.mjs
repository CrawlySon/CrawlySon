// Vyrenderuje ukážkové obrazovky do PNG bez prehliadača (satori + resvg).
// Slúži len na náhľad dizajnu, nie je súčasťou aplikácie.
// Najprv nainštaluj nástroje (nie sú v závislostiach appky):
//   npm install --no-save satori@0.10.13 @resvg/resvg-js
// Spustenie: node scripts/render-preview.mjs
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const fontReg = readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
const fontBold = readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf");
mkdirSync("design", { recursive: true });

const C = {
  bg: "#f8fafc", card: "#ffffff", border: "#f1f5f9", ink: "#1e293b",
  sub: "#475569", mut: "#94a3b8", brand: "#16a34a", brand50: "#f0fdf4",
  brand100: "#dcfce7", brand700: "#15803d", blue: "#3b82f6", amber: "#f59e0b",
  red: "#ef4444", slate100: "#f1f5f9", slate200: "#e2e8f0",
};

// h(type, style, children)
const h = (type, style, children) => ({ type, props: { style, children } });
const col = (style, children) => h("div", { display: "flex", flexDirection: "column", ...style }, children);
const row = (style, children) => h("div", { display: "flex", flexDirection: "row", alignItems: "center", ...style }, children);
const txt = (style, s) => h("div", { display: "flex", ...style }, s);

const card = (style, children) =>
  col({ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, ...style }, children);

function bar(label, val, goal, color) {
  const pct = Math.min(100, (val / goal) * 100);
  return col({ marginBottom: 10 }, [
    row({ justifyContent: "space-between", fontSize: 13 }, [
      txt({ color: C.sub, fontWeight: 600 }, label),
      txt({ color: C.mut }, `${val} / ${goal} g`),
    ]),
    h("div", { display: "flex", marginTop: 4, height: 8, width: "100%", backgroundColor: C.slate100, borderRadius: 999 }, [
      h("div", { display: "flex", height: 8, width: `${pct}%`, backgroundColor: color, borderRadius: 999 }, []),
    ]),
  ]);
}

function mealItem(name, sub, kcal, ai) {
  return row({ justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.bg}` }, [
    col({ flex: 1 }, [
      txt({ fontSize: 14, fontWeight: 600, color: C.ink }, ai ? `${name}  *` : name),
      txt({ fontSize: 12, color: C.mut, marginTop: 2 }, sub),
    ]),
    txt({ fontSize: 14, fontWeight: 700, color: C.sub }, String(kcal)),
  ]);
}

function mealCard(title, total, items) {
  return card({ marginTop: 12, overflow: "hidden" }, [
    row({ justifyContent: "space-between", padding: "10px 16px" }, [
      row({}, [
        txt({ fontWeight: 700, color: C.sub, fontSize: 15 }, title),
        txt({ fontSize: 12, color: C.mut, marginLeft: 8 }, `${total} kcal`),
      ]),
      txt({ fontSize: 13, fontWeight: 600, color: C.brand }, "+ pridať"),
    ]),
    ...items,
  ]);
}

function donut(pct, big, small) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const ring = {
    type: "svg",
    props: {
      width: 128, height: 128, viewBox: "0 0 120 120",
      children: [
        { type: "circle", props: { cx: 60, cy: 60, r, fill: "none", stroke: C.slate200, strokeWidth: 12 } },
        { type: "circle", props: { cx: 60, cy: 60, r, fill: "none", stroke: C.brand, strokeWidth: 12, strokeLinecap: "round", strokeDasharray: circ, strokeDashoffset: circ * (1 - pct), transform: "rotate(-90 60 60)" } },
      ],
    },
  };
  return h("div", { display: "flex", width: 128, height: 128, position: "relative", alignItems: "center", justifyContent: "center" }, [
    ring,
    col({ position: "absolute", alignItems: "center", justifyContent: "center" }, [
      txt({ fontSize: 26, fontWeight: 700, color: C.ink }, big),
      txt({ fontSize: 11, color: C.mut }, small),
    ]),
  ]);
}

// ── DASHBOARD „Dnes" ──────────────────────────────────────────────
const dashboard = col({ width: 390, backgroundColor: C.bg, padding: 16 }, [
  row({ justifyContent: "space-between", marginBottom: 16 }, [
    txt({ width: 36, height: 36, backgroundColor: C.card, borderRadius: 999, justifyContent: "center", color: C.mut }, "‹"),
    txt({ fontSize: 18, fontWeight: 700, color: C.ink }, "Dnes"),
    txt({ width: 36, height: 36, backgroundColor: C.card, borderRadius: 999, justifyContent: "center", color: C.slate200 }, "›"),
  ]),
  card({ padding: 20 }, [
    row({ gap: 20 }, [
      donut(0.66, "1450", "/ 2200 kcal"),
      col({ flex: 1 }, [
        bar("Bielkoviny", 95, 150, C.blue),
        bar("Sacharidy", 160, 240, C.amber),
        bar("Tuky", 48, 70, C.red),
      ]),
    ]),
    txt({ marginTop: 16, padding: 12, backgroundColor: C.bg, borderRadius: 12, justifyContent: "center", fontSize: 13, color: C.sub }, "Ostáva ti 750 kcal do cieľa"),
  ]),
  mealCard("Raňajky", 420, [
    mealItem("Ovsené vločky", "60 g · B 8 · S 40 · T 4", 227, true),
    mealItem("Banán", "120 g · B 1 · S 27 · T 0", 107, false),
  ]),
  mealCard("Obed", 647, [
    mealItem("Sviečková na smotane", "250 g · B 10 · S 22 · T 20", 325, true),
    mealItem("Knedľa", "150 g · B 10 · S 64 · T 2", 322, true),
  ]),
  row({ marginTop: 18, justifyContent: "center" }, [
    txt({ backgroundColor: C.brand, color: "#fff", borderRadius: 999, padding: "14px 24px", fontWeight: 700, fontSize: 15 }, "+ Pridať jedlo"),
  ]),
]);

// ── AI SHEET ──────────────────────────────────────────────────────
function suggestion(name, sub, conf, ok, warn) {
  return card({ padding: 12, marginTop: 8 }, [
    row({ justifyContent: "space-between", alignItems: "flex-start" }, [
      col({ flex: 1 }, [
        txt({ fontWeight: 600, color: C.ink }, name),
        txt({ fontSize: 12, color: C.sub, marginTop: 2 }, sub),
        warn ? txt({ fontSize: 12, color: C.amber, marginTop: 2 }, `! ${warn}`) : txt({}, ""),
      ]),
      txt({ backgroundColor: ok ? C.brand100 : "#fef3c7", color: ok ? C.brand700 : "#b45309", borderRadius: 999, padding: "2px 8px", fontSize: 11 }, conf),
    ]),
  ]);
}
const sheet = col({ width: 390, backgroundColor: C.bg, padding: 16 }, [
  row({ justifyContent: "center", marginBottom: 12 }, [h("div", { display: "flex", width: 48, height: 6, borderRadius: 999, backgroundColor: C.slate200 }, [])]),
  row({ gap: 8, marginBottom: 12 }, [
    txt({ backgroundColor: C.card, color: C.sub, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "Raňajky"),
    txt({ backgroundColor: C.brand, color: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "Obed"),
    txt({ backgroundColor: C.card, color: C.sub, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "Večera"),
  ]),
  row({ backgroundColor: C.slate200, borderRadius: 12, padding: 4, marginBottom: 12 }, [
    txt({ flex: 1, backgroundColor: C.card, borderRadius: 8, padding: "6px 0", justifyContent: "center", fontSize: 13, fontWeight: 600 }, "AI / diktovanie"),
    txt({ flex: 1, padding: "6px 0", justifyContent: "center", fontSize: 13, color: C.mut }, "Z databázy"),
  ]),
  card({ padding: 12 }, [
    h("div", { display: "flex", border: `1px solid ${C.slate200}`, borderRadius: 12, padding: 12, minHeight: 70, fontSize: 13, color: C.sub }, "Zjedol som zhruba 400 g porciu sviečkovej s knedľou a vypil pol litra coly."),
    row({ marginTop: 8, gap: 8 }, [
      txt({ backgroundColor: C.slate100, color: C.sub, borderRadius: 12, padding: "8px 14px", fontSize: 13 }, "Diktovať"),
      txt({ flex: 1, backgroundColor: C.brand, color: "#fff", borderRadius: 12, padding: "8px 0", justifyContent: "center", fontSize: 13, fontWeight: 600 }, "Spracovať AI"),
    ]),
  ]),
  txt({ marginTop: 12, marginLeft: 4, fontSize: 13, fontWeight: 700, color: C.mut }, "Návrh (3) — skontroluj a uprav:"),
  suggestion("Sviečková na smotane", "250 g · 325 kcal · B 10 · S 22 · T 20", "85 %", true),
  suggestion("Knedľa", "150 g · 322 kcal · B 10 · S 64 · T 2", "70 %", false, "predpoklad ~150 g (6 plátkov)"),
  suggestion("Coca-Cola", "500 ml · 210 kcal · B 0 · S 53 · T 0", "95 %", true),
  card({ padding: 12, marginTop: 8 }, [
    row({ justifyContent: "space-between", fontSize: 13 }, [
      txt({ fontWeight: 700, color: C.sub }, "Spolu"),
      txt({ color: C.sub }, "857 kcal · B 20 · S 139 · T 22"),
    ]),
  ]),
  row({ marginTop: 16, gap: 8 }, [
    txt({ flex: 1, backgroundColor: C.slate100, color: C.sub, borderRadius: 12, padding: "10px 0", justifyContent: "center", fontWeight: 600 }, "Zrušiť"),
    txt({ flex: 1, backgroundColor: C.brand, color: "#fff", borderRadius: 12, padding: "10px 0", justifyContent: "center", fontWeight: 600 }, "Pridať (3)"),
  ]),
]);

// ── HISTÓRIA ──────────────────────────────────────────────────────
function histRow(day, kcal, goal, max, protein) {
  const over = kcal > goal;
  const pct = Math.min(100, (kcal / max) * 100);
  return col({ padding: "12px 16px", borderTop: `1px solid ${C.bg}` }, [
    row({ justifyContent: "space-between", fontSize: 13 }, [
      txt({ fontWeight: 600, color: C.sub }, day),
      txt({ color: over ? C.red : C.sub }, `${kcal} kcal`),
    ]),
    h("div", { display: "flex", marginTop: 6, height: 8, width: "100%", backgroundColor: C.slate100, borderRadius: 999 }, [
      h("div", { display: "flex", height: 8, width: `${pct}%`, backgroundColor: over ? "#f87171" : C.brand, borderRadius: 999 }, []),
    ]),
    txt({ marginTop: 4, fontSize: 11, color: C.mut }, `B ${protein} g`),
  ]);
}
const history = col({ width: 390, backgroundColor: C.bg, padding: 16 }, [
  txt({ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 16 }, "História"),
  row({ gap: 8, marginBottom: 16 }, [
    txt({ backgroundColor: C.card, color: C.sub, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "7 dni"),
    txt({ backgroundColor: C.brand, color: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "14 dni"),
    txt({ backgroundColor: C.card, color: C.sub, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "6px 12px", fontSize: 13 }, "30 dni"),
  ]),
  card({ padding: 16, marginBottom: 16 }, [
    txt({ fontSize: 13, color: C.mut }, "Priemerný denný príjem"),
    txt({ fontSize: 24, fontWeight: 700, color: C.ink }, "2065 kcal / cieľ 2200"),
  ]),
  card({}, [
    histRow("ut 3.6.", 1980, 2200, 2450, 55),
    histRow("st 2.6.", 2310, 2200, 2450, 105),
    histRow("ut 1.6.", 1870, 2200, 2450, 60),
    histRow("ne 31.5.", 2450, 2200, 2450, 110),
    histRow("so 30.5.", 1750, 2200, 2450, 50),
    histRow("pi 29.5.", 2090, 2200, 2450, 67),
  ]),
]);

const fonts = [
  { name: "DejaVu", data: fontReg, weight: 400, style: "normal" },
  { name: "DejaVu", data: fontBold, weight: 700, style: "normal" },
];

async function render(node, height, file) {
  const svg = await satori(node, { width: 390, height, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 780 } }).render().asPng();
  writeFileSync(file, png);
  console.log("→", file);
}

await render(dashboard, 760, "design/01-dnes.png");
await render(sheet, 720, "design/02-ai-vkladanie.png");
await render(history, 560, "design/03-historia.png");
console.log("Hotovo.");
