// ===================== Modèle de ventes GTA VI =====================
const DAY_MS = 86400000;
const last = GTA6_ANCHORS[GTA6_ANCHORS.length - 1];
const prev = GTA6_ANCHORS[GTA6_ANCHORS.length - 2];
const lastRate = (last.copies - prev.copies) / (last.day - prev.day); // M / jour
const k = Math.LN2 / GTA6_MODEL.halfLifeDays;
const floor = GTA6_MODEL.floorPerDay;

function copiesAt(day) {
  if (day <= 0) return 0;
  for (let i = 1; i < GTA6_ANCHORS.length; i++) {
    const a = GTA6_ANCHORS[i - 1], b = GTA6_ANCHORS[i];
    if (day <= b.day) return a.copies + (b.copies - a.copies) * (day - a.day) / (b.day - a.day);
  }
  const t = day - last.day;
  return last.copies + (lastRate - floor) * (1 - Math.exp(-k * t)) / k + floor * t;
}
function rateAt(day) { // M / jour
  for (let i = 1; i < GTA6_ANCHORS.length; i++) {
    const a = GTA6_ANCHORS[i - 1], b = GTA6_ANCHORS[i];
    if (day <= b.day) return (b.copies - a.copies) / (b.day - a.day);
  }
  return (lastRate - floor) * Math.exp(-k * (day - last.day)) + floor;
}
const daysNow = () => (Date.now() - GTA6_LAUNCH) / DAY_MS;
const gta6Now = () => copiesAt(daysNow());

// ===================== Formatage =====================
const nf = new Intl.NumberFormat("fr-FR");
const fmtInt = n => nf.format(Math.round(n));
const fmtM = (m, d = 1) => `${m.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} M`;
const fmtUSD = m => m >= 1000
  ? `${(m / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Md$`
  : `${Math.round(m).toLocaleString("fr-FR")} M$`;
const $ = s => document.querySelector(s);
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ===================== Tooltip =====================
const tip = $("#tooltip");
function showTip(html, x, y) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  tip.style.left = left + "px"; tip.style.top = top + "px";
}
const hideTip = () => { tip.hidden = true; };

// ===================== Compteur en direct =====================
function tickLive() {
  const d = daysNow();
  const c = copiesAt(d) * 1e6;
  $("#live-copies").textContent = fmtInt(c);
  $("#live-revenue").textContent = fmtUSD(c / 1e6 * GTA6_MODEL.avgPriceUSD);
  const perSec = rateAt(d) * 1e6 / 86400;
  $("#live-rate").textContent = `≈ ${perSec.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} / seconde`;
  const days = Math.floor(d), hours = Math.floor((d - days) * 24), mins = Math.floor(((d - days) * 24 - hours) * 60);
  $("#live-elapsed").textContent = `${days} j ${hours} h ${String(mins).padStart(2, "0")} min`;
  const v = GAMES.find(g => g.id === "gta5").lifetime;
  $("#live-vs-v").textContent = `${(c / 1e6 / v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

// ===================== Graphique 1 : courbe cumulée =====================
function drawCurve() {
  const box = $("#chart-curve"); box.innerHTML = "";
  const W = box.clientWidth || 800, H = 320, m = { t: 16, r: 20, b: 36, l: 56 };
  const now = daysNow();
  const xMax = Math.max(30, Math.ceil(now / 5) * 5 + 10);
  const yMax = niceMax(copiesAt(xMax) * 1.05);
  const x = d => m.l + d / xMax * (W - m.l - m.r);
  const y = v => H - m.b - v / yMax * (H - m.t - m.b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": `Ventes cumulées estimées de GTA VI : ${fmtM(copiesAt(now))} aujourd'hui` }, box);

  // grille + axes
  for (let i = 0; i <= 4; i++) {
    const v = yMax * i / 4;
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? "grid" : "axis" }, svg);
    el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg).textContent = `${Math.round(v)} M`;
  }
  const step = xMax > 40 ? 10 : 5;
  for (let d = 0; d <= xMax; d += step) {
    el("text", { x: x(d), y: H - m.b + 18, "text-anchor": "middle", class: "tick" }, svg).textContent = d === 0 ? "Sortie" : `J+${d}`;
  }

  // lignes de référence : autres GTA dépassés
  let lastLabelY = -Infinity;
  for (const g of GAMES.filter(g => !g.live && g.lifetime < yMax && !g.handheld && g.lifetime > 15).sort((a, b) => b.lifetime - a.lifetime)) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(g.lifetime), y2: y(g.lifetime), class: "ref" }, svg);
    let ly = y(g.lifetime) - 4;
    if (ly - lastLabelY < 13) ly = y(g.lifetime) + 13; // évite le chevauchement des étiquettes
    lastLabelY = ly;
    el("text", { x: W - m.r - 4, y: ly, "text-anchor": "end", class: "ref-label" }, svg)
      .textContent = `${g.name} (vie entière) : ${fmtM(g.lifetime)}`;
  }

  const pts = (a, b) => { const out = []; for (let d = a; d <= b; d += (b - a) / 200) out.push(`${x(d)},${y(copiesAt(d))}`); out.push(`${x(b)},${y(copiesAt(b))}`); return out.join(" "); };
  const nowC = Math.min(now, xMax);
  // aire sous la courbe passée
  el("polygon", { points: `${x(0)},${y(0)} ${pts(0.0001, nowC)} ${x(nowC)},${y(0)}`, class: "area" }, svg);
  el("polyline", { points: `${x(0)},${y(0)} ${pts(0.0001, nowC)}`, class: "line live" }, svg);
  el("polyline", { points: pts(nowC, xMax), class: "line proj" }, svg);

  // ancrages publiés
  for (const a of GTA6_ANCHORS.filter(a => a.source)) {
    el("circle", { cx: x(a.day), cy: y(a.copies), r: 5, class: "anchor" }, svg);
  }
  // point "maintenant"
  el("circle", { cx: x(nowC), cy: y(copiesAt(nowC)), r: 6, class: "now" }, svg);
  el("text", { x: x(nowC) - 10, y: y(copiesAt(nowC)) - 12, "text-anchor": "end", class: "now-label" }, svg)
    .textContent = `Maintenant : ${fmtM(copiesAt(nowC))}`;

  // couche de survol (crosshair)
  const cross = el("line", { y1: m.t, y2: H - m.b, class: "cross", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 5, class: "hover-dot", visibility: "hidden" }, svg);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  hit.addEventListener("pointermove", e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * W / r.width;
    let d = Math.max(0, Math.min(xMax, (px - m.l) / (W - m.l - m.r) * xMax));
    const anchor = GTA6_ANCHORS.find(a => a.source && Math.abs(x(a.day) - px) < 8);
    if (anchor) d = anchor.day;
    const c = copiesAt(d);
    cross.setAttribute("x1", x(d)); cross.setAttribute("x2", x(d)); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(d)); dot.setAttribute("cy", y(c)); dot.setAttribute("visibility", "visible");
    const date = new Date(GTA6_LAUNCH + d * DAY_MS).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const kind = anchor ? `Estimation publiée · ${anchor.source}` : d <= now ? "Estimation (modèle)" : "Projection";
    showTip(`<strong>${date}</strong> · J+${d.toFixed(1).replace(".", ",")}<br>${fmtM(c)} exemplaires<br><span class="muted">${kind}</span>`, e.clientX, e.clientY);
  });
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
}

