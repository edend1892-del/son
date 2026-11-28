/* =====================================================================
 *  TRAVÉE — Bâtisseurs de ponts
 *  game.js : rendu Canvas 2D, interface, commandes tactiles / souris /
 *  clavier, sons synthétisés (WebAudio), sauvegarde (localStorage).
 *  Port de src/main.cpp, adapté aux écrans tactiles.
 * ===================================================================== */
(function () {
'use strict';
const TV = window.TV;
const { MATS, VTYPES } = TV;
const IN_APP = !!window.TRAVEE_APP;          // défini par l'APK Android

// ============================================================ canevas
const cv = document.getElementById('jeu');
const ctx = cv.getContext('2d');
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
let cssW = 0, cssH = 0, dpr = 1, U = 1, gW = 1280, gH = 760;
const TOPBAR = 62, BOTBAR = 106;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const F = {
    title: '700 46px ' + FONT, h1: '700 21px ' + FONT, h2: '700 16px ' + FONT,
    body: '14.5px ' + FONT, small: '13px ' + FONT, tiny: '11.5px ' + FONT,
};

function resize() {
    cssW = Math.max(1, window.innerWidth); cssH = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    U = isTouch ? TV.clamp(Math.min(cssW / 900, cssH / 520), 0.5, 1.6) : TV.clamp(Math.min(cssW / 1280, cssH / 760), 0.6, 1.5);
    gW = cssW / U; gH = cssH / U;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    if (scr !== SCR_MENU) fitCamera(levels[cur]);
}

// ============================================================ état
const SCR_MENU = 0, SCR_BUILD = 1, SCR_SIM = 2;
let scr = SCR_MENU;
const levels = TV.makeLevels();
let saved = levels.map(L => TV.initialDesign(L));
let best = levels.map(() => -1);
let cur = 0;
let design = TV.initialDesign(levels[0]);
let undoS = [], redoS = [];
const sim = new TV.Sim();
const demo = new TV.Sim();
const DEMO_LEVEL = 1;
const demoDesign = TV.initialDesign(levels[DEMO_LEVEL]);
TV.ref.truss(demoDesign, levels[DEMO_LEVEL], TV.v2(0, 0), TV.v2(14, 0), 7, 1.7, TV.M_ROAD, TV.M_STEEL, TV.M_STEEL);
demo.init(levels[DEMO_LEVEL], demoDesign);

let gMat = TV.M_ROAD;
let camX = 5, camY = 0, zoom = 40;
let gMx = -1000, gMy = -1000, mwx = 0, mwy = 0;
let drawing = false, chain = false, startX = 0, startY = 0;
let hoverNode = -1, hoverBeam = -1, sel = -1;
let showStress = false, showGrid = true, paused = false, help = false, muted = false;
let speedIdx = 2;
const SPEEDS = [0.25, 0.5, 1, 2];
let animT = 0, toastMsg = '', toastT = 0, winT = -1, resultDismissed = false, firstRun = false;
let btns = [], btnsPrev = [], pressBtn = 0;
let trees = [];

const B_MENU = 1, B_UNDO = 2, B_REDO = 3, B_CLEAR = 4, B_HELP = 5, B_PLAY = 6, B_SPEED = 7, B_HYD = 8, B_STRESS = 9, B_PAUSE = 10,
      B_NEXT = 11, B_EDIT = 12, B_WATCH = 13, B_HELPCLOSE = 14, B_DEL = 15, B_EXTM = 16, B_EXTP = 17, B_ENDCHAIN = 18,
      B_FULL = 19, B_SOUND = 20, B_APK = 21, B_EXE = 22, B_FIT = 23, B_MAT = 100, B_LEVEL = 200;

// ============================================================ thèmes
function th(a) { return { sky0: a[0], sky1: a[1], sun: a[2], hillFar: a[3], hillMid: a[4], ground0: a[5], ground1: a[6], grass: a[7], water0: a[8], water1: a[9], trunk: a[10], leaf: a[11], treeKind: a[12] }; }
const THEMES = [
    th([0x7FB8F0, 0xE4F4FF, 0xFFF4B8, 0xA9C9B0, 0x83B582, 0x9A7357, 0x5E4232, 0x6DBE45, 0x4FA6DA, 0x1C5F8F, 0x6D4C41, 0x4E9F3D, 0]),
    th([0xF5C77E, 0xFDE3C2, 0xFFF1C9, 0xE9BE8A, 0xD39B63, 0xD9A066, 0x9C5F36, 0xEBCB8B, 0x3FB8C9, 0x1A7180, 0x5D7F3A, 0x6E9C45, 1]),
    th([0x9DBEEB, 0xDDEEFA, 0xFFFFFF, 0xC5D3E3, 0x97ACC2, 0x7E8B9B, 0x4B5664, 0xF4F8FC, 0x5AA9D6, 0x22587F, 0x5D4037, 0x2E6B4A, 2]),
    th([0x2C1F55, 0xF59A6E, 0xFFC58A, 0x6A4A7A, 0x46335E, 0x6E5264, 0x35263A, 0x59B07F, 0x4A6A9C, 0x1A2A4E, 0x3E2C2C, 0x2F5A4F, 3]),
];

// ============================================================ utilitaires
function col(c, a) { return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a === undefined ? 1 : a})`; }
function shade(c, f) {
    const ch = s => Math.min(255, Math.max(0, Math.floor(((c >> s) & 255) * f))) << s;
    return ch(16) | ch(8) | ch(0);
}
function mix(a, b, t) {
    const ch = s => { const va = (a >> s) & 255, vb = (b >> s) & 255; return Math.floor(va + (vb - va) * t) << s; };
    return ch(16) | ch(8) | ch(0);
}
function money(v) {
    const n = Math.round(v), neg = n < 0;
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + s + ' $';
}
const fnum = (v, d = 1) => v.toFixed(d).replace('.', ',');

// --------------------------------------------------------- caméra
const viewCY = () => scr === SCR_MENU ? gH * 0.5 : (TOPBAR + (gH - BOTBAR)) * 0.5;
const SX = x => gW * 0.5 + (x - camX) * zoom;
const SY = y => viewCY() - (y - camY) * zoom;
const WX = sx => camX + (sx - gW * 0.5) / zoom;
const WY = sy => camY - (sy - viewCY()) / zoom;

function fitCamera(L) {
    const aw = gW - 40, ah = gH - TOPBAR - BOTBAR - 30;
    zoom = TV.clamp(Math.min(aw / (L.vx1 - L.vx0), ah / (L.vy1 - L.vy0)), 6, 140);
    camX = (L.vx0 + L.vx1) * 0.5;
    camY = (L.vy0 + L.vy1) * 0.5;
}

// ============================================================ audio
const audio = (() => {
    const RATE = 22050;
    let ac = null, bufs = null;
    function noise(st) { return TV.frand(st) * 2 - 1; }
    function make(dur, fn) {
        const n = Math.floor(dur * RATE), a = new Float32Array(n);
        for (let i = 0; i < n; i++) a[i] = TV.clamp(fn(i / RATE), -1, 1) * 0.92;
        return a;
    }
    function gen() {
        const r = { s: 1234567 }, PI2 = Math.PI * 2, out = {};
        { let ph = 0; out.place = make(0.09, t => { const f = 520 - 1800 * t; ph += PI2 * f / RATE; return (Math.sin(ph) * 0.6 + noise(r) * 0.15 * Math.exp(-t * 90)) * Math.exp(-t * 38); }); }
        { let lp = 0; out.del = make(0.12, t => { lp += (noise(r) - lp) * 0.25; return lp * 1.2 * Math.exp(-t * 30); }); }
        { let lp = 0, ph = 0; out.brk = make(0.55, t => { lp += (noise(r) - lp) * 0.55; ph += PI2 * (95 - 60 * t) / RATE; return lp * 0.9 * Math.exp(-t * 14) + Math.sin(ph) * 0.7 * Math.exp(-t * 7); }); }
        { let lp = 0; out.splash = make(0.8, t => { lp += (noise(r) - lp) * (0.12 + 0.2 * Math.exp(-t * 4)); return lp * 1.6 * Math.min(1, t * 30) * Math.exp(-t * 4.5); }); }
        out.win = make(0.9, t => { const notes = [523.25, 659.25, 783.99, 1046.5]; const k = Math.min(3, Math.floor(t / 0.13)); const lt = t - k * 0.13, f = notes[k];
            return (Math.sin(PI2 * f * t) * 0.5 + Math.sin(PI2 * f * 2 * t) * 0.15) * Math.exp(-lt * (k === 3 ? 3 : 9)); });
        out.fail = make(0.7, t => { const f = t < 0.25 ? 330 : 247, lt = t < 0.25 ? t : t - 0.25; return (Math.sin(PI2 * f * t) > 0 ? 0.35 : -0.35) * Math.exp(-lt * 5) * 0.8; });
        out.click = make(0.03, t => Math.sin(PI2 * 1800 * t) * Math.exp(-t * 200) * 0.5);
        { let ph = 0; out.hyd = make(1.0, t => { ph += (70 + 40 * t) / RATE; const saw = 2 * (ph - Math.floor(ph)) - 1; const env = Math.min(1, t * 8) * Math.min(1, (1 - t) * 6); return saw * 0.25 * env + noise(r) * 0.04 * env; }); }
        out.arrive = make(0.45, t => (Math.sin(PI2 * 880 * t) * 0.35 + Math.sin(PI2 * 1320 * t) * 0.2) * Math.exp(-t * 9));
        out.horn = make(1.3, t => { const env = Math.min(1, t * 10) * Math.min(1, (1.3 - t) * 5); return (Math.sin(PI2 * 140 * t) + 0.5 * Math.sin(PI2 * 210 * t) + 0.25 * Math.sin(PI2 * 280 * t)) * 0.3 * env; });
        return out;
    }
    return {
        unlock() {
            if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            try {
                ac = new AC();
                const raw = gen();
                bufs = {};
                for (const k in raw) { const b = ac.createBuffer(1, raw[k].length, RATE); b.getChannelData(0).set(raw[k]); bufs[k] = b; }
            } catch (e) { ac = null; }
        },
        play(name, vol) {
            if (!ac || !bufs || muted) return;
            const s = ac.createBufferSource(), g = ac.createGain();
            s.buffer = bufs[name]; g.gain.value = TV.clamp(vol === undefined ? 1 : vol, 0, 1.5) * 0.8;
            s.connect(g); g.connect(ac.destination); s.start();
        },
    };
})();

// ============================================================ sauvegarde
const SAVE_KEY = 'travee.sauvegarde.v1';
function validDesign(D, L) {
    if (D.nodes.length < L.anchors.length) return false;
    for (let i = 0; i < L.anchors.length; i++)
        if (!D.nodes[i].anchor || TV.vlen(D.nodes[i].p.x - L.anchors[i].x, D.nodes[i].p.y - L.anchors[i].y) > 1e-3) return false;
    for (let i = L.anchors.length; i < D.nodes.length; i++) if (D.nodes[i].anchor) return false;
    for (const b of D.beams) {
        if (!(b.a >= 0 && b.b >= 0 && b.a < D.nodes.length && b.b < D.nodes.length && b.a !== b.b)) return false;
        if (!(b.mat >= 0 && b.mat < TV.M_COUNT) || !((L.mats >> b.mat) & 1)) return false;
        if (D.beamLen(b) > MATS[b.mat].maxLen + 0.01) return false;
    }
    return true;
}
function saveGame() {
    if (scr !== SCR_MENU) saved[cur] = design;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            v: 1, best, muted,
            designs: saved.map(D => ({ n: D.nodes.map(n => [+n.p.x.toFixed(4), +n.p.y.toFixed(4), n.anchor ? 1 : 0]), b: D.beams.map(b => [b.a, b.b, b.mat, +b.ext.toFixed(3)]) })),
        }));
    } catch (e) { /* stockage indisponible */ }
}
function loadGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data || data.v !== 1) { firstRun = true; return; }
    if (Array.isArray(data.best)) data.best.forEach((b, i) => { if (i < best.length && typeof b === 'number') best[i] = b; });
    muted = !!data.muted;
    if (Array.isArray(data.designs)) data.designs.forEach((d, i) => {
        if (i >= levels.length || !d) return;
        try {
            const D = new TV.Design();
            D.nodes = d.n.map(a => ({ p: TV.v2(+a[0], +a[1]), anchor: !!a[2] }));
            D.beams = d.b.map(a => ({ a: a[0] | 0, b: a[1] | 0, mat: a[2] | 0, ext: +a[3] || 1 }));
            if (validDesign(D, levels[i])) saved[i] = D;
        } catch (e) { /* conception ignorée */ }
    });
}

// ============================================================ dessin : bases
function rrPath(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
function fillRound(x, y, w, h, r, c) { rrPath(x, y, w, h, r); ctx.fillStyle = c; ctx.fill(); }
function strokeRound(x, y, w, h, r, c, lw) { rrPath(x, y, w, h, r); ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke(); }
function fitText(s, font, maxW) {
    ctx.font = font;
    if (ctx.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; }
    return s.slice(0, lo) + '…';
}
function text(s, font, x, y, c, align, valign) {
    ctx.font = font; ctx.fillStyle = c;
    ctx.textAlign = align === 1 ? 'center' : (align === 2 ? 'right' : 'left');
    ctx.textBaseline = valign === 1 ? 'middle' : (valign === 2 ? 'bottom' : 'top');
    ctx.fillText(s, x, y);
}
function textW(s, font) { ctx.font = font; return ctx.measureText(s).width; }
function wrapText(s, font, x, y, maxW, lh, c) {
    ctx.font = font;
    const words = s.split(' ');
    let lineS = '', yy = y;
    for (const w of words) {
        const t = lineS ? lineS + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && lineS) { text(lineS, font, x, yy, c); lineS = w; yy += lh; }
        else lineS = t;
    }
    if (lineS) text(lineS, font, x, yy, c);
    return yy + lh;
}
function line(ax, ay, bx, by, c, w, round) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = round === false ? 'butt' : 'round';
    ctx.stroke();
}
function disc(x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
function ring(x, y, r, c, w) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
function polyPath(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }
function star(cx, cy, r, fill, outline) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i & 1) ? r * 0.45 : r;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.stroke();
}

// boutons (mode immédiat)
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function regBtn(id, r) { btns.push({ id, r }); }
function button(id, r, label, c, active, font, enabled) {
    if (enabled === undefined) enabled = true;
    const hot = enabled && !isTouch && hit(r, gMx, gMy);
    const down = enabled && pressBtn === id;
    let k = enabled ? c : 0x7A8290;
    if (active) k = mix(k, 0xFFFFFF, 0.18);
    if (hot) k = mix(k, 0xFFFFFF, 0.12);
    if (down) k = shade(k, 0.85);
    fillRound(r.x, r.y + 2, r.w, r.h, 9, col(0, 0.24));
    fillRound(r.x, r.y + (down ? 1 : 0), r.w, r.h, 9, col(k));
    if (active) strokeRound(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 8, col(0xFFFFFF, 0.86), 2);
    if (label) {
        const f = font || F.h2;
        text(fitText(label, f, r.w - 10), f, r.x + r.w * 0.5, r.y + r.h * 0.5 + (down ? 1 : 0), enabled ? '#fff' : '#d0d4da', 1, 1);
    }
    if (enabled) regBtn(id, r);
}

// ============================================================ dessin : décor
function buildTrees(L, idx) {
    trees = [];
    const r = { s: (777 + idx * 131) >>> 0 };
    let bx0 = 1e9, bx1 = -1e9;
    for (const a of L.anchors) { bx0 = Math.min(bx0, a.x); bx1 = Math.max(bx1, a.x); }
    for (const P of L.terrain) {
        const n = P.pts.length;
        for (let i = 0; i < n; i++) {
            const a = P.pts[i], b = P.pts[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, l = TV.vlen(ex, ey) || 1;
            if (-ex / l < 0.8) continue;   // normale sortante vers le haut
            let x0 = Math.max(Math.min(a.x, b.x), L.vx0 - 40), x1 = Math.min(Math.max(a.x, b.x), L.vx1 + 40);
            for (let x = x0 + 1.5 + TV.frand(r) * 3; x < x1 - 1; x += 3 + TV.frand(r) * 5) {
                if (x > bx0 - 4 && x < bx1 + 4) continue;
                if (Math.abs(x - L.spawnX[0]) < 1 || Math.abs(x - L.goalX[0]) < 2.5 || Math.abs(x - L.goalX[1]) < 2.5) continue;
                const t = (x - a.x) / (b.x - a.x);
                trees.push({ x, y: a.y + (b.y - a.y) * t, s: 0.8 + TV.frand(r) * 0.7, kind: Math.floor(TV.frand(r) * 3) });
            }
        }
    }
}

function drawTree(t, T) {
    const bx = SX(t.x), by = SY(t.y), z = zoom * t.s;
    if (T.treeKind === 0) {
        line(bx, by, bx, by - 1.6 * z, col(T.trunk), Math.max(2, 0.22 * z));
        const lc = t.kind === 0 ? T.leaf : (t.kind === 1 ? shade(T.leaf, 0.85) : mix(T.leaf, 0xB5D96B, 0.3));
        disc(bx, by - 2.2 * z, 0.95 * z, col(shade(lc, 0.85)));
        disc(bx - 0.5 * z, by - 1.8 * z, 0.7 * z, col(lc));
        disc(bx + 0.55 * z, by - 1.9 * z, 0.65 * z, col(lc));
        disc(bx + 0.1 * z, by - 2.6 * z, 0.6 * z, col(mix(lc, 0xFFFFFF, 0.12)));
    } else if (T.treeKind === 1) {
        const c = col(T.leaf), w = 0.32 * z;
        line(bx, by, bx, by - 2 * z, c, w);
        line(bx, by - z, bx - 0.55 * z, by - z, c, w * 0.8); line(bx - 0.55 * z, by - z, bx - 0.55 * z, by - 1.6 * z, c, w * 0.8);
        line(bx, by - 1.3 * z, bx + 0.5 * z, by - 1.3 * z, c, w * 0.8); line(bx + 0.5 * z, by - 1.3 * z, bx + 0.5 * z, by - 1.75 * z, c, w * 0.8);
        if (t.kind === 0) disc(bx, by - 2.05 * z, 0.12 * z, col(0xF06292));
    } else {
        line(bx, by, bx, by - 0.6 * z, col(T.trunk), Math.max(2, 0.2 * z));
        for (let k = 0; k < 3; k++) {
            const y0 = by - (0.4 + k * 0.75) * z, hw = (1 - k * 0.25) * z;
            polyPath([bx - hw, y0, bx + hw, y0, bx, y0 - 1.25 * z]); ctx.fillStyle = col(k === 1 ? shade(T.leaf, 0.9) : T.leaf); ctx.fill();
            if (T.treeKind === 2) { polyPath([bx - hw * 0.35, y0 - 0.85 * z, bx + hw * 0.35, y0 - 0.85 * z, bx, y0 - 1.25 * z]); ctx.fillStyle = '#f7fbff'; ctx.fill(); }
        }
    }
}

function drawSky(T, L) {
    let g = ctx.createLinearGradient(0, 0, 0, gH);
    g.addColorStop(0, col(T.sky0)); g.addColorStop(1, col(T.sky1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, gW + 2, gH + 2);
    const sx = gW * 0.78 - camX * 0.6, sy = gH * (T.treeKind === 3 ? 0.55 : 0.2);
    for (let k = 4; k >= 1; k--) disc(sx, sy, 30 + k * 16, col(T.sun, 0.07));
    disc(sx, sy, 34, col(T.sun));
    for (let i = 0; i < 6; i++) {
        const span = gW + 400;
        let x = (i * 397 + animT * (4 + i * 1.3) - camX * zoom * 0.15) % span;
        if (x < 0) x += span;
        x -= 200;
        const y = 50 + (i * 53) % 170, s = 0.7 + (i % 3) * 0.25;
        ctx.fillStyle = T.treeKind === 3 ? col(0xFFD9C2, 0.27) : col(0xFFFFFF, 0.75);
        ctx.beginPath();
        ctx.ellipse(x + 60 * s, y + 17 * s, 60 * s, 17 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 57 * s, y + 4 * s, 35 * s, 22 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 86 * s, y + 9 * s, 28 * s, 17 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    const base = SY(L.waterY + 1);
    for (let layer = 0; layer < 2; layer++) {
        const par = layer === 0 ? 0.25 : 0.5;
        const amp = (layer === 0 ? 4.2 : 2.6) * Math.min(zoom, 40);
        ctx.beginPath(); ctx.moveTo(0, gH + 2);
        for (let x = 0; x <= gW + 16; x += 16) {
            const u = (x - gW * 0.5) / Math.max(zoom, 10) + camX * (1 - par) + layer * 40;
            const h = 0.55 + 0.22 * Math.sin(u * 0.09 + layer) + 0.14 * Math.sin(u * 0.21 + 2 * layer) + 0.09 * Math.sin(u * 0.043);
            ctx.lineTo(x, base - h * amp - (layer === 0 ? 0.25 * amp : 0));
        }
        ctx.lineTo(gW + 16, gH + 2); ctx.closePath();
        ctx.fillStyle = col(mix(layer === 0 ? T.hillFar : T.hillMid, T.sky1, layer === 0 ? 0.45 : 0.25)); ctx.fill();
    }
}

function terrainPath(P) { ctx.beginPath(); P.pts.forEach((p, i) => i ? ctx.lineTo(SX(p.x), SY(p.y)) : ctx.moveTo(SX(p.x), SY(p.y))); ctx.closePath(); }

function drawTerrain(L, build) {
    const T = THEMES[L.theme];
    for (const P of L.terrain) {
        terrainPath(P);
        if (build) {
            ctx.fillStyle = '#34445e'; ctx.fill();
            ctx.strokeStyle = '#6f86ab'; ctx.lineWidth = 1.5; ctx.stroke();
            continue;
        }
        const top = SY(P.maxy), bot = SY(Math.max(P.miny, L.waterY - 12));
        const g = ctx.createLinearGradient(0, top, 0, bot + 1);
        g.addColorStop(0, col(T.ground0)); g.addColorStop(1, col(T.ground1));
        ctx.fillStyle = g; ctx.fill();
        ctx.save(); terrainPath(P); ctx.clip();
        for (let k = 1; k < 14; k++) {
            const y = SY(P.maxy - k * 1.6);
            line(SX(P.minx), y, SX(P.maxx), y, col(0, 0.09), Math.max(1, 0.25 * zoom), false);
        }
        ctx.restore();
        const n = P.pts.length;
        for (let i = 0; i < n; i++) {
            const a = P.pts[i], c = P.pts[(i + 1) % n], ex = c.x - a.x, ey = c.y - a.y, l = TV.vlen(ex, ey) || 1;
            if (-ex / l < 0.9) continue;
            line(SX(a.x), SY(a.y - 0.12), SX(c.x), SY(c.y - 0.12), col(T.grass), Math.max(3, 0.38 * zoom));
            line(SX(a.x), SY(a.y + 0.02), SX(c.x), SY(c.y + 0.02), col(mix(T.grass, 0xFFFFFF, 0.25)), Math.max(1, 0.07 * zoom));
        }
    }
}

function drawWater(L, build, front) {
    const T = THEMES[L.theme], wy = SY(L.waterY);
    if (wy > gH) return;
    if (build) {
        if (front) return;
        ctx.fillStyle = col(0x3A6EA5, 0.35); ctx.fillRect(0, wy, gW + 2, gH - wy + 2);
        line(0, wy, gW + 2, wy, col(0x7FB2E5, 0.8), 2, false);
        return;
    }
    if (!front) {
        const g = ctx.createLinearGradient(0, wy, 0, gH + 1);
        g.addColorStop(0, col(T.water0)); g.addColorStop(1, col(T.water1));
        ctx.fillStyle = g; ctx.fillRect(0, wy, gW + 2, gH - wy + 2);
        return;
    }
    ctx.fillStyle = col(T.water0, 0.37); ctx.fillRect(0, wy, gW + 2, gH - wy + 2);
    ctx.beginPath();
    for (let x = -10; x <= gW + 20; x += 12) {
        const y = wy + Math.sin(WX(x) * 1.3 + animT * 2.2) * Math.max(1, 0.06 * zoom);
        if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col(0xFFFFFF, 0.67); ctx.lineWidth = Math.max(1.5, 0.07 * zoom); ctx.lineCap = 'round'; ctx.stroke();
}

function drawPylons(L, build) {
    for (const p of L.pylons) {
        const ax = SX(p.x), ay = SY(p.y0), by = SY(p.y1), w = 0.8 * zoom;
        if (build) {
            ctx.setLineDash([6, 4]); ctx.strokeStyle = col(0x8FA3C0, 0.63); ctx.lineWidth = 1.5;
            ctx.strokeRect(ax - w * 0.5, by, w, ay - by); ctx.setLineDash([]);
            continue;
        }
        polyPath([ax - w * 0.6, ay, ax + w * 0.6, ay, ax + w * 0.35, by, ax - w * 0.35, by]);
        ctx.fillStyle = '#8c8f99'; ctx.fill(); ctx.strokeStyle = '#5e616b'; ctx.lineWidth = 1.5; ctx.stroke();
        for (let y = p.y0 + 1.2; y < p.y1 - 0.5; y += 1.5) {
            const t = (y - p.y0) / (p.y1 - p.y0), hw = TV.lerp(w * 0.6, w * 0.35, t), cy = SY(y);
            line(ax - hw, cy, ax + hw, cy, '#6e717b', Math.max(1, 0.06 * zoom), false);
        }
        fillRound(ax - w * 0.55, by - 0.25 * zoom, w * 1.1, 0.35 * zoom, 3, '#6e717b');
    }
}

function drawFlags(L) {
    const used = [false, false];
    for (const s of L.spawns) used[s.dir > 0 ? 0 : 1] = true;
    for (let d = 0; d < 2; d++) {
        if (!used[d]) continue;
        const x = L.goalX[d], y = TV.terrainTopY(L, x);
        const ax = SX(x), ay = SY(y), by = SY(y + 2.6);
        line(ax, ay, ax, by, '#eceff1', Math.max(2, 0.09 * zoom));
        const fw = 1.1 * zoom * (d === 0 ? 1 : -1), fh = 0.7 * zoom, wav = Math.sin(animT * 4 + d) * 0.08 * zoom;
        polyPath([ax, by, ax + fw, by + wav, ax + fw, by + fh + wav, ax, by + fh]); ctx.fillStyle = '#2ecc71'; ctx.fill();
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if ((i + j) & 1) {
            const P = (u, v) => [ax + fw * u, by + wav * u + fh * v];
            const a = P(i / 4, j / 2), b = P((i + 1) / 4, j / 2), c = P((i + 1) / 4, (j + 1) / 2), e = P(i / 4, (j + 1) / 2);
            polyPath([a[0], a[1], b[0], b[1], c[0], c[1], e[0], e[1]]); ctx.fill();
        }
    }
}

// ============================================================ dessin : pont
function stressColor(s) {
    s = TV.clamp(s, 0, 1.2);
    if (s < 0.5) return mix(0x43A047, 0xFDD835, s / 0.5);
    return mix(0xFDD835, 0xE53935, Math.min(1, (s - 0.5) / 0.5));
}

// style : 0 normal, 1 fantôme valide, 2 fantôme invalide, 3 survol/sélection
function drawBeam(ax, ay, bx, by, m, base, stress, stressMode, build, style, broken) {
    const A = [SX(ax), SY(ay)], B = [SX(bx), SY(by)], z = zoom;
    const alpha = style === 1 ? 0.67 : (style === 2 ? 0.6 : 1);
    const C = c => style === 2 ? col(0xFF5252, alpha) : col(c, alpha);
    const sm = stressMode && style === 0, sc = stressColor(stress);
    const L = (c, w, round) => line(A[0], A[1], B[0], B[1], c, w, round);
    if (style === 3) L(col(0xFFFFFF, 0.55), Math.max(6, 0.34 * z) + 6);
    switch (m) {
    case TV.M_ROAD: case TV.M_ROAD_HEAVY: {
        const w = Math.max(4, 2 * TV.ROAD_HALF * z);
        L(C(sm ? shade(sc, 0.55) : 0x2E3138), w);
        L(C(sm ? sc : (m === TV.M_ROAD ? 0x4A4E57 : 0x51443A)), w * 0.62);
        const l = TV.vlen(bx - ax, by - ay) || 1;
        let nx = -(by - ay) / l, ny = (bx - ax) / l;
        if (ny < 0) { nx = -nx; ny = -ny; }
        const o = TV.ROAD_HALF * 0.78;
        line(SX(ax + nx * o), SY(ay + ny * o), SX(bx + nx * o), SY(by + ny * o), C(m === TV.M_ROAD ? 0xE6E6E6 : 0xF2994A), Math.max(1, 0.045 * z), false);
        if (m === TV.M_ROAD_HEAVY) line(SX(ax - nx * o), SY(ay - ny * o), SX(bx - nx * o), SY(by - ny * o), C(0xF2994A), Math.max(1, 0.045 * z), false);
        break;
    }
    case TV.M_WOOD: { const w = Math.max(3, 0.16 * z); L(C(sm ? shade(sc, 0.6) : 0x7A5230), w + 2); L(C(sm ? sc : 0xC9914F), w); break; }
    case TV.M_STEEL: {
        const w = Math.max(3, 0.19 * z);
        L(C(sm ? shade(sc, 0.6) : 0x253F60), w + 2); L(C(sm ? sc : 0x4F86C6), w);
        L(C(sm ? mix(sc, 0xFFFFFF, 0.4) : 0x8DB7E8), Math.max(1, w * 0.25));
        break;
    }
    case TV.M_ROPE: L(C(sm ? sc : 0xD8BE85), Math.max(1.5, 0.06 * z)); break;
    case TV.M_CABLE: L(C(sm ? sc : (build ? 0xAAB6C4 : 0x2F353E)), Math.max(1.5, 0.07 * z)); break;
    case TV.M_SPRING: {
        const l = TV.vlen(bx - ax, by - ay) || 1, dx = (bx - ax) / l, dy = (by - ay) / l, nx = -dy, ny = dx;
        const coils = Math.max(3, Math.floor(l * 4));
        ctx.beginPath(); ctx.moveTo(A[0], A[1]);
        const p0x = ax + dx * l * 0.12, p0y = ay + dy * l * 0.12, span = l * 0.76;
        ctx.lineTo(SX(p0x), SY(p0y));
        for (let i = 0; i < coils * 2; i++) {
            const t = (i + 0.5) / (coils * 2), o = (i & 1) ? 0.13 : -0.13;
            ctx.lineTo(SX(p0x + dx * span * t + nx * o), SY(p0y + dy * span * t + ny * o));
        }
        ctx.lineTo(SX(ax + dx * l * 0.88), SY(ay + dy * l * 0.88)); ctx.lineTo(B[0], B[1]);
        ctx.strokeStyle = C(sm ? sc : 0x7CB342); ctx.lineWidth = Math.max(1.5, 0.05 * z); ctx.lineJoin = 'round'; ctx.stroke();
        break;
    }
    case TV.M_HYD: {
        const l = TV.vlen(bx - ax, by - ay) || 1, cyl = Math.min(l, base * 0.58);
        const mx = SX(ax + (bx - ax) / l * cyl), my = SY(ay + (by - ay) / l * cyl);
        L(C(sm ? mix(sc, 0xFFFFFF, 0.5) : 0xCFD8DC), Math.max(1.5, 0.07 * z));
        line(A[0], A[1], mx, my, C(sm ? shade(sc, 0.6) : 0x8A6512), Math.max(4, 0.22 * z) + 2);
        line(A[0], A[1], mx, my, C(sm ? sc : 0xF2B233), Math.max(4, 0.22 * z));
        break;
    }
    }
    if (broken) disc(B[0], B[1], Math.max(2, 0.06 * z), col(0x3E2723, alpha));
}

function drawJoint(x, y, anchor, build, hover) {
    const cx = SX(x), cy = SY(y);
    if (anchor) {
        const r = Math.max(4, 0.17 * zoom);
        if (hover) disc(cx, cy, r + 4, col(0xFFFFFF, 0.47));
        disc(cx, cy, r, '#e5484d'); ring(cx, cy, r, '#7a1e22', 1.5); disc(cx, cy, r * 0.35, '#ffe0e0');
    } else {
        const r = Math.max(build ? 3.5 : 2.2, (build ? 0.12 : 0.085) * zoom);
        if (hover) disc(cx, cy, r + 4, col(0xFFFFFF, 0.55));
        disc(cx, cy, r, '#f4f1ea'); ring(cx, cy, r, '#2b2b2b', 1.2);
    }
}

// ============================================================ dessin : véhicules
function vpoly(f, xy, fill, edge, ew) {
    ctx.beginPath();
    for (let i = 0; i < xy.length; i += 2) {
        const lx = xy[i], ly = xy[i + 1];
        const x = SX(f.ox + f.ax * lx + f.ux * ly), y = SY(f.oy + f.ay * lx + f.uy * ly);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (ew === undefined || ew > 0) { ctx.strokeStyle = edge; ctx.lineWidth = ew === undefined ? 1.2 : ew; ctx.lineJoin = 'round'; ctx.stroke(); }
}
const XP = (f, lx, ly) => [SX(f.ox + f.ax * lx + f.ux * ly), SY(f.oy + f.ay * lx + f.uy * ly)];
function vline(f, x0, y0, x1, y1, c, w, round) { const a = XP(f, x0, y0), b = XP(f, x1, y1); line(a[0], a[1], b[0], b[1], c, w, round); }
function vdisc(f, x, y, r, c) { const a = XP(f, x, y); disc(a[0], a[1], r, c); }

function drawWheel(x, y, r, ang) {
    const cx = SX(x), cy = SY(y), R = r * zoom;
    disc(cx, cy, R, '#1e1f22'); disc(cx, cy, R * 0.55, '#b0bec5');
    for (let k = 0; k < 3; k++) {
        const a = ang + k * 2.0943951;
        line(cx, cy, cx + Math.cos(a) * R * 0.5, cy - Math.sin(a) * R * 0.5, '#607d8b', Math.max(1, R * 0.14));
    }
    disc(cx, cy, R * 0.16, '#455a64');
}

function drawBody(S, v, bi) {
    const f = S.bodyFrame(v, bi), B = v.body[bi], T = VTYPES[B.type];
    const body = col(v.color), edge = col(shade(v.color, 0.55)), glass = '#bfe6f7', dark = '#37474f';
    const z = zoom;
    switch (B.type) {
    case TV.V_CAR:
        vpoly(f, [0.05, 0.1, 0, 0.62, 0.35, 0.78, 3.25, 0.78, 3.6, 0.5, 3.6, 0.12, 3.4, 0, 0.2, 0], body, edge);
        vpoly(f, [0.75, 0.76, 1.15, 1.38, 2.45, 1.38, 2.95, 0.76], body, edge);
        vpoly(f, [0.95, 0.8, 1.25, 1.28, 1.72, 1.28, 1.72, 0.8], glass, edge, 0.8);
        vpoly(f, [1.82, 0.8, 1.82, 1.28, 2.4, 1.28, 2.78, 0.8], glass, edge, 0.8);
        vdisc(f, 3.52, 0.5, Math.max(1.5, 0.08 * z), '#fff59d'); vdisc(f, 0.06, 0.5, Math.max(1.5, 0.07 * z), '#e53935');
        break;
    case TV.V_MOTO:
        vpoly(f, [0.25, 0.15, 0.75, 0.45, 1.55, 0.4, 1.8, 0.62, 1.35, 0.68, 0.55, 0.62], body, edge);
        vline(f, 1.7, 0, 1.5, 0.75, dark, Math.max(1.5, 0.07 * z));
        vline(f, 0.95, 0.65, 1.15, 1.3, '#263238', Math.max(2, 0.2 * z));
        vline(f, 1.15, 1.25, 1.55, 0.85, '#263238', Math.max(1.5, 0.1 * z));
        vline(f, 0.95, 0.65, 1.25, 0.35, '#37474f', Math.max(1.5, 0.12 * z));
        vdisc(f, 1.2, 1.55, 0.22 * z, body); vdisc(f, 1.27, 1.55, 0.1 * z, glass);
        break;
    case TV.V_VAN:
        vpoly(f, [0, 0.05, 0, 1.95, 3.55, 1.95, 4.35, 1.15, 4.8, 1.0, 4.8, 0.1, 4.6, 0, 0.2, 0], body, edge);
        vpoly(f, [3.6, 1.85, 4.22, 1.2, 3.6, 1.2], glass, edge, 0.8);
        vpoly(f, [2.7, 1.25, 2.7, 1.8, 3.45, 1.8, 3.45, 1.25], glass, edge, 0.8);
        vline(f, 0.2, 1.05, 2.55, 1.05, col(0xFFFFFF, 0.47), Math.max(1, 0.12 * z), false);
        vdisc(f, 4.72, 0.65, Math.max(1.5, 0.09 * z), '#fff59d');
        break;
    case TV.V_JEEP:
        vpoly(f, [0, 0.25, 0, 1.0, 1.05, 1.05, 1.45, 1.75, 2.95, 1.75, 3.25, 1.05, 4.0, 0.95, 4.0, 0.25, 3.7, 0.1, 0.3, 0.1], body, edge);
        vpoly(f, [1.55, 1.12, 1.75, 1.62, 2.2, 1.62, 2.2, 1.12], glass, edge, 0.8);
        vpoly(f, [2.3, 1.12, 2.3, 1.62, 2.85, 1.62, 3.05, 1.12], glass, edge, 0.8);
        vline(f, 0.2, 1.0, 0.6, 1.6, dark, Math.max(1.5, 0.1 * z)); vline(f, 0.6, 1.6, 1.45, 1.75, dark, Math.max(1.5, 0.1 * z));
        vdisc(f, 3.95, 0.65, Math.max(1.5, 0.1 * z), '#fff59d');
        break;
    case TV.V_BUS:
        vpoly(f, [0, 0.05, 0, 2.65, 8.6, 2.65, 9.0, 2.25, 9.0, 0.1, 8.8, 0, 0.2, 0], body, edge);
        for (let x = 0.5; x < 7.8; x += 1.05) vpoly(f, [x, 1.45, x, 2.35, x + 0.85, 2.35, x + 0.85, 1.45], glass, edge, 0.7);
        vpoly(f, [8.05, 1.45, 8.05, 2.4, 8.75, 2.3, 8.92, 1.45], glass, edge, 0.7);
        vpoly(f, [7.95, 0.25, 7.95, 1.35, 8.7, 1.35, 8.7, 0.25], col(shade(v.color, 0.8)), edge, 0.7);
        vline(f, 0.1, 1.2, 7.8, 1.2, col(0xFFFFFF, 0.6), Math.max(1, 0.1 * z), false);
        break;
    case TV.V_TRUCK:
        vpoly(f, [0, 0.25, 7, 0.25, 7, 0.55, 0, 0.55], dark, dark, 0);
        vpoly(f, [5.2, 0.1, 5.2, 2.4, 6.4, 2.4, 7, 1.5, 7, 0.1], body, edge);
        vpoly(f, [5.45, 1.45, 5.45, 2.2, 6.3, 2.2, 6.75, 1.45], glass, edge, 0.8);
        vpoly(f, [0, 0.55, 0.1, 2.15, 5.0, 2.15, 4.9, 0.55], '#f9a825', '#8d6e00');
        for (let x = 0.8; x < 4.8; x += 1) vline(f, x, 0.6, x, 2.1, '#c17900', Math.max(1, 0.06 * z), false);
        vpoly(f, [0.3, 2.15, 1.0, 2.55, 4.0, 2.55, 4.7, 2.15], '#8d6e63', '#5d4037', 0.8);
        break;
    case TV.V_SEMI:
        vpoly(f, [0, 0.25, 4.6, 0.25, 4.6, 0.55, 0, 0.55], dark, dark, 0);
        vpoly(f, [2.5, 0.1, 2.5, 2.8, 3.8, 2.8, 4.6, 1.7, 4.6, 0.1], body, edge);
        vpoly(f, [2.75, 1.75, 2.75, 2.6, 3.7, 2.6, 4.3, 1.75], glass, edge, 0.8);
        vline(f, 2.35, 0.6, 2.35, 3.1, dark, Math.max(1.5, 0.1 * z));
        break;
    case TV.V_TRAILER:
        vpoly(f, [0, 0, 0, 2.9, 9, 2.9, 9, 0], '#eceff1', '#90a4ae');
        vline(f, 0, 0.6, 9, 0.6, body, Math.max(2, 0.25 * z), false);
        vline(f, 0, 2.5, 9, 2.5, body, Math.max(1.5, 0.12 * z), false);
        vpoly(f, [1.2, -0.35, 1.2, 0, 2.8, 0, 2.8, -0.35], dark, dark, 0);
        break;
    }
    for (let k = 0; k < T.nw; k++) {
        const p = S.parts[B.wheel[k]];
        drawWheel(p.x, p.y, T.w[k].r, -B.spin[k] * v.dir);
    }
}
function drawVehicles(S) { for (const v of S.veh) if (!v.gone) for (let bi = v.nb - 1; bi >= 0; bi--) drawBody(S, v, bi); }

// ============================================================ dessin : bateau
function drawBoat(L, b, scale, alpha, build) {
    const shapes = TV.boatShapes(b, L.waterY);
    const P = p => [SX(b.x + (p.x - b.x) * scale), SY(L.waterY + (p.y - L.waterY) * scale)];
    const cols = [0xC62828, 0xF5F5F5, 0x6D4C41];
    shapes.forEach((s, i) => {
        const pts = []; for (const p of s.pts) pts.push(...P(p));
        polyPath(pts);
        if (build) {
            ctx.fillStyle = col(0xFF5252, 0.18); ctx.fill();
            ctx.setLineDash([6, 4]); ctx.strokeStyle = col(0xFF8A80, 0.8); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
        } else {
            ctx.fillStyle = col(cols[i], alpha); ctx.fill();
            ctx.strokeStyle = col(shade(cols[i], 0.6), alpha); ctx.lineWidth = 1.2; ctx.stroke();
        }
    });
    if (!build) {
        for (let k = 0; k < 3; k++) { const p = P(TV.v2(b.x - b.width * 0.3 + k, L.waterY + 0.25)); disc(p[0], p[1], 0.12 * zoom * scale, col(0xFFFFFF, alpha)); }
        const t = TV.v2(b.x + 0.35, L.waterY + b.mast), a = P(t), c = P(TV.v2(t.x + 1, t.y - 0.3)), d = P(TV.v2(t.x, t.y - 0.6));
        polyPath([a[0], a[1], c[0], c[1], d[0], d[1]]); ctx.fillStyle = col(0xFFC107, alpha); ctx.fill();
    }
}
function drawBoats(L, S, front, build) {
    for (const b of L.boats) {
        if (build) { if (!front) drawBoat(L, b, 1, 1, true); continue; }
        const tt = b.time - S.time;
        if (!front && tt > 0 && tt < 9) { const k = TV.clamp(1 - tt / 9, 0, 1); drawBoat(L, b, 0.5 + 0.5 * k, (80 + 175 * k) / 255, false); }
        else if (front && tt <= 0 && tt > -TV.BOAT_PASS - 3) { const k = TV.clamp((-tt - TV.BOAT_PASS) / 3, 0, 1); drawBoat(L, b, 1 + k * 0.6, 1 - k, false); }
    }
}

// ============================================================ scène
function drawScene(L, S, build) {
    const T = THEMES[L.theme];
    if (build) {
        const g = ctx.createLinearGradient(0, 0, 0, gH);
        g.addColorStop(0, '#1d2a40'); g.addColorStop(1, '#141c2b');
        ctx.fillStyle = g; ctx.fillRect(0, 0, gW + 2, gH + 2);
        if (showGrid) {
            const x0 = WX(0), x1 = WX(gW), y0 = WY(gH), y1 = WY(0), step = zoom > 35 ? 0.5 : 1;
            ctx.lineCap = 'butt';
            for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
                const major = Math.abs(Math.abs(x) % 5) < 1e-3, unit = Math.abs(x - Math.round(x)) < 1e-3;
                line(SX(x), SY(y0), SX(x), SY(y1), major ? '#4b628a' : (unit ? '#2e3d57' : '#243248'), major ? 1.4 : 1, false);
            }
            for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
                const major = Math.abs(Math.abs(y) % 5) < 1e-3, unit = Math.abs(y - Math.round(y)) < 1e-3;
                line(SX(x0), SY(y), SX(x1), SY(y), major ? '#4b628a' : (unit ? '#2e3d57' : '#243248'), major ? 1.4 : 1, false);
            }
        }
        drawWater(L, true, false); drawPylons(L, true); drawTerrain(L, true); drawBoats(L, null, false, true); drawFlags(L);
        return;
    }
    drawSky(T, L); drawWater(L, false, false); drawPylons(L, false);
    for (const t of trees) drawTree(t, T);
    drawTerrain(L, false); drawFlags(L);
    if (S) drawBoats(L, S, false, false);
}
function drawBridgeSim(S, stressMode) {
    for (let pass = 0; pass < 3; pass++) for (const b of S.beams) {
        if (!b.alive) continue;
        const M = MATS[b.mat], p = M.tensionOnly ? 0 : (M.road ? 2 : 1);
        if (p !== pass) continue;
        const A = S.parts[b.a], B = S.parts[b.b];
        drawBeam(A.x, A.y, B.x, B.y, b.mat, b.rest0, b.stress, stressMode, false, 0, b.broken);
    }
    for (let i = 0; i < S.nodeCount; i++) drawJoint(S.parts[i].x, S.parts[i].y, S.parts[i].w === 0, false, false);
}
function drawFx(S) { for (const f of S.fx) disc(SX(f.x), SY(f.y), Math.max(1.5, f.size * zoom), col(f.color, TV.clamp(f.life / f.maxLife, 0, 1))); }

// ============================================================ conception
function toast(s) { toastMsg = s; toastT = 2.6; }
function pushUndo() { undoS.push(design.clone()); if (undoS.length > 300) undoS.shift(); redoS = []; }
const gridSnap = v => Math.round(v / TV.GRID) * TV.GRID;
let freePlace = false;   // Ctrl maintenu

function snapTarget(fromStart) {
    const snapR = Math.max(0.22, (isTouch ? 18 : 12) / zoom);
    const n = design.nodeAt(TV.v2(mwx, mwy), snapR);
    let tx, ty;
    if (n >= 0) { tx = design.nodes[n].p.x; ty = design.nodes[n].p.y; }
    else if (freePlace) { tx = mwx; ty = mwy; }
    else { tx = gridSnap(mwx); ty = gridSnap(mwy); }
    if (!fromStart) return TV.v2(tx, ty);
    const maxL = MATS[gMat].maxLen, dx = tx - startX, dy = ty - startY, l = TV.vlen(dx, dy);
    if (l <= maxL + 1e-3) return TV.v2(tx, ty);
    const cx = startX + dx * maxL / l, cy = startY + dy * maxL / l;
    const n2 = design.nodeAt(TV.v2(cx, cy), snapR);
    if (n2 >= 0 && TV.vlen(design.nodes[n2].p.x - startX, design.nodes[n2].p.y - startY) <= maxL + 1e-3) return TV.v2(design.nodes[n2].p.x, design.nodes[n2].p.y);
    if (freePlace) return TV.v2(cx, cy);
    let best = null, bd = 1e9;
    const fx = Math.floor(cx / TV.GRID) * TV.GRID, fy = Math.floor(cy / TV.GRID) * TV.GRID;
    for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) {
        const qx = fx + i * TV.GRID, qy = fy + j * TV.GRID, ql = TV.vlen(qx - startX, qy - startY);
        if (ql > maxL + 1e-3 || ql < 0.3) continue;
        const d = TV.vlen(qx - cx, qy - cy);
        if (d < bd) { bd = d; best = TV.v2(qx, qy); }
    }
    return best || TV.v2(cx, cy);
}

function placeBeam(a, b) {
    const L = levels[cur], r = TV.canAddBeam(design, L, a, b, gMat);
    if (r === TV.ADD_OK) { pushUndo(); TV.addBeam(design, L, a, b, gMat); sel = -1; audio.play('place', 0.6); return true; }
    if (r === TV.ADD_TOO_LONG) toast(`Trop long : ${MATS[gMat].name} mesure ${fnum(MATS[gMat].maxLen)} m au maximum.`);
    else if (r === TV.ADD_IN_TERRAIN) toast('Impossible de placer une articulation dans le terrain.');
    else if (r === TV.ADD_TOO_SHORT) toast('Poutre trop courte.');
    return false;
}

function hoverAt() {
    hoverNode = hoverBeam = -1;
    if (scr !== SCR_BUILD || gMy < TOPBAR || gMy > gH - BOTBAR) return;
    const p = TV.v2(mwx, mwy);
    hoverNode = design.nodeAt(p, Math.max(0.15, (isTouch ? 16 : 10) / zoom));
    if (hoverNode >= 0) return;
    let bd = Math.max(0.12, (isTouch ? 14 : 7) / zoom);
    design.beams.forEach((b, i) => {
        const A = design.nodes[b.a].p, B = design.nodes[b.b].p, abx = B.x - A.x, aby = B.y - A.y;
        const t = TV.clamp(((p.x - A.x) * abx + (p.y - A.y) * aby) / Math.max(1e-6, abx * abx + aby * aby), 0, 1);
        const d = TV.vlen(p.x - (A.x + abx * t), p.y - (A.y + aby * t));
        if (d < bd) { bd = d; hoverBeam = i; }
    });
}

function cancelDrawing() { drawing = chain = false; }
function startSim() {
    cancelDrawing(); dragNode = -1; sel = -1;
    sim.init(levels[cur], design);
    scr = SCR_SIM; winT = -1; resultDismissed = false; paused = false;
    audio.play('click');
}
function stopSim() { scr = SCR_BUILD; audio.play('click'); }
function loadLevel(i) {
    cur = i; design = saved[i].clone(); undoS = []; redoS = []; sel = -1;
    scr = SCR_BUILD;
    const L = levels[i];
    if (!((L.mats >> gMat) & 1)) for (let m = 0; m < TV.M_COUNT; m++) if ((L.mats >> m) & 1) { gMat = m; break; }
    fitCamera(L); buildTrees(L, i); cancelDrawing(); showStress = false;
    if (firstRun) { help = true; firstRun = false; }
}
function goMenu() {
    if (scr !== SCR_MENU) saved[cur] = design;
    saveGame();
    scr = SCR_MENU; help = false;
    demo.init(levels[DEMO_LEVEL], demoDesign);
}
function undo() { if (!undoS.length) return; redoS.push(design); design = undoS.pop(); sel = -1; audio.play('del', 0.4); }
function redo() { if (!redoS.length) return; undoS.push(design); design = redoS.pop(); sel = -1; audio.play('place', 0.4); }
function adjustHyd(i, delta) {
    if (i < 0 || i >= design.beams.length) return;
    const b = design.beams[i];
    if (!MATS[b.mat].hydraulic) return;
    pushUndo();
    b.ext = TV.clamp(Math.round((b.ext + delta) * 20) / 20, 0.4, 2.0);
    toast(`Vérin : course réglée à ×${fnum(b.ext, 2)}`);
}
function deleteBeam(i) {
    if (i < 0 || i >= design.beams.length) return;
    pushUndo(); design.removeBeam(i); sel = -1; hoverBeam = -1;
    audio.play('del', 0.6);
}

// ============================================================ HUD
function drawTopBar() {
    const L = levels[cur];
    const g = ctx.createLinearGradient(0, 0, 0, TOPBAR);
    g.addColorStop(0, col(0x202838, 0.94)); g.addColorStop(1, col(0x1A2130, 0.94));
    ctx.fillStyle = g; ctx.fillRect(0, 0, gW + 2, TOPBAR);
    line(0, TOPBAR, gW + 2, TOPBAR, col(0, 0.47), 2, false);
    button(B_MENU, { x: 10, y: 12, w: 84, h: 38 }, 'Menu', 0x3D4A63);
    const rightBlock = 320 + 4 * 96;
    const titleW = Math.max(100, gW - rightBlock - 120);
    text(fitText(`${cur + 1}. ${L.name}`, F.h1, titleW), F.h1, 108, 8, '#fff');
    text(fitText(L.hint, F.small, titleW), F.small, 109, 38, '#b8c3d6');
    const cost = design.cost(), over = cost > L.budget;
    const bx = gW - rightBlock - 8, bw = 300;
    fillRound(bx, 8, bw, 46, 8, col(0x0B1020, 0.78));
    text('Budget', F.small, bx + 10, 10, '#9fb0c9');
    text(money(cost) + '  /  ' + (L.budget >= 999999 ? 'illimité' : money(L.budget)), F.h2, bx + bw - 10, 9, over ? '#ff6b6b' : '#fff', 2);
    const frac = L.budget >= 999999 ? 0 : TV.clamp(cost / L.budget, 0, 1);
    fillRound(bx + 10, 36, bw - 20, 10, 5, '#2b3550');
    if (frac > 0) fillRound(bx + 10, 36, Math.max(10, (bw - 20) * frac), 10, 5, over ? '#e5484d' : (frac > 0.85 ? '#f2b233' : '#3fb97a'));
    const x = gW - 4 * 96, b = scr === SCR_BUILD;
    button(B_UNDO, { x, y: 12, w: 88, h: 38 }, 'Annuler', 0x3D4A63, false, null, b && undoS.length > 0);
    button(B_REDO, { x: x + 96, y: 12, w: 88, h: 38 }, 'Rétablir', 0x3D4A63, false, null, b && redoS.length > 0);
    button(B_CLEAR, { x: x + 192, y: 12, w: 88, h: 38 }, 'Effacer', 0x8E3B46, false, null, b && design.beams.length > 0);
    button(B_HELP, { x: x + 288, y: 12, w: 88, h: 38 }, 'Aide', 0x3D4A63, help);
}

function drawMaterialSample(m, x, y, w) {
    const z = zoom, cx = camX, cy = camY;
    zoom = 26; camX = 0; camY = 0;
    const ax = WX(x), ay = WY(y), bx = WX(x + w), by = WY(y);
    drawBeam(ax, ay, bx, by, m, TV.vlen(bx - ax, by - ay), 0, false, true, 0, false);
    zoom = z; camX = cx; camY = cy;
}

function drawBottomBar() {
    const L = levels[cur], y0 = gH - BOTBAR;
    const g = ctx.createLinearGradient(0, y0, 0, gH);
    g.addColorStop(0, col(0x202838, 0.94)); g.addColorStop(1, col(0x151B28, 0.94));
    ctx.fillStyle = g; ctx.fillRect(0, y0, gW + 2, BOTBAR + 2);
    line(0, y0, gW + 2, y0, col(0, 0.47), 2, false);
    const playW = 190, play = { x: gW - playW - 14, y: y0 + 16, w: playW, h: BOTBAR - 32 };
    if (scr === SCR_BUILD) {
        let nm = 0;
        for (let m = 0; m < TV.M_COUNT; m++) if ((L.mats >> m) & 1) nm++;
        const step = Math.min(134, (play.x - 24) / Math.max(1, nm));
        let x = 12;
        for (let m = 0; m < TV.M_COUNT; m++) {
            if (!((L.mats >> m) & 1)) continue;
            const r = { x, y: y0 + 10, w: step - 8, h: BOTBAR - 20 };
            const s = m === gMat, hot = !isTouch && hit(r, gMx, gMy);
            fillRound(r.x, r.y + 2, r.w, r.h, 10, col(0, 0.27));
            fillRound(r.x, r.y, r.w, r.h, 10, s ? '#3b4e74' : (hot ? '#324058' : '#2a3448'));
            if (s) strokeRound(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 9, '#ffd166', 2.5);
            if (!isTouch) text(String(m + 1), F.tiny, r.x + 8, r.y + 6, '#8d9bb5');
            drawMaterialSample(m, r.x + 22, r.y + 17, r.w - 34);
            const nf = textW(MATS[m].name, F.body) <= r.w - 10 ? F.body : F.small;
            text(fitText(MATS[m].name, nf, r.w - 8), nf, r.x + r.w * 0.5, r.y + 30, '#fff', 1);
            text(money(MATS[m].cost) + '/m', F.small, r.x + r.w * 0.5, r.y + 50, '#ffd166', 1);
            text('max ' + fnum(MATS[m].maxLen, 0) + ' m', F.tiny, r.x + r.w * 0.5, r.y + 68, '#9fb0c9', 1);
            regBtn(B_MAT + m, r);
            x += step;
        }
        const hot = !isTouch && hit(play, gMx, gMy);
        fillRound(play.x, play.y + 3, play.w, play.h, 14, col(0, 0.35));
        fillRound(play.x, play.y, play.w, play.h, 14, hot ? '#3ccb7f' : '#2eaf6b');
        polyPath([play.x + 26, play.y + 18, play.x + 26, play.y + play.h - 18, play.x + 50, play.y + play.h * 0.5]); ctx.fillStyle = '#fff'; ctx.fill();
        text('TESTER', F.h1, play.x + 116, play.y + play.h * 0.5, '#fff', 1, 1);
        regBtn(B_PLAY, play);
    } else {
        let x = 14;
        const by = y0 + 22, bh = BOTBAR - 44, sp = SPEEDS[speedIdx];
        button(B_SPEED, { x, y: by, w: 150, h: bh }, 'Vitesse ×' + fnum(sp, sp < 1 ? 2 : 0), 0x3D4A63); x += 160;
        button(B_PAUSE, { x, y: by, w: 120, h: bh }, paused ? 'Reprendre' : 'Pause', 0x3D4A63, paused); x += 130;
        button(B_STRESS, { x, y: by, w: 150, h: bh }, 'Contraintes', 0x3D4A63, showStress); x += 160;
        if (L.hasHyd) { button(B_HYD, { x, y: by, w: 170, h: bh }, sim.hydTarget > 0.5 ? 'Vérins : rentrer' : 'Vérins : sortir', 0xB7791F, sim.hydTarget > 0.5); x += 180; }
        if (!isTouch && x + 300 < play.x) text('[H] vérins   [T] contraintes   [F] vitesse   [Espace] modifier', F.small, x + 6, by + bh * 0.5, '#8d9bb5', 0, 1);
        const hot = !isTouch && hit(play, gMx, gMy);
        fillRound(play.x, play.y + 3, play.w, play.h, 14, col(0, 0.35));
        fillRound(play.x, play.y, play.w, play.h, 14, hot ? '#f39c42' : '#e0832a');
        ctx.fillStyle = '#fff'; ctx.fillRect(play.x + 24, play.y + play.h * 0.5 - 11, 22, 22);
        text('MODIFIER', F.h1, play.x + 120, play.y + play.h * 0.5, '#fff', 1, 1);
        regBtn(B_PLAY, play);
    }
}

function vehicleList(L) {
    const cnt = new Array(TV.V_COUNT).fill(0);
    for (const s of L.spawns) cnt[s.type]++;
    const out = [];
    for (let t = 0; t < TV.V_COUNT; t++) if (cnt[t]) out.push(VTYPES[t].name + (cnt[t] > 1 ? ' ×' + cnt[t] : ''));
    return out.join('  ·  ');
}

function drawInfoPanel() {
    const L = levels[cur], lines = [];
    if (scr === SCR_BUILD) {
        lines.push('Véhicules : ' + vehicleList(L));
        for (const b of L.boats) lines.push(`Bateau : passe sous le pont à ${fnum(b.time, 0)} s (zone rouge)`);
    } else {
        lines.push(`Temps ${fnum(sim.time)} s   ·   Arrivés ${sim.arrived} / ${sim.total}   ·   Ruptures ${sim.breaks}`);
        for (const b of sim.boats) {
            const tt = b.d.time - sim.time;
            if (tt > 0) lines.push(`Bateau dans ${fnum(tt)} s`);
            else if (!b.passed && !b.hit) lines.push('Le bateau passe…');
            else if (b.passed) lines.push('Le bateau est passé.');
        }
        if (L.hasHyd) lines.push(`Vérins : ${Math.round(sim.hydPhase * 100)} %`);
    }
    const maxW = gW * 0.55;
    let w = 0;
    for (const s of lines) w = Math.max(w, Math.min(maxW, textW(s, F.body)));
    fillRound(12, TOPBAR + 10, w + 24, 12 + lines.length * 21, 9, col(0x0B1020, 0.67));
    lines.forEach((s, i) => text(fitText(s, F.body, maxW), F.body, 24, TOPBAR + 16 + i * 21, '#e8eef8'));
}

function drawSelection() {
    if (scr !== SCR_BUILD || sel < 0 || sel >= design.beams.length) return;
    const b = design.beams[sel], M = MATS[b.mat], l = design.beamLen(b);
    const hydr = M.hydraulic;
    const w = hydr ? 470 : 340, h = 48, x = (gW - w) * 0.5, y = TOPBAR + 10;
    fillRound(x, y, w, h, 12, col(0x0B1020, 0.88));
    strokeRound(x, y, w, h, 12, '#ffd166', 1.5);
    text(fitText(`${M.name} · ${fnum(l, 2)} m · ${money(l * M.cost)}`, F.body, 200), F.body, x + 14, y + h * 0.5, '#fff', 0, 1);
    let bx = x + w - 118;
    if (hydr) {
        button(B_EXTM, { x: x + 222, y: y + 7, w: 38, h: 34 }, '−', 0x3D4A63);
        text('×' + fnum(b.ext, 2), F.h2, x + 296, y + h * 0.5, '#f2b233', 1, 1);
        button(B_EXTP, { x: x + 332, y: y + 7, w: 38, h: 34 }, '+', 0x3D4A63);
    }
    button(B_DEL, { x: bx, y: y + 7, w: 106, h: 34 }, 'Supprimer', 0x8E3B46);
}

function drawToast() {
    if (toastT <= 0 || !toastMsg) return;
    const a = TV.clamp(toastT / 0.4, 0, 1), s = fitText(toastMsg, F.h2, gW - 60), w = textW(s, F.h2) + 36;
    const x = (gW - w) * 0.5, y = gH - BOTBAR - 56;
    fillRound(x, y, w, 40, 12, col(0x11161F, 0.88 * a));
    text(s, F.h2, gW * 0.5, y + 20, col(0xFFFFFF, a), 1, 1);
}

function starsFor(cost, budget) {
    if (cost > budget) return 0;
    if (budget >= 999999) return 3;
    const f = cost / budget;
    return f <= 0.75 ? 3 : (f <= 0.9 ? 2 : 1);
}

function drawResult() {
    const L = levels[cur], cost = design.cost(), ok = cost <= L.budget;
    ctx.fillStyle = col(0, 0.43); ctx.fillRect(0, 0, gW + 2, gH + 2);
    const w = Math.min(520, gW - 30), h = 300, x = (gW - w) * 0.5, y = (gH - h) * 0.5 - 20;
    fillRound(x, y + 6, w, h, 18, col(0, 0.35));
    fillRound(x, y, w, h, 18, '#243049');
    strokeRound(x, y, w, h, 18, ok ? '#3fb97a' : '#f2b233', 3);
    text(fitText(ok ? 'Pont réussi !' : 'Ils sont passés… mais trop cher !', F.title, w - 20), F.title, gW * 0.5, y + 22, '#fff', 1);
    const st = starsFor(cost, L.budget);
    for (let i = 0; i < 3; i++) star(gW * 0.5 - 60 + i * 60, y + 110, 24, i < st ? '#ffd166' : '#3a4660', i < st ? '#b7791f' : '#56637e');
    text(fitText('Coût : ' + money(cost) + '   ·   Budget : ' + (L.budget >= 999999 ? 'illimité' : money(L.budget)), F.h2, w - 20), F.h2, gW * 0.5, y + 150, ok ? '#e8eef8' : '#ff8a80', 1);
    const sub = ok ? (st === 3 ? "Chef-d'œuvre d'économie !" : (st === 2 ? 'Très bien ! 3 étoiles à 75 % du budget.' : 'Réussi ! 2 étoiles à 90 % du budget, 3 à 75 %.'))
                   : `Dépassement de ${money(cost - L.budget)}. Allège ta structure !`;
    text(fitText(sub, F.body, w - 20), F.body, gW * 0.5, y + 180, '#b8c3d6', 1);
    const bw = Math.min(150, (w - 60) / 3), by = y + h - 70;
    button(B_EDIT, { x: gW * 0.5 - bw * 1.5 - 12, y: by, w: bw, h: 46 }, 'Modifier', 0x3D4A63);
    button(B_WATCH, { x: gW * 0.5 - bw * 0.5, y: by, w: bw, h: 46 }, 'Regarder', 0x3D4A63);
    button(B_NEXT, { x: gW * 0.5 + bw * 0.5 + 12, y: by, w: bw, h: 46 }, cur + 1 < levels.length ? 'Suivant' : 'Menu', 0x2EAF6B, false, null, ok);
}

const HELP_ROWS = [
    ['But', 'Construis un pont pour que tous les véhicules atteignent le drapeau, sans dépasser le budget.'],
    ['Poser une poutre', 'Glisse depuis une articulation. Ou touche une articulation, puis chaque point suivant pour poser en chaîne.'],
    ['Finir un tracé', 'Bouton « Terminer » (ou clic droit / Échap).'],
    ['Supprimer', 'Touche une poutre puis « Supprimer » (clic droit à la souris).'],
    ['Déplacer un nœud', 'Appui long sur une articulation puis glisser (Maj + glisser à la souris).'],
    ['Vue', 'Pince pour zoomer, glisse dans le vide pour te déplacer (molette à la souris).'],
    ['Matériaux', 'Palette en bas (touches 1 à 8). Seule la route porte les véhicules.'],
    ['Vérins', 'Touche un vérin pour régler sa course (− / +). Bouton « Vérins » ou [H] pendant le test.'],
    ['Tester', 'Bouton TESTER (Espace). « Contraintes » colore les poutres du vert au rouge.'],
    ['Annuler', 'Boutons Annuler / Rétablir (Ctrl+Z / Ctrl+Y).'],
    ['Astuce', "Les triangles sont indéformables : c'est le secret des ponts solides !"],
];
function drawHelp() {
    ctx.fillStyle = col(0, 0.55); ctx.fillRect(0, 0, gW + 2, gH + 2);
    const w = Math.min(900, gW - 30), h = Math.min(620, gH - 20), x = (gW - w) * 0.5, y = (gH - h) * 0.5;
    fillRound(x, y, w, h, 18, '#243049'); strokeRound(x, y, w, h, 18, '#4f86c6', 2);
    text('Comment jouer', F.title, gW * 0.5, y + 14, '#fff', 1);
    const rowH = (h - 140) / HELP_ROWS.length, labW = Math.min(200, w * 0.27);
    let ry = y + 76;
    for (const r of HELP_ROWS) {
        text(fitText(r[0], F.h2, labW - 10), F.h2, x + 24, ry, '#ffd166');
        wrapText(r[1], F.small, x + 24 + labW, ry + 2, w - labW - 48, 16, '#e8eef8');
        ry += rowH;
    }
    button(B_HELPCLOSE, { x: gW * 0.5 - 90, y: y + h - 56, w: 180, h: 44 }, "C'est parti !", 0x2EAF6B);
}

function drawFailBanner() {
    if (!sim.lost) return;
    const s = fitText(sim.failMsg + (isTouch ? '   Touche « MODIFIER »' : '   [Espace] pour modifier ton pont'), F.h2, gW - 60);
    const w = textW(s, F.h2) + 40, x = (gW - w) * 0.5, y = TOPBAR + 96;
    fillRound(x, y, w, 42, 12, col(0xB3261E, 0.9));
    text(s, F.h2, gW * 0.5, y + 21, '#fff', 1, 1);
}

// ============================================================ menu
function drawMenu() {
    const DL = levels[DEMO_LEVEL], cx = camX, cy = camY, z = zoom;
    zoom = TV.clamp(gW / (DL.vx1 - DL.vx0 + 6), 10, 60);
    camX = (DL.vx0 + DL.vx1) * 0.5;
    camY = (gH - 105 - viewCY()) / zoom;
    drawScene(DL, demo, false); drawBridgeSim(demo, false); drawVehicles(demo); drawFx(demo); drawWater(DL, false, true);
    camX = cx; camY = cy; zoom = z;
    ctx.fillStyle = col(0x0E1422, 0.47); ctx.fillRect(0, 0, gW + 2, gH + 2);

    const compact = gH < 640;
    const ty = compact ? 12 : 26;
    text('TRAVÉE', F.title, gW * 0.5 + 3, ty + 3, col(0, 0.47), 1);
    text('TRAVÉE', F.title, gW * 0.5, ty, '#fff', 1);
    text('Bâtisseurs de ponts', F.h1, gW * 0.5, ty + 56, '#ffd166', 1);
    let total = 0;
    best.forEach((b, i) => { if (b >= 0) total += starsFor(b, levels[i].budget); });
    text(`Étoiles : ${total} / ${levels.length * 3}`, F.body, gW * 0.5, ty + 86, '#e8eef8', 1);

    const cols = gW >= 900 ? 4 : 3, rows = Math.ceil(levels.length / cols);
    const gy = ty + 114, bottomH = 70;
    const cw = Math.min(250, (gW - 60) / cols - 14);
    const ch = TV.clamp((gH - gy - bottomH) / rows - 12, 64, 104);
    const gx = (gW - (cw * cols + 14 * (cols - 1))) * 0.5;
    levels.forEach((L, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const rc = { x: gx + c * (cw + 14), y: gy + r * (ch + 12), w: cw, h: ch };
        const hot = !isTouch && hit(rc, gMx, gMy), T = THEMES[L.theme];
        fillRound(rc.x, rc.y + 4, rc.w, rc.h, 14, col(0, 0.35));
        rrPath(rc.x, rc.y, rc.w, rc.h, 14);
        const g = ctx.createLinearGradient(0, rc.y, 0, rc.y + rc.h);
        g.addColorStop(0, col(hot ? mix(T.sky0, 0xFFFFFF, 0.15) : T.sky0)); g.addColorStop(1, col(T.ground1));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = hot ? '#ffd166' : '#0e1422'; ctx.lineWidth = hot ? 3 : 1.5; ctx.stroke();
        const cr = Math.min(19, ch * 0.2);
        disc(rc.x + 10 + cr, rc.y + 10 + cr, cr, col(0x0E1422, 0.75));
        text(String(i + 1), F.h1, rc.x + 10 + cr, rc.y + 11 + cr, '#fff', 1, 1);
        text(fitText(L.name, F.h2, rc.w - 2 * cr - 30), F.h2, rc.x + 2 * cr + 20, rc.y + 10 + cr, '#fff', 0, 1);
        const st = best[i] >= 0 ? starsFor(best[i], L.budget) : 0;
        const sy = rc.y + rc.h - 22;
        for (let k = 0; k < 3; k++) star(rc.x + 22 + k * 26, sy, 10, k < st ? '#ffd166' : col(0x3A4660, 0.33), k < st ? '#b7791f' : col(0xFFFFFF, 0.53));
        const sub = best[i] >= 0 ? 'Record : ' + money(best[i]) : (L.budget >= 999999 ? 'Libre' : 'Budget ' + money(L.budget));
        text(fitText(sub, F.small, rc.w - 110), F.small, rc.x + rc.w - 12, sy, '#fff', 2, 1);
        regBtn(B_LEVEL + i, rc);
    });
    // boutons du bas
    const items = [[B_HELP, 'Comment jouer', 0x3D4A63], [B_SOUND, muted ? 'Son : coupé' : 'Son : activé', 0x3D4A63]];
    if (!IN_APP) {
        if (document.fullscreenEnabled) items.push([B_FULL, document.fullscreenElement ? 'Quitter plein écran' : 'Plein écran', 0x3D4A63]);
        items.push([B_APK, 'App Android', 0x2E7D5B], [B_EXE, 'Version Windows', 0x2B5C8A]);
    }
    const bw = Math.min(190, (gW - 40) / items.length - 10), totalW = items.length * (bw + 10) - 10;
    let bx = (gW - totalW) * 0.5;
    const by = Math.min(gH - 56, gy + rows * (ch + 12) + 4);
    for (const it of items) { button(it[0], { x: bx, y: by, w: bw, h: 44 }, it[1], it[2]); bx += bw + 10; }
    text('Jeu original · physique XPBD', F.tiny, gW - 12, gH - 18, col(0xFFFFFF, 0.55), 2);
}

function drawRotateHint() {
    ctx.fillStyle = '#141c2b'; ctx.fillRect(0, 0, gW + 2, gH + 2);
    const cx = gW * 0.5, cy = gH * 0.42, s = Math.min(gW, gH) * 0.18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2 * (0.5 + 0.5 * Math.sin(animT * 2)));
    fillRound(-s * 0.55, -s, s * 1.1, s * 2, s * 0.15, '#4f86c6');
    fillRound(-s * 0.45, -s * 0.85, s * 0.9, s * 1.6, s * 0.08, '#1d2a40');
    ctx.restore();
    text('Tourne ton appareil', F.title, cx, cy + s * 1.4, '#fff', 1);
    text('Travée se joue en mode paysage.', F.h1, cx, cy + s * 1.4 + 60, '#ffd166', 1);
}

// ============================================================ rendu
function render() {
    ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
    btns = [];
    if (isTouch && cssH > cssW * 1.05) { drawRotateHint(); btnsPrev = btns; return; }
    if (scr === SCR_MENU) drawMenu();
    else {
        const L = levels[cur], build = scr === SCR_BUILD;
        drawScene(L, build ? null : sim, build);
        if (build) {
            for (let pass = 0; pass < 3; pass++) design.beams.forEach((b, i) => {
                const M = MATS[b.mat], p = M.tensionOnly ? 0 : (M.road ? 2 : 1);
                if (p !== pass) return;
                const A = design.nodes[b.a].p, B = design.nodes[b.b].p;
                const st = (i === sel || (i === hoverBeam && !drawing && !isTouch)) ? 3 : 0;
                drawBeam(A.x, A.y, B.x, B.y, b.mat, TV.vlen(B.x - A.x, B.y - A.y), 0, false, true, st, false);
                if (M.hydraulic && (zoom > 18 || i === hoverBeam || i === sel)) {
                    const mx = SX((A.x + B.x) * 0.5), my = SY((A.y + B.y) * 0.5), s = '×' + fnum(b.ext, 2), w = textW(s, F.tiny) + 8;
                    fillRound(mx - w * 0.5, my - 18, w, 16, 5, col(0, 0.67));
                    text(s, F.tiny, mx, my - 10, '#f2b233', 1, 1);
                }
            });
            design.nodes.forEach((n, i) => drawJoint(n.p.x, n.p.y, n.anchor, true, i === hoverNode && !isTouch || i === dragNode));
            if (drawing) {
                const cx = SX(startX), cy = SY(startY), R = MATS[gMat].maxLen * zoom;
                ctx.setLineDash([2, 4]); ring(cx, cy, R, col(0xFFD166, 0.4), 1.5); ctx.setLineDash([]);
                disc(cx, cy, Math.max(6, 0.2 * zoom), col(0xFFD166, 0.45));
                const t = snapTarget(true), l = TV.vlen(t.x - startX, t.y - startY);
                if (l > 0.05 && (!isTouch || gesture)) {
                    const r = TV.canAddBeam(design, L, TV.v2(startX, startY), t, gMat);
                    drawBeam(startX, startY, t.x, t.y, gMat, l, 0, false, true, r === TV.ADD_OK || r === TV.ADD_EXISTS ? 1 : 2, false);
                    drawJoint(t.x, t.y, false, true, true);
                    const s = fnum(l, 2) + ' m  ·  ' + money(l * MATS[gMat].cost), w = textW(s, F.small) + 14;
                    const mx = SX(t.x), my = SY(t.y) - (isTouch ? 70 : 0);
                    fillRound(mx + 14, my - 30, w, 22, 7, col(0, 0.75));
                    text(s, F.small, mx + 21, my - 26, '#fff');
                }
                if (chain) button(B_ENDCHAIN, { x: gW - 190, y: TOPBAR + 12, w: 176, h: 44 }, 'Terminer', 0xB7791F, true);
            } else if (!isTouch && gMy > TOPBAR && gMy < gH - BOTBAR && !panning && hoverBeam < 0 && hoverNode < 0) {
                const t = snapTarget(false); ring(SX(t.x), SY(t.y), 4, col(0xFFFFFF, 0.43), 1.2);
            }
            if (!isTouch && hoverBeam >= 0 && !drawing && sel < 0) {
                const b = design.beams[hoverBeam], l = design.beamLen(b);
                const s = `${MATS[b.mat].name}  ·  ${fnum(l, 2)} m  ·  ${money(l * MATS[b.mat].cost)}`, w = textW(s, F.small) + 14;
                fillRound(gMx + 16, gMy + 14, w, 22, 7, col(0, 0.75));
                text(s, F.small, gMx + 23, gMy + 17, '#fff');
            }
        } else {
            drawBridgeSim(sim, showStress); drawVehicles(sim); drawBoats(L, sim, true, false); drawFx(sim); drawWater(L, false, true);
        }
        drawInfoPanel(); drawSelection(); drawFailBanner(); drawTopBar(); drawBottomBar(); drawToast();
        if (scr === SCR_SIM && sim.won && winT >= 1.2 && !resultDismissed) drawResult();
    }
    if (help) drawHelp();
    btnsPrev = btns;
}

// ============================================================ mise à jour
function update(dt) {
    animT += dt;
    if (toastT > 0) toastT -= dt;
    if (scr === SCR_MENU) {
        demo.frame(1); demo.events.length = 0;
        if (demo.time > 22 || demo.lost) demo.init(levels[DEMO_LEVEL], demoDesign);
        return;
    }
    if (scr !== SCR_SIM) return;
    const prevT = sim.time;
    if (!paused) sim.frame(SPEEDS[speedIdx]);
    for (const e of sim.events) {
        switch (e.type) {
        case TV.EV_BREAK: audio.play('brk', TV.clamp(0.35 + e.mag / 300, 0.3, 1)); break;
        case TV.EV_SPLASH: audio.play('splash', TV.clamp(e.mag / 10, 0.2, 1)); break;
        case TV.EV_ARRIVE: audio.play('arrive', 0.6); break;
        case TV.EV_FAIL: audio.play('fail', 0.8); break;
        case TV.EV_BOAT_HIT: audio.play('brk', 1); break;
        case TV.EV_HYD: audio.play('hyd', 0.6); break;
        case TV.EV_WIN: {
            audio.play('win', 0.9);
            const L = levels[cur], cost = design.cost();
            if (cost <= L.budget && (best[cur] < 0 || cost < best[cur])) best[cur] = Math.round(cost);
            saved[cur] = design; saveGame();
            if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
            break;
        }
        }
    }
    sim.events.length = 0;
    for (const b of sim.boats) if (b.d.time - sim.time < 6 && b.d.time - prevT >= 6) audio.play('horn', 0.7);
    if (sim.won) { if (winT < 0) winT = 0; winT += dt; }
}

// ============================================================ actions
function onButton(id) {
    audio.play('click', 0.5);
    if (id >= B_LEVEL) { loadLevel(id - B_LEVEL); return; }
    if (id >= B_MAT) { gMat = id - B_MAT; cancelDrawing(); sel = -1; return; }
    switch (id) {
    case B_MENU: goMenu(); break;
    case B_UNDO: undo(); break;
    case B_REDO: redo(); break;
    case B_CLEAR: if (design.beams.length) { pushUndo(); design = TV.initialDesign(levels[cur]); sel = -1; toast('Pont effacé (Annuler pour revenir).'); } break;
    case B_HELP: help = !help; break;
    case B_HELPCLOSE: help = false; break;
    case B_PLAY: if (scr === SCR_BUILD) startSim(); else stopSim(); break;
    case B_SPEED: speedIdx = (speedIdx + 1) % 4; break;
    case B_PAUSE: paused = !paused; break;
    case B_STRESS: showStress = !showStress; break;
    case B_HYD: sim.toggleHydraulics(); break;
    case B_EDIT: stopSim(); break;
    case B_WATCH: resultDismissed = true; break;
    case B_NEXT: saved[cur] = design; saveGame(); if (cur + 1 < levels.length) loadLevel(cur + 1); else goMenu(); break;
    case B_DEL: deleteBeam(sel); break;
    case B_EXTM: adjustHyd(sel, -0.05); break;
    case B_EXTP: adjustHyd(sel, 0.05); break;
    case B_ENDCHAIN: cancelDrawing(); break;
    case B_SOUND: muted = !muted; saveGame(); break;
    case B_FULL: toggleFullscreen(); break;
    case B_APK: window.location.href = 'Travee.apk'; break;
    case B_EXE: window.location.href = 'Travee.exe'; break;
    }
}
function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
}

const modalOpen = () => help || (scr === SCR_SIM && sim.won && winT >= 1.2 && !resultDismissed);
const modalBtn = id => id === B_HELPCLOSE || id === B_EDIT || id === B_WATCH || id === B_NEXT || (help && id === B_HELP);
function btnAt(x, y) {
    for (let i = btnsPrev.length - 1; i >= 0; i--) {
        const b = btnsPrev[i];
        if (hit(b.r, x, y)) return (modalOpen() && !modalBtn(b.id)) ? 0 : b.id;
    }
    return 0;
}
const inScene = y => y > TOPBAR && y < gH - BOTBAR;

// ============================================================ entrées
const pointers = new Map();
let gesture = null, pinch = null, panning = false, dragNode = -1, longTimer = 0;
const TAP = 9;

function setMouse(x, y) { gMx = x; gMy = y; mwx = WX(x); mwy = WY(y); }
function logical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / U, y: (e.clientY - r.top) / U }; }

function beginPan(x, y) { gesture.panX = x; gesture.panY = y; gesture.camX = camX; gesture.camY = camY; }

function primaryDown(x, y, e) {
    setMouse(x, y);
    const b = btnAt(x, y);
    if (b) { pressBtn = b; gesture = { kind: 'button', id: b, sx: x, sy: y }; return; }
    gesture = { kind: 'none', sx: x, sy: y, moved: false };
    if (modalOpen() || !inScene(y) || scr === SCR_MENU) return;
    if (scr === SCR_SIM) { gesture.kind = 'pan'; beginPan(x, y); return; }
    hoverAt();
    if (chain && drawing) { gesture.kind = 'chaintap'; beginPan(x, y); return; }
    if (e.shiftKey && hoverNode >= 0 && !design.nodes[hoverNode].anchor) { pushUndo(); dragNode = hoverNode; gesture.kind = 'dragnode'; return; }
    const n = design.nodeAt(TV.v2(mwx, mwy), Math.max(0.22, (isTouch ? 18 : 12) / zoom));
    if (n >= 0) {
        drawing = true; chain = false; sel = -1;
        startX = design.nodes[n].p.x; startY = design.nodes[n].p.y;
        gesture.kind = 'draw'; gesture.node = n;
        if (!design.nodes[n].anchor) {
            clearTimeout(longTimer);
            longTimer = setTimeout(() => {
                if (gesture && gesture.kind === 'draw' && !gesture.moved) {
                    drawing = false; pushUndo(); dragNode = n; gesture.kind = 'dragnode';
                    if (navigator.vibrate) navigator.vibrate(25);
                    toast("Déplace l'articulation");
                }
            }, 450);
        }
        return;
    }
    if (hoverBeam >= 0) { gesture.kind = 'beamtap'; gesture.beam = hoverBeam; beginPan(x, y); return; }
    gesture.kind = 'pan'; beginPan(x, y);
}

function primaryMove(x, y) {
    setMouse(x, y);
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(x - gesture.sx, y - gesture.sy) > TAP) { gesture.moved = true; clearTimeout(longTimer); }
    switch (gesture.kind) {
    case 'pan': case 'chaintap': case 'beamtap':
        if (gesture.moved) {
            panning = true;
            camX = gesture.camX - (x - gesture.panX) / zoom;
            camY = gesture.camY + (y - gesture.panY) / zoom;
            setMouse(x, y);
        }
        break;
    case 'dragnode': {
        const t = snapTarget(false), n = design.nodes[dragNode];
        if (!n || TV.vlen(t.x - n.p.x, t.y - n.p.y) < 1e-4 || TV.insideTerrain(levels[cur], t)) break;
        const other = design.nodeAt(t, 0.05);
        let ok = other < 0 || other === dragNode;
        for (const b of design.beams) {
            if (b.a !== dragNode && b.b !== dragNode) continue;
            const o = design.nodes[b.a === dragNode ? b.b : b.a].p, l = TV.vlen(o.x - t.x, o.y - t.y);
            if (l > MATS[b.mat].maxLen + 1e-3 || l < 0.3) ok = false;
        }
        if (ok) { n.p.x = t.x; n.p.y = t.y; }
        break;
    }
    }
}

function primaryUp(x, y) {
    clearTimeout(longTimer);
    const g = gesture;
    gesture = null; panning = false;
    if (!g) return;
    if (g.kind === 'button') { pressBtn = 0; if (btnAt(x, y) === g.id) onButton(g.id); return; }
    setMouse(x, y);
    switch (g.kind) {
    case 'draw':
        if (g.moved) { placeBeam(TV.v2(startX, startY), snapTarget(true)); drawing = false; }
        else chain = true;
        break;
    case 'chaintap':
        if (!g.moved) {
            const t = snapTarget(true);
            if (TV.vlen(t.x - startX, t.y - startY) < 0.05) { cancelDrawing(); break; }   // retoucher le point courant termine le tracé
            if (placeBeam(TV.v2(startX, startY), t)) { startX = t.x; startY = t.y; }
        }
        break;
    case 'beamtap': if (!g.moved) sel = g.beam; break;
    case 'pan': if (!g.moved && scr === SCR_BUILD) sel = -1; break;
    case 'dragnode': {
        dragNode = -1;
        const prev = undoS[undoS.length - 1];
        if (prev && prev.nodes.length === design.nodes.length && prev.nodes.every((n, i) => TV.vlen(n.p.x - design.nodes[i].p.x, n.p.y - design.nodes[i].p.y) < 1e-5)) undoS.pop();
        break;
    }
    }
}

function rightDown(x, y) {
    setMouse(x, y);
    if (modalOpen()) return;
    if (drawing) { cancelDrawing(); return; }
    if (!inScene(y) || scr === SCR_MENU) return;
    if (scr === SCR_BUILD) {
        hoverAt();
        if (hoverBeam >= 0) { deleteBeam(hoverBeam); hoverAt(); return; }
        if (hoverNode >= 0 && !design.nodes[hoverNode].anchor) { pushUndo(); design.removeNode(hoverNode); sel = -1; audio.play('del', 0.6); hoverAt(); return; }
    }
    gesture = { kind: 'pan', sx: x, sy: y, moved: true }; beginPan(x, y);
}

function zoomAt(x, y, factor) {
    const bx = WX(x), by = WY(y);
    zoom = TV.clamp(zoom * factor, 6, 140);
    camX += bx - WX(x); camY += by - WY(y);
    mwx = WX(gMx); mwy = WY(gMy);
}

cv.addEventListener('pointerdown', e => {
    audio.unlock();
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    const p = logical(e);
    pointers.set(e.pointerId, p);
    freePlace = e.ctrlKey;
    if (pointers.size === 2 && scr !== SCR_MENU && !modalOpen()) {
        // pincer : on abandonne le geste à un doigt en cours
        clearTimeout(longTimer);
        if (gesture && gesture.kind === 'draw') drawing = false;
        if (gesture && gesture.kind === 'dragnode') dragNode = -1;
        gesture = null; pressBtn = 0; panning = true;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom, camX, camY };
        return;
    }
    if (pointers.size > 1) return;
    if (e.pointerType === 'mouse' && e.button === 2) { rightDown(p.x, p.y); return; }
    if (e.pointerType === 'mouse' && e.button === 1) { setMouse(p.x, p.y); gesture = { kind: 'pan', sx: p.x, sy: p.y, moved: true }; beginPan(p.x, p.y); return; }
    primaryDown(p.x, p.y, e);
}, { passive: false });

cv.addEventListener('pointermove', e => {
    const p = logical(e);
    freePlace = e.ctrlKey;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        zoom = pinch.zoom; camX = pinch.camX; camY = pinch.camY;
        const wx = WX(pinch.mx), wy = WY(pinch.my);
        zoom = TV.clamp(pinch.zoom * d / pinch.d, 6, 140);
        camX = wx - (mx - gW * 0.5) / zoom;
        camY = wy + (my - viewCY()) / zoom;
        return;
    }
    if (gesture) primaryMove(p.x, p.y);
    else if (e.pointerType === 'mouse') { setMouse(p.x, p.y); hoverAt(); }
});

function pointerEnd(e) {
    const p = pointers.get(e.pointerId) || logical(e);
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) { pinch = null; panning = false; } return; }
    if (e.type === 'pointercancel') { clearTimeout(longTimer); if (gesture && gesture.kind === 'draw') drawing = false; gesture = null; pressBtn = 0; panning = false; return; }
    primaryUp(p.x, p.y);
    if (e.pointerType === 'mouse') hoverAt();
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !gesture) { gMx = gMy = -1000; hoverNode = hoverBeam = -1; } });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (scr === SCR_MENU || modalOpen()) return;
    const p = logical(e);
    if (scr === SCR_BUILD && e.shiftKey && hoverBeam >= 0) { adjustHyd(hoverBeam, e.deltaY < 0 ? 0.05 : -0.05); return; }
    zoomAt(p.x, p.y, Math.pow(1.15, -Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1)));
}, { passive: false });

window.addEventListener('keydown', e => {
    audio.unlock();
    freePlace = e.ctrlKey;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'F1') { e.preventDefault(); help = !help; return; }
    if (k === 'Escape') { back(); return; }
    if (scr === SCR_MENU) return;
    if (k === ' ') { e.preventDefault(); if (scr === SCR_BUILD) startSim(); else stopSim(); return; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (scr === SCR_BUILD) { if (e.shiftKey) redo(); else undo(); } return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); if (scr === SCR_BUILD) redo(); return; }
    if (k >= '1' && k <= '8') {
        const m = k.charCodeAt(0) - 49;
        if ((levels[cur].mats >> m) & 1) { gMat = m; cancelDrawing(); audio.play('click', 0.4); }
        return;
    }
    switch (k.toLowerCase()) {
    case 'h': if (scr === SCR_SIM && levels[cur].hasHyd) sim.toggleHydraulics(); break;
    case 't': showStress = !showStress; break;
    case 'f': speedIdx = (speedIdx + 1) % 4; break;
    case 'p': if (scr === SCR_SIM) paused = !paused; break;
    case 'g': showGrid = !showGrid; break;
    case 'r': case 'home': fitCamera(levels[cur]); break;
    case 'delete': case 'backspace':
        if (scr === SCR_BUILD) {
            hoverAt();
            const target = sel >= 0 ? sel : hoverBeam;
            if (target >= 0) deleteBeam(target);
            else if (hoverNode >= 0 && !design.nodes[hoverNode].anchor) { pushUndo(); design.removeNode(hoverNode); audio.play('del', 0.6); }
        }
        break;
    case '+': case '=': if (scr === SCR_BUILD) adjustHyd(sel >= 0 ? sel : hoverBeam, 0.05); break;
    case '-': if (scr === SCR_BUILD) adjustHyd(sel >= 0 ? sel : hoverBeam, -0.05); break;
    }
});
window.addEventListener('keyup', e => { freePlace = e.ctrlKey; });

// bouton « retour » (Échap, ou bouton retour Android) : renvoie false si rien à fermer
function back() {
    if (help) { help = false; return true; }
    if (drawing) { cancelDrawing(); return true; }
    if (sel >= 0) { sel = -1; return true; }
    if (scr === SCR_SIM) { if (modalOpen()) resultDismissed = true; else stopSim(); return true; }
    if (scr === SCR_BUILD) { goMenu(); return true; }
    return false;
}
window.travBack = back;
window.addEventListener('beforeunload', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('resize', resize);

// ============================================================ boucle
loadGame();
resize();
let last = performance.now(), acc = 0;
function loop(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (acc >= TV.FRAME_DT && steps < 4) { update(TV.FRAME_DT); acc -= TV.FRAME_DT; steps++; }
    if (steps === 4) acc = 0;
    render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// accès pour les tests automatiques
window.__travee = {
    loadLevel, startSim, stopSim, goMenu, sim, levels, ref: TV.ref,
    setDesign(D) { design = D; }, design: () => design, state: () => ({ scr, help, sel, drawing, chain, gMat, cost: design.cost(), zoom, camX, camY }),
    stepSim(seconds) { while (sim.time < seconds) { sim.frame(1); if (sim.won) { if (winT < 0) winT = 0; winT += TV.FRAME_DT; } animT += TV.FRAME_DT; } },
    toggleHyd() { sim.toggleHydraulics(); }, closeHelp() { help = false; },
    world2screen(x, y) { return { x: SX(x) * U, y: SY(y) * U }; },
    button(id) { const b = btnsPrev.find(k => k.id === id); return b ? { x: (b.r.x + b.r.w / 2) * U, y: (b.r.y + b.r.h / 2) * U } : null; },
    ids: { B_PLAY, B_HELPCLOSE, B_ENDCHAIN, B_DEL, B_MENU, B_NEXT, B_HYD, B_STRESS, B_MAT, B_LEVEL, B_UNDO },
};
})();
