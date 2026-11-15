// Shared pieces for the photo-led mock-up boards.
const BLOB: Record<string, string> = {
  deadlift: "0f13d002e82b9ac266d2057ae12e517c",
  squat: "92ae4a653936823858450158023093a5",
  bench: "844880abe74e94fe59d999ffced43cd7",
  ohp: "4c5c8c2686b0a3afcaa2bf7fb60aa851",
  db_row: "c120eb5004326ba5cad8a1eff5954070",
};

const CSS = `
body{margin:0}
.board{width:390px;height:844px;box-sizing:border-box;background:#07090b;color:#fafafa;font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative}
.board a{color:inherit;text-decoration:none}
.board p,.board h1,.board h2{margin:0}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase}
.disp{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;line-height:0.92}
.mono{font-family:'JetBrains Mono',monospace}
.muted{color:#a3a7ad}.sage{color:#8fd4b4}.mint{color:#6dc29c}
.t1{color:#f0806f}.t2{color:#e8a05a}.t3{color:#7ba6e6}
.rel{position:relative}
.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.tint{position:absolute;inset:0;background:#1f5e45;mix-blend-mode:color}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,9,11,0.45) 0%,rgba(7,9,11,0.1) 35%,rgba(7,9,11,0.88) 80%,#07090b 100%)}
.side{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,9,11,0.95) 0%,rgba(7,9,11,0.82) 50%,rgba(7,9,11,0.25) 100%)}
.figp{background:rgba(7,9,11,0.8);border-radius:14px;padding:8px 8px 6px;display:flex;flex-direction:column;align-items:center;gap:4px}
.figs{display:flex;gap:4px}
.cta{display:flex;align-items:center;justify-content:center;border:0;border-radius:16px;background:#4fa57f;color:#06130d !important;font:800 26px/1 'Barlow Condensed',sans-serif;letter-spacing:0.06em;text-transform:uppercase;height:60px;flex-shrink:0}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:rgba(7,9,11,0.7);font-size:13px;font-weight:700;color:#8fd4b4}
.row{display:grid;grid-template-columns:22px minmax(0,1fr) auto 12px;align-items:center;gap:10px;min-height:50px;border-top:1px solid rgba(255,255,255,0.07)}
.row .n{font-size:15px;font-weight:700}
.row .s{font-size:12px;color:#a3a7ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.row .w{text-align:right}.row .w b{font:800 28px/1 'Barlow Condensed',sans-serif}
.row .w span{display:block;font:500 11px 'JetBrains Mono',monospace;color:#a3a7ad}
.tier{font:700 11px 'JetBrains Mono',monospace}
.chev{color:#6b7078;font-size:18px}
.tile{background:#0f1418;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.tile b{font:800 30px/1 'Barlow Condensed',sans-serif}
.tile small{font-size:11px;color:#a3a7ad}
.nav{height:72px;border-top:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;background:#0b0e11;font-size:11px;font-weight:600;text-align:center;color:#a3a7ad;flex-shrink:0;margin-top:auto}
.nav .on{color:#6dc29c !important}
.fab{justify-self:center;width:52px;height:52px;border-radius:26px;background:#4fa57f;color:#06130d !important;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:500}
`;

const MCM_CSS = `
body{margin:0}
.board{width:390px;height:844px;box-sizing:border-box;background:#1b1512;color:#f3e9d8;font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative}
.board a{color:inherit;text-decoration:none}
.board p,.board h1,.board h2{margin:0}
.eyebrow{font-family:'Jost',sans-serif;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase}
.disp{font-family:'Jost',sans-serif;font-weight:800;text-transform:uppercase;line-height:0.95;letter-spacing:0.01em}
.mono{font-family:'DM Mono',monospace}
.muted{color:#b8a892}.must{color:#e0a93b}.orange{color:#ef7a4a}.teal{color:#6dbdb3}
.t1{color:#ef7a4a}.t2{color:#e0a93b}.t3{color:#6dbdb3}
.rel{position:relative}
.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.tint{position:absolute;inset:0;background:#a8602f;mix-blend-mode:color}
.arch{position:relative;overflow:hidden;border-radius:999px 999px 14px 14px;flex-shrink:0}
.stripes{display:flex;flex-direction:column;gap:3px}
.stripes i{display:block;height:4px;border-radius:2px}
.figs{display:flex;gap:4px}
.cta{display:flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:#e0a93b;color:#1b1512 !important;font:800 20px/1 'Jost',sans-serif;letter-spacing:0.14em;text-transform:uppercase;height:60px;flex-shrink:0}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:#2a201a;font-size:13px;font-weight:700;color:#e0a93b}
.row{display:grid;grid-template-columns:22px minmax(0,1fr) auto 12px;align-items:center;gap:10px;min-height:50px;border-top:1px solid rgba(243,233,216,0.1)}
.row .n{font-size:15px;font-weight:700}
.row .s{font-size:12px;color:#b8a892;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.row .w{text-align:right}.row .w b{font:800 26px/1 'Jost',sans-serif}
.row .w span{display:block;font:500 11px 'DM Mono',monospace;color:#b8a892}
.tier{font:500 11px 'DM Mono',monospace}
.chev{color:#7d6c5b;font-size:18px}
.nav{height:72px;border-top:1px solid rgba(243,233,216,0.1);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;background:#17110e;font-size:11px;font-weight:600;text-align:center;color:#b8a892;flex-shrink:0;margin-top:auto}
.nav .on{color:#e0a93b !important}
.fab{justify-self:center;width:52px;height:52px;border-radius:26px;background:#e0a93b;color:#1b1512 !important;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:500}
.cream{position:absolute;inset:0;background:#f3e9d8;color:#2a201a;display:flex;flex-direction:column}
.cream .muted{color:#6b5a4c}
.cream .nav{background:#ebdfc9;border-top-color:rgba(42,32,26,0.12);color:#6b5a4c}
.cream .nav .on{color:#9a4a22 !important}
.cream .fab{background:#2a201a;color:#f3e9d8 !important}
`;