// ===================== Barres horizontales génériques =====================
function drawBars(box, rows, { value, label, fmt, tipHtml }) {
  box.innerHTML = "";
  const W = box.clientWidth || 800, rowH = 34, small = W < 560, m = { t: 8, r: small ? 110 : 150, b: 8, l: small ? 130 : 220 };
  const H = m.t + m.b + rows.length * rowH;
  const max = niceMax(Math.max(...rows.map(value)));
  const x = v => m.l + v / max * (W - m.l - m.r);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Graphique en barres" }, box);
  rows.forEach((r, i) => {
    const yy = m.t + i * rowH, bh = rowH - 10;
    const g = el("g", { class: "bar-row" }, svg);
    el("rect", { x: 0, y: yy, width: W, height: rowH, fill: "transparent" }, g);
    el("text", { x: m.l - 10, y: yy + bh / 2 + 9, "text-anchor": "end", class: r.live ? "bar-label strong" : "bar-label" }, g).textContent = label(r);
    const w = Math.max(4, x(value(r)) - m.l);
    el("path", { d: `M${m.l},${yy + 5} h${w - 4} a4,4 0 0 1 4,4 v${bh - 8} a4,4 0 0 1 -4,4 h${-(w - 4)} z`, class: r.live ? "bar live" : "bar" }, g);
    el("text", { x: m.l + w + 8, y: yy + bh / 2 + 9, class: "bar-value" }, g).textContent = fmt(r);
    g.addEventListener("pointermove", e => showTip(tipHtml(r), e.clientX, e.clientY));
    g.addEventListener("pointerleave", hideTip);
  });
}

// ===================== Graphique 2 : jour 1 =====================
function drawLaunch() {
  const rows = GAMES.filter(g => g.day1);
  drawBars($("#chart-launch"), rows, {
    value: r => r.day1,
    label: r => `${r.name} (${r.year})`,
    fmt: r => `${fmtM(r.day1)} · ${fmtUSD(r.day1Rev)}`,
    tipHtml: r => `<strong>${r.name}</strong><br>Jour 1 : ${fmtM(r.day1)} exemplaires<br>Recettes jour 1 : ${fmtUSD(r.day1Rev)}${r.live ? '<br><span class="muted">Estimation Sensor Tower (numérique)</span>' : ""}`,
  });
}

// ===================== Onglet comparaison =====================
const lifetime = g => g.live ? gta6Now() : g.lifetime;