/** Recolours the generated muscle figure from the app's sage ramp to the mid-century ramp. */
export function recolorMcm(html: string): string {
  const map: Record<string, string> = {
    "#294b39": "#553224", "#2b7351": "#84432a", "#31a773": "#bd5a31", "#4aefa7": "#f47c45",
    "#2e3034": "#3b2f27", "#202225": "#2b221d", "#17181b": "#211915", "#52555b": "#7d6c5b",
    "#07090b": "#1b1512",
  };
  return html.replace(/#[0-9a-f]{6}/g, (hex) => map[hex] ?? hex);
}

export function expand(html: string): string {
  return html
    .replace(/%%MHEAD (.+?)%%/g, (_, title) =>
      `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Jost:wght@500;600;700;800&display=swap" rel="stylesheet">\n<style>${MCM_CSS}</style>\n</helmet>\n<div class="board">`)
    .replace(/%%MNAV (\w+)%%/g, (_, on) => {
      const item = (key: string, label: string, href: string) =>
        `<a href="${href}"${key === on ? ' class="on"' : ""}>${label}</a>`;
      return `<nav class="nav" aria-label="Main">${item("today", "Today", "McmToday.dc.html")}${item("progress", "Progress", "McmProgress.dc.html")}<a href="#" class="fab" aria-label="Quick add">+</a>${item("log", "Log", "#")}${item("more", "More", "#")}</nav>`;
    })
    .replace(/%%STRIPES (\d+)%%/g, (_, w) =>
      `<span class="stripes" aria-hidden="true" style="width:${w}px"><i style="background:#ef7a4a"></i><i style="background:#e0a93b"></i><i style="background:#3f8f86"></i></span>`)
    .replace(/%%BURST (\d+) (\S+)%%/g, (_, size, color) => {
      const rays = Array.from({ length: 16 }, (_, i) => `<path d="M50 50 L50 ${i % 2 ? 14 : 4}" transform="rotate(${i * 22.5} 50 50)"/>`).join("");
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round">${rays}<circle cx="50" cy="50" r="5" fill="${color}" stroke="none"/></svg>`;
    })
    .replace(/%%HEAD (.+?)%%/g, (_, title) =>
      `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n<style>${CSS}</style>\n</helmet>\n<div class="board">`)
    .replace(/%%TAIL%%/g,
      `</div>\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>\nclass Component extends DCLogic {\nrenderVals() {\nreturn {};\n}\n}\n</script>\n</body>\n</html>\n`)
    .replace(/%%NAV (\w+)%%/g, (_, on) => {
      const item = (key: string, label: string, href: string) =>
        `<a href="${href}"${key === on ? ' class="on"' : ""}>${label}</a>`;
      return `<nav class="nav" aria-label="Main">${item("today", "Today", "PhotoToday.dc.html")}${item("progress", "Progress", "PhotoProgress.dc.html")}<a href="#" class="fab" aria-label="Quick add">+</a>${item("log", "Log", "#")}${item("more", "More", "#")}</nav>`;
    })
    .replace(/%%PHOTO (\w+) (\S+) (\S+)%%/g, (_, key, pos, bright) =>
      `<img class="ph" src="/_blob/${BLOB[key]}" alt="" style="object-position:${pos.replace(/_/g, " ")};filter:grayscale(1) contrast(1.12) brightness(${bright})"><span class="tint" aria-hidden="true"></span>`);
}