function drawAll() {
  const withHandheld = $("#spin-offs").checked;
  const sort = $("#sort-select").value;
  let rows = GAMES.filter(g => withHandheld || !g.handheld);
  rows = rows.slice().sort(sort === "year" ? (a, b) => a.year - b.year : (a, b) => lifetime(b) - lifetime(a));
  drawBars($("#chart-all"), rows, {
    value: lifetime,
    label: r => (box => box.clientWidth < 560 ? r.name.replace("Liberty City Stories", "LCS").replace("Vice City Stories", "VCS").replace("San Andreas", "San Andr.") : `${r.name} (${r.year})`)($("#chart-all")),
    fmt: r => (r.approx ? "≈ " : "") + fmtM(lifetime(r), lifetime(r) >= 100 ? 0 : 1) + (r.live ? " · direct" : ""),
    tipHtml: r => `<strong>${r.name}</strong> (${r.year})<br>${r.live ? "Ventes estimées en direct" : "Ventes totales"} : ${fmtM(lifetime(r))}<br><span class="muted">${r.platforms}</span>`,
  });
}

function fillTable() {
  const tb = $("#table-all tbody"); tb.innerHTML = "";
  for (const g of GAMES) {
    const tr = document.createElement("tr");
    if (g.live) tr.className = "live-row";
    tr.innerHTML = `<td>${g.name}</td><td>${g.year}</td>
      <td class="num" ${g.live ? 'data-live="1"' : ""}>${(g.approx ? "≈ " : "") + fmtM(lifetime(g))}</td>
      <td class="num">${g.day1 ? fmtM(g.day1) : "—"}</td>
      <td class="num">${g.day1Rev ? fmtUSD(g.day1Rev) : "—"}</td><td>${g.platforms}</td>`;
    tb.appendChild(tr);
  }
}

function setupVersus() {
  const a = $("#pick-a"), b = $("#pick-b");
  for (const s of [a, b]) for (const g of GAMES) s.add(new Option(`${g.name} (${g.year})`, g.id));
  a.value = "gta6"; b.value = "gta5";
  a.onchange = b.onchange = renderVersus;
  renderVersus();
}
function renderVersus() {
  const A = GAMES.find(g => g.id === $("#pick-a").value), B = GAMES.find(g => g.id === $("#pick-b").value);
  const metric = (name, va, vb, fmt) => {
    if (va == null || vb == null) return `<div class="vm"><div class="vm-name">${name}</div><div class="vm-vals"><span>${va == null ? "n.d." : fmt(va)}</span><span>${vb == null ? "n.d." : fmt(vb)}</span></div></div>`;
    const tot = va + vb, pa = va / tot * 100;
    const ratio = va >= vb ? `${A.name} × ${(va / vb).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : `${B.name} × ${(vb / va).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`;
    return `<div class="vm"><div class="vm-name">${name} <span class="muted">· ${va === vb ? "égalité" : ratio}</span></div>
      <div class="vm-bar"><span class="a" style="width:${pa}%"></span><span class="b" style="width:${100 - pa}%"></span></div>
      <div class="vm-vals"><span>${fmt(va)}</span><span>${fmt(vb)}</span></div></div>`;
  };
  const age = g => g.live ? `${Math.floor(daysNow())} jours` : `${2026 - g.year} ans`;
  $("#versus").innerHTML = `
    <div class="vs-head"><span class="sw a"></span><strong>${A.name}</strong><span class="muted">${A.year} · ${A.platforms} · sorti il y a ${age(A)}</span></div>
    <div class="vs-head right"><span class="muted">${B.year} · ${B.platforms} · sorti il y a ${age(B)}</span><strong>${B.name}</strong><span class="sw b"></span></div>
    ${metric("Ventes totales", lifetime(A), lifetime(B), v => fmtM(v))}
    ${metric("Ventes jour 1", A.day1, B.day1, v => fmtM(v))}
    ${metric("Recettes jour 1", A.day1Rev, B.day1Rev, fmtUSD)}`;
}

// ===================== Onglets + boucle =====================
document.querySelectorAll(".tabs button").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b === btn));
  document.querySelectorAll(".tab-panel").forEach(p => p.hidden = p.id !== `tab-${btn.dataset.tab}`);
  location.hash = btn.dataset.tab;
  drawAllCharts();
}));
if (location.hash === "#compare") document.querySelector('[data-tab="compare"]').click();

function drawAllCharts() {
  if (!$("#tab-live").hidden) { drawCurve(); drawLaunch(); }
  if (!$("#tab-compare").hidden) { drawAll(); fillTable(); renderVersus(); }
}
$("#spin-offs").onchange = $("#sort-select").onchange = drawAll;
setupVersus();
tickLive(); drawAllCharts();
setInterval(tickLive, 100);
setInterval(() => { // rafraîchit les valeurs "direct" hors compteur
  if (!$("#tab-compare").hidden) {
    document.querySelectorAll('[data-live="1"]').forEach(td => td.textContent = fmtM(gta6Now()));
    drawAll(); renderVersus();
  } else drawCurve();
}, 5000);
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawAllCharts, 150); });
