/* =====================================================================
 *  TRAVÉE — Bâtisseurs de ponts
 *  core.js : moteur du jeu (port JavaScript fidèle de src/core.h)
 *  matériaux, véhicules, niveaux, conception, simulation XPBD.
 *  Fonctionne dans le navigateur (window.TV) et sous Node (require).
 * ===================================================================== */
(function (global) {
'use strict';

// ---------------------------------------------------------- constantes
const GRAV = -9.81;
const SUBSTEPS = 32;
const FRAME_DT = 1 / 60;
const SUB_DT = FRAME_DT / SUBSTEPS;
const ROAD_HALF = 0.12;
const JOINT_MASS = 10;
const GRID = 0.5;
const HYD_SPEED = 0.45;
const BOAT_PASS = 2.5;
const HYD_DEFAULT_EXT = 1.5;

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const lerp = (a, b, t) => a + (b - a) * t;
const v2 = (x, y) => ({ x, y });
const vlen = (x, y) => Math.sqrt(x * x + y * y);
function frand(st) { st.s = (Math.imul(st.s, 1664525) + 1013904223) >>> 0; return (st.s >>> 8) / 16777216; }

// ------------------------------------------------------------ matériaux
const M_ROAD = 0, M_ROAD_HEAVY = 1, M_WOOD = 2, M_STEEL = 3, M_ROPE = 4, M_CABLE = 5, M_SPRING = 6, M_HYD = 7, M_COUNT = 8;
function mk(name, desc, cost, maxLen, density, EA, strength, road, tensionOnly, hydraulic, damp) {
    return { name, desc, cost, maxLen, density, EA, strength, road, tensionOnly, hydraulic, damp };
}
const MATS = [
    mk('Route',           'Chaussée : les véhicules roulent dessus.',     200, 2,  80, 1.40e7, 110e3, true,  false, false, 0.020),
    mk('Route renforcée', 'Chaussée lourde pour camions et bus.',         360, 2, 120, 3.00e7, 240e3, true,  false, false, 0.020),
    mk('Bois',            'Léger et bon marché, résistance moyenne.',     100, 2,  30, 8.75e6,  70e3, false, false, false, 0.020),
    mk('Acier',           'Très solide et plus long, mais coûteux.',      400, 4,  60, 3.25e7, 260e3, false, false, false, 0.020),
    mk('Corde',           'Traction seulement, souple et bon marché.',     30, 10,  4, 1.50e6,  45e3, false, true,  false, 0.020),
    mk('Câble',           'Traction seulement, très résistant.',           90, 20, 12, 3.50e7, 280e3, false, true,  false, 0.020),
    mk('Ressort',         'Élastique : absorbe les chocs.',               220, 2,  25, 3.00e5, 150e3, false, false, false, 0.010),
    mk('Vérin',           'Change de longueur avec [H]. Réglable (+/-).', 600, 4,  80, 3.75e7, 300e3, false, false, true,  0.020),
];

// ------------------------------------------------------------ véhicules
const V_CAR = 0, V_MOTO = 1, V_VAN = 2, V_JEEP = 3, V_BUS = 4, V_TRUCK = 5, V_SEMI = 6, V_TRAILER = 7, V_COUNT = 8;
function vt(name, L, H, mass, wheelMass, w, speed, drive, susp, trailer, hitch) {
    return { name, L, H, mass, wheelMass, nw: w.length, w: w.map(a => ({ x: a[0], y: a[1], r: a[2] })), speed, drive, susp, trailer, hitch };
}
const VTYPES = [
    vt('Citadine',      3.6, 1.0,  1000,  60, [[0.75, -0.08, 0.34], [2.85, -0.08, 0.34]], 8.0,  7000, 0.05, -1, null),
    vt('Moto',          2.0, 0.8,   230,  25, [[0.30, -0.05, 0.32], [1.70, -0.05, 0.32]], 10,   2600, 0.04, -1, null),
    vt('Fourgon',       4.8, 1.9,  2000,  80, [[0.95, -0.08, 0.38], [3.90, -0.08, 0.38]], 7.0, 13000, 0.05, -1, null),
    vt('4x4',           4.0, 1.3,  1700, 120, [[0.80, -0.30, 0.55], [3.20, -0.30, 0.55]], 13,  19000, 0.08, -1, null),
    vt('Bus',           9.0, 2.6,  7000, 150, [[1.70, -0.08, 0.50], [7.30, -0.08, 0.50]], 6.0, 38000, 0.05, -1, null),
    vt('Camion-benne',  7.0, 2.4, 10000, 200, [[1.10, -0.08, 0.55], [2.30, -0.08, 0.55], [5.90, -0.08, 0.55]], 5.5, 60000, 0.05, -1, null),
    vt('Semi-remorque', 4.6, 2.4,  4000, 180, [[1.00, -0.08, 0.52], [3.80, -0.08, 0.52]], 5.5, 60000, 0.05, V_TRAILER, v2(1.2, 0.9)),
    vt('Remorque',      9.0, 2.2,  7000, 180, [[0.90, -0.68, 0.52], [2.10, -0.68, 0.52]], 0.0,     0, 0.05, -1, v2(8.4, 0.3)),
];

// -------------------------------------------------------------- terrain
function finalizePoly(P) {
    const n = P.pts.length;
    let a = 0;
    for (let i = 0; i < n; i++) { const p = P.pts[i], q = P.pts[(i + 1) % n]; a += p.x * q.y - p.y * q.x; }
    if (a < 0) P.pts.reverse();
    P.minx = P.miny = 1e30; P.maxx = P.maxy = -1e30;
    for (const p of P.pts) {
        P.minx = Math.min(P.minx, p.x); P.maxx = Math.max(P.maxx, p.x);
        P.miny = Math.min(P.miny, p.y); P.maxy = Math.max(P.maxy, p.y);
    }
    return P;
}
function poly(pts) { return finalizePoly({ pts: pts.map(p => v2(p[0], p[1])) }); }

function pointInPoly(P, qx, qy) {
    if (qx < P.minx || qx > P.maxx || qy < P.miny || qy > P.maxy) return false;
    let inside = false;
    const pts = P.pts, n = pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > qy) !== (b.y > qy)) {
            const xi = a.x + (qy - a.y) * (b.x - a.x) / (b.y - a.y);
            if (qx < xi) inside = !inside;
        }
    }
    return inside;
}

const CP = { d: 0, cx: 0, cy: 0, ex: 0, ey: 0 };   // résultat partagé (évite les allocations)
function closestOnPoly(P, qx, qy) {
    let best = 1e30;
    const pts = P.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey;
        const t = l2 > 1e-12 ? clamp(((qx - a.x) * ex + (qy - a.y) * ey) / l2, 0, 1) : 0;
        const cx = a.x + ex * t, cy = a.y + ey * t;
        const d = (qx - cx) * (qx - cx) + (qy - cy) * (qy - cy);
        if (d < best) {
            best = d; CP.cx = cx; CP.cy = cy;
            const el = vlen(ex, ey) || 1;
            CP.ex = ey / el; CP.ey = -ex / el;
        }
    }
    CP.d = Math.sqrt(best);
    return CP;
}

const CC = { nx: 0, ny: 0, C: 0 };
function circlePoly(P, qx, qy, r) {
    if (qx < P.minx - r || qx > P.maxx + r || qy < P.miny - r || qy > P.maxy + r) return false;
    closestOnPoly(P, qx, qy);
    const d = CP.d;
    if (pointInPoly(P, qx, qy)) {
        if (d > 1e-5) { CC.nx = (CP.cx - qx) / d; CC.ny = (CP.cy - qy) / d; } else { CC.nx = CP.ex; CC.ny = CP.ey; }
        CC.C = -(d + r);
        return true;
    }
    if (d >= r) return false;
    if (d > 1e-5) { CC.nx = (qx - CP.cx) / d; CC.ny = (qy - CP.cy) / d; } else { CC.nx = CP.ex; CC.ny = CP.ey; }
    CC.C = d - r;
    return true;
}

function segSegIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return false;
    const qx = cx - ax, qy = cy - ay;
    const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function segPoly(P, ax, ay, bx, by) {
    if (Math.max(ax, bx) < P.minx || Math.min(ax, bx) > P.maxx || Math.max(ay, by) < P.miny || Math.min(ay, by) > P.maxy) return false;
    if (pointInPoly(P, ax, ay) || pointInPoly(P, bx, by)) return true;
    const pts = P.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
        const c = pts[i], d = pts[(i + 1) % n];
        if (segSegIntersect(ax, ay, bx, by, c.x, c.y, d.x, d.y)) return true;
    }
    return false;
}

function insideTerrain(L, p) {
    for (const P of L.terrain) {
        if (!pointInPoly(P, p.x, p.y)) continue;
        if (closestOnPoly(P, p.x, p.y).d > 0.05) return true;
    }
    return false;
}
function terrainTopY(L, x) {
    let best = -1e9;
    for (const P of L.terrain) {
        const pts = P.pts, n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
                const t = (x - a.x) / (b.x - a.x);
                best = Math.max(best, a.y + (b.y - a.y) * t);
            }
        }
    }
    return best;
}

// silhouettes du bateau (coque, cabine, mât)
function boatShapes(b, waterY) {
    const x = b.x, hw = b.width * 0.5, w = waterY;
    return [
        poly([[x - hw, w + 1.0], [x - hw + 0.7, w - 0.7], [x + hw - 0.4, w - 0.7], [x + hw + 0.3, w + 1.2]]),
        poly([[x - hw * 0.45, w + 1.0], [x + hw * 0.45, w + 1.0], [x + hw * 0.35, w + 3.8], [x - hw * 0.45, w + 3.8]]),
        poly([[x + 0.05, w + 3.8], [x + 0.35, w + 3.8], [x + 0.35, w + b.mast], [x + 0.05, w + b.mast]]),
    ];
}

// ----------------------------------------------------------- conception
class Design {
    constructor() { this.nodes = []; this.beams = []; }
    clone() {
        const d = new Design();
        d.nodes = this.nodes.map(n => ({ p: v2(n.p.x, n.p.y), anchor: n.anchor }));
        d.beams = this.beams.map(b => ({ a: b.a, b: b.b, mat: b.mat, ext: b.ext }));
        return d;
    }
    beamLen(b) { const A = this.nodes[b.a].p, B = this.nodes[b.b].p; return vlen(B.x - A.x, B.y - A.y); }
    cost() { let c = 0; for (const b of this.beams) c += MATS[b.mat].cost * this.beamLen(b); return c; }
    nodeAt(p, r) {
        let best = -1, bd = r;
        for (let i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i].p, d = vlen(n.x - p.x, n.y - p.y);
            if (d <= bd) { bd = d; best = i; }
        }
        return best;
    }
    beamBetween(a, b) {
        for (let i = 0; i < this.beams.length; i++) {
            const k = this.beams[i];
            if ((k.a === a && k.b === b) || (k.a === b && k.b === a)) return i;
        }
        return -1;
    }
    degree(n) { let d = 0; for (const b of this.beams) if (b.a === n || b.b === n) d++; return d; }
    prune() { for (let i = this.nodes.length - 1; i >= 0; i--) if (!this.nodes[i].anchor && this.degree(i) === 0) this.eraseNode(i); }
    eraseNode(i) {
        this.beams = this.beams.filter(b => b.a !== i && b.b !== i);
        this.nodes.splice(i, 1);
        for (const b of this.beams) { if (b.a > i) b.a--; if (b.b > i) b.b--; }
    }
    removeBeam(i) { this.beams.splice(i, 1); this.prune(); }
    removeNode(i) { if (this.nodes[i].anchor) return; this.eraseNode(i); this.prune(); }
}

function initialDesign(L) {
    const D = new Design();
    for (const a of L.anchors) D.nodes.push({ p: v2(a.x, a.y), anchor: true });
    return D;
}

const ADD_OK = 0, ADD_TOO_SHORT = 1, ADD_TOO_LONG = 2, ADD_IN_TERRAIN = 3, ADD_EXISTS = 4;
function canAddBeam(D, L, a, b, m) {
    const l = vlen(b.x - a.x, b.y - a.y);
    if (l < 0.3) return ADD_TOO_SHORT;
    if (l > MATS[m].maxLen + 1e-3) return ADD_TOO_LONG;
    const ia = D.nodeAt(a, 0.01), ib = D.nodeAt(b, 0.01);
    if (ia < 0 && insideTerrain(L, a)) return ADD_IN_TERRAIN;
    if (ib < 0 && insideTerrain(L, b)) return ADD_IN_TERRAIN;
    if (ia >= 0 && ib >= 0) {
        const ex = D.beamBetween(ia, ib);
        if (ex >= 0 && D.beams[ex].mat === m) return ADD_EXISTS;
    }
    return ADD_OK;
}
function addBeam(D, L, a, b, m, ext) {
    const r = canAddBeam(D, L, a, b, m);
    if (r !== ADD_OK) return r;
    let ia = D.nodeAt(a, 0.01), ib = D.nodeAt(b, 0.01);
    if (ia < 0) { D.nodes.push({ p: v2(a.x, a.y), anchor: false }); ia = D.nodes.length - 1; }
    if (ib < 0) { D.nodes.push({ p: v2(b.x, b.y), anchor: false }); ib = D.nodes.length - 1; }
    const e = MATS[m].hydraulic ? (ext > 0 ? ext : HYD_DEFAULT_EXT) : 1;
    const ex = D.beamBetween(ia, ib);
    if (ex >= 0) { D.beams[ex].mat = m; D.beams[ex].ext = e; return ADD_OK; }
    D.beams.push({ a: ia, b: ib, mat: m, ext: e });
    return ADD_OK;
}

// ========================================================== simulation
const PK_NODE = 0, PK_WHEEL = 1, PK_BODY = 2, PK_HITCH = 3;
const CM_FREE = 0, CM_FRICTION = 1, CM_DRIVE = 2;
const EV_BREAK = 0, EV_SPLASH = 1, EV_ARRIVE = 2, EV_FAIL = 3, EV_WIN = 4, EV_BOAT_HIT = 5, EV_HYD = 6;
const COLORS = [0xE53935, 0x1E88E5, 0x43A047, 0xFDD835, 0x8E24AA, 0xFB8C00, 0x00ACC1, 0xF06292];

class Sim {
    constructor() { this.lv = null; }

    init(L, D) {
        this.lv = L;
        this.parts = []; this.beams = []; this.cons = []; this.susp = []; this.veh = []; this.boats = []; this.fx = []; this.events = [];
        this.time = 0; this.hydPhase = 0; this.hydTarget = 0; this.subAcc = 0;
        this.arrived = 0; this.breaks = 0; this.won = false; this.lost = false; this.failMsg = ''; this.maxStress = 0;
        this.rng = { s: 0x9E3779B9 };
        const m = D.nodes.map(() => JOINT_MASS);
        for (const b of D.beams) { const bm = MATS[b.mat].density * D.beamLen(b); m[b.a] += bm * 0.5; m[b.b] += bm * 0.5; }
        D.nodes.forEach((n, i) => {
            this.parts.push({ x: n.p.x, y: n.p.y, px: n.p.x, py: n.p.y, vx: 0, vy: 0, w: n.anchor ? 0 : 1 / m[i], r: 0.06, kind: PK_NODE, active: true, wet: false });
        });
        this.nodeCount = this.parts.length;
        for (const b of D.beams) {
            const l = D.beamLen(b);
            this.beams.push({ a: b.a, b: b.b, mat: b.mat, rest0: l, rest: l, ext: b.ext, acc: 0, force: 0, stress: 0, mass: MATS[b.mat].density * l, alive: true, broken: false });
        }
        this.queue = [[], []];
        for (const s of L.spawns) this.queue[s.dir > 0 ? 0 : 1].push(s);
        for (const q of this.queue) q.sort((a, b) => a.time - b.time);   // tri stable
        this.nextSpawn = [0, 0];
        this.total = L.spawns.length;
        for (const b of L.boats) this.boats.push({ d: b, hit: false, passed: false });
    }

    frame(scale) {
        this.subAcc += SUBSTEPS * scale;
        const n = Math.floor(this.subAcc);
        this.subAcc -= n;
        const dt = n * SUB_DT;
        if (n > 0) {
            for (const b of this.beams) b.acc = 0;
            for (let i = 0; i < n; i++) this.substep();
            this.time += dt;
            const nb = this.beams.length;
            for (let i = 0; i < nb; i++) {
                const b = this.beams[i];
                if (!b.alive) continue;
                b.force = b.acc / n;
                const s = Math.abs(b.force) / MATS[b.mat].strength;
                b.stress = b.stress * 0.6 + s * 0.4;
                if (!b.broken) {
                    this.maxStress = Math.max(this.maxStress, b.stress);
                    if (b.stress > 1) this.breakBeam(i);
                }
            }
            this.spawnLogic();
            this.vehicleLogic(dt);
            this.boatLogic();
            this.waterLogic();
            this.spinWheels();
        }
        this.updateFx(FRAME_DT * scale);
        if (!this.won && !this.lost && this.arrived >= this.total) {
            if (this.boats.every(b => b.passed)) { this.won = true; this.events.push({ type: EV_WIN, x: 0, y: 0, mag: 1 }); }
        }
    }

    toggleHydraulics() {
        this.hydTarget = this.hydTarget > 0.5 ? 0 : 1;
        this.events.push({ type: EV_HYD, x: 0, y: 0, mag: this.hydTarget });
    }

    bodyFrame(v, bi) {
        const B = v.body[bi], P = this.parts;
        const o = P[B.c[0]], f = P[B.c[1]];
        let ax = f.x - o.x, ay = f.y - o.y;
        const l = vlen(ax, ay) || 1;
        ax /= l; ay /= l;
        // axe « haut » de la caisse (perp tournée selon le sens de marche)
        const ux = v.dir > 0 ? -ay : ay, uy = v.dir > 0 ? ax : -ax;
        return { ox: o.x, oy: o.y, ax, ay, ux, uy };
    }
    vehCenter(v) {
        const B = v.body[0], P = this.parts;
        let x = 0, y = 0;
        for (let k = 0; k < 4; k++) { x += P[B.c[k]].x; y += P[B.c[k]].y; }
        return v2(x * 0.25, y * 0.25);
    }

    // ------------------------------------------------------------ interne
    addPart(x, y, m, r, kind) {
        this.parts.push({ x, y, px: x, py: y, vx: 0, vy: 0, w: 1 / m, r, kind, active: true, wet: false });
        return this.parts.length - 1;
    }
    addCon(a, b, comp, damp) {
        const P = this.parts;
        this.cons.push({ a, b, rest: vlen(P[b].x - P[a].x, P[b].y - P[a].y), comp, damp });
    }

    substep() {
        const h = SUB_DT, h2 = h * h, P = this.parts;
        if (this.hydPhase !== this.hydTarget) {
            const s = h * HYD_SPEED;
            this.hydPhase = this.hydTarget > this.hydPhase ? Math.min(this.hydTarget, this.hydPhase + s) : Math.max(this.hydTarget, this.hydPhase - s);
        }
        const hp = this.hydPhase, e = hp * hp * (3 - 2 * hp);
        for (const b of this.beams)
            if (b.alive && !b.broken && MATS[b.mat].hydraulic) b.rest = b.rest0 * (1 + (b.ext - 1) * e);

        const wy = this.lv.waterY;
        for (const q of P) {
            if (!q.active || q.w === 0) continue;
            let g = GRAV;
            if (q.y < wy) {
                g += (q.kind === PK_NODE ? 7.0 : 5.0);
                const f = 1 - 2.5 * h;
                q.vx *= f; q.vy *= f;
            }
            q.vy += g * h;
            q.px = q.x; q.py = q.y;
            q.x += q.vx * h; q.y += q.vy * h;
            if (q.y < wy - 40) q.active = false;
        }
        // poutres
        for (const b of this.beams) {
            if (!b.alive) continue;
            const A = P[b.a], B = P[b.b];
            const wsum = A.w + B.w;
            if (wsum === 0) continue;
            const dx = B.x - A.x, dy = B.y - A.y, L = vlen(dx, dy);
            if (L < 1e-6) continue;
            const nx = dx / L, ny = dy / L, C = L - b.rest, M = MATS[b.mat];
            if (M.tensionOnly && C < 0) continue;
            const alpha = (b.rest / M.EA) / h2;
            const dl = -C / (wsum + alpha);
            A.x -= nx * A.w * dl; A.y -= ny * A.w * dl;
            B.x += nx * B.w * dl; B.y += ny * B.w * dl;
            b.acc += -dl / h2;
        }
        // contraintes rigides des véhicules
        for (const c of this.cons) {
            const A = P[c.a], B = P[c.b];
            if (!A.active || !B.active) continue;
            const dx = B.x - A.x, dy = B.y - A.y, L = vlen(dx, dy);
            if (L < 1e-6) continue;
            const nx = dx / L, ny = dy / L, C = L - c.rest;
            const dl = -C / (A.w + B.w + c.comp / h2);
            A.x -= nx * A.w * dl; A.y -= ny * A.w * dl;
            B.x += nx * B.w * dl; B.y += ny * B.w * dl;
        }
        for (const c of this.susp) this.solveSusp(c, h2);
        // contacts
        for (const v of this.veh) {
            if (v.gone) continue;
            for (let bi = 0; bi < v.nb; bi++) {
                const B = v.body[bi], T = VTYPES[B.type];
                const driven = T.drive > 0;
                const maxImp = driven ? T.drive / T.nw * h2 : 0;
                for (let k = 0; k < T.nw; k++) this.collide(B.wheel[k], T.w[k].r, driven ? CM_DRIVE : CM_FREE, v.target, maxImp, 0.9, v.dir);
                for (let k = 0; k < 4; k++) this.collide(B.c[k], 0.1, CM_FRICTION, 0, 0, 0.5, v.dir);
            }
            if (v.hitch >= 0) this.collide(v.hitch, 0.1, CM_FRICTION, 0, 0, 0.5, v.dir);
        }
        for (let i = 0; i < this.nodeCount; i++) this.terrainOnly(i);
        for (let i = this.nodeCount; i < P.length; i++) if (P[i].kind === PK_NODE) this.terrainOnly(i);

        // vitesses
        for (const q of P) if (q.active && q.w > 0) { q.vx = (q.x - q.px) / h; q.vy = (q.y - q.py) / h; }
        // amortissement axial
        for (const b of this.beams) {
            if (!b.alive) continue;
            const A = P[b.a], B = P[b.b], wsum = A.w + B.w;
            if (wsum === 0) continue;
            const dx = B.x - A.x, dy = B.y - A.y, L = vlen(dx, dy) || 1;
            const nx = dx / L, ny = dy / L;
            const vr = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
            if (MATS[b.mat].tensionOnly && L < b.rest) continue;
            const j = -vr * MATS[b.mat].damp / wsum;
            A.vx -= nx * A.w * j; A.vy -= ny * A.w * j;
            B.vx += nx * B.w * j; B.vy += ny * B.w * j;
        }
        for (const c of this.susp) {
            const W = P[c.w], A = P[c.a], B = P[c.b];
            if (!W.active) continue;
            let ax = B.x - A.x, ay = B.y - A.y;
            const l = vlen(ax, ay) || 1; ax /= l; ay /= l;
            const ux = c.dir > 0 ? -ay : ay, uy = c.dir > 0 ? ax : -ax;
            const wA = A.w * (1 - c.s), wB = B.w * c.s, wsum = W.w + wA * (1 - c.s) + wB * c.s;
            const vtx = A.vx * (1 - c.s) + B.vx * c.s, vty = A.vy * (1 - c.s) + B.vy * c.s;
            const j = -((W.vx - vtx) * ux + (W.vy - vty) * uy) * c.damp / wsum;
            W.vx += ux * W.w * j; W.vy += uy * W.w * j;
            A.vx -= ux * wA * j; A.vy -= uy * wA * j;
            B.vx -= ux * wB * j; B.vy -= uy * wB * j;
        }
        for (const c of this.cons) {
            if (c.damp <= 0) continue;
            const A = P[c.a], B = P[c.b];
            if (!A.active || !B.active) continue;
            const dx = B.x - A.x, dy = B.y - A.y, L = vlen(dx, dy) || 1, nx = dx / L, ny = dy / L;
            const j = -((B.vx - A.vx) * nx + (B.vy - A.vy) * ny) * c.damp / (A.w + B.w);
            A.vx -= nx * A.w * j; A.vy -= ny * A.w * j;
            B.vx += nx * B.w * j; B.vy += ny * B.w * j;
        }
    }

    solveSusp(c, h2) {
        const P = this.parts, W = P[c.w], A = P[c.a], B = P[c.b];
        if (!W.active) return;
        const wA = A.w * (1 - c.s), wB = B.w * c.s, wsum = W.w + wA * (1 - c.s) + wB * c.s;
        for (let pass = 0; pass < 2; pass++) {
            let ax = B.x - A.x, ay = B.y - A.y;
            const l = vlen(ax, ay) || 1; ax /= l; ay /= l;
            const ux = c.dir > 0 ? -ay : ay, uy = c.dir > 0 ? ax : -ax;
            const tx = A.x * (1 - c.s) + B.x * c.s + ux * c.wy, ty = A.y * (1 - c.s) + B.y * c.s + uy * c.wy;
            const ex = W.x - tx, ey = W.y - ty;
            const dx = pass === 0 ? ax : ux, dy = pass === 0 ? ay : uy;
            const C = ex * dx + ey * dy;
            let dl;
            if (pass === 0) dl = -C / wsum;
            else {
                dl = -C / (wsum + c.comp / h2);
                const after = C + dl * wsum;                    // butée de suspension
                if (after > c.travel) dl = (c.travel - C) / wsum;
                else if (after < -c.travel) dl = (-c.travel - C) / wsum;
            }
            W.x += dx * W.w * dl; W.y += dy * W.w * dl;
            A.x -= dx * wA * dl; A.y -= dy * wA * dl;
            B.x -= dx * wB * dl; B.y -= dy * wB * dl;
        }
    }

    terrainOnly(i) {
        const q = this.parts[i];
        if (!q.active || q.w === 0) return;
        for (const T of this.lv.terrain)
            if (circlePoly(T, q.x, q.y, q.r)) this.applyContact(i, -1, -1, 0, CC.nx, CC.ny, CC.C, CM_FRICTION, 0, 0, 0.6, 1);
    }

    applyContact(pi, ia, ib, u, nx, ny, C, mode, tgt, maxImp, mu, dir) {
        const P = this.parts, Q = P[pi];
        const A = ia >= 0 ? P[ia] : null, B = ib >= 0 ? P[ib] : null;
        const wa = A ? A.w * (1 - u) : 0, wb = B ? B.w * u : 0;
        const wsum = Q.w + wa * (1 - u) + wb * u;
        if (wsum <= 0) return;
        const dl = -C / wsum;
        Q.x += nx * Q.w * dl; Q.y += ny * Q.w * dl;
        if (A) { A.x -= nx * wa * dl; A.y -= ny * wa * dl; }
        if (B) { B.x -= nx * wb * dl; B.y -= ny * wb * dl; }
        if (mode === CM_FREE) return;
        if (mode === CM_DRIVE && ny < 0.25) mode = CM_FRICTION;   // pas de traction contre un mur
        let tx = ny, ty = -nx;
        if (tx * dir < 0) { tx = -tx; ty = -ty; }
        let dsx = 0, dsy = 0;
        if (A) { dsx += (A.x - A.px) * (1 - u); dsy += (A.y - A.py) * (1 - u); }
        if (B) { dsx += (B.x - B.px) * u; dsy += (B.y - B.py) * u; }
        const vt = ((Q.x - Q.px) - dsx) * tx + ((Q.y - Q.py) - dsy) * ty;
        const want = (mode === CM_DRIVE ? tgt * SUB_DT : 0) - vt;
        let dlt = want / wsum;
        let lim = mu * dl;
        if (mode === CM_DRIVE && tgt > 0.01) lim = Math.min(lim, maxImp);
        dlt = clamp(dlt, -lim, lim);
        Q.x += tx * Q.w * dlt; Q.y += ty * Q.w * dlt;
        if (A) { A.x -= tx * wa * dlt; A.y -= ty * wa * dlt; }
        if (B) { B.x -= tx * wb * dlt; B.y -= ty * wb * dlt; }
    }

    collide(pi, r, mode, tgt, maxImp, mu, dir) {
        const P = this.parts;
        if (!P[pi].active) return;
        for (const T of this.lv.terrain)
            if (circlePoly(T, P[pi].x, P[pi].y, r)) this.applyContact(pi, -1, -1, 0, CC.nx, CC.ny, CC.C, mode, tgt, maxImp, mu, dir);
        const R = r + ROAD_HALF;
        for (const b of this.beams) {
            if (!b.alive || !MATS[b.mat].road) continue;
            const q = P[pi], A = P[b.a], B = P[b.b];
            if (q.x < Math.min(A.x, B.x) - R || q.x > Math.max(A.x, B.x) + R ||
                q.y < Math.min(A.y, B.y) - R || q.y > Math.max(A.y, B.y) + R) continue;
            const abx = B.x - A.x, aby = B.y - A.y, l2 = abx * abx + aby * aby;
            const u = l2 > 1e-9 ? clamp(((q.x - A.x) * abx + (q.y - A.y) * aby) / l2, 0, 1) : 0;
            const dx = q.x - (A.x + abx * u), dy = q.y - (A.y + aby * u), dist = vlen(dx, dy);
            if (dist >= R || dist < 1e-6) continue;
            this.applyContact(pi, b.a, b.b, u, dx / dist, dy / dist, dist - R, mode, tgt, maxImp, mu, dir);
        }
    }

    breakBeam(i) {
        const P = this.parts, b = this.beams[i];
        const A = P[b.a], B = P[b.b];
        const mx = (A.x + B.x) * 0.5, my = (A.y + B.y) * 0.5;
        let dx = B.x - A.x, dy = B.y - A.y; const l = vlen(dx, dy) || 1; dx /= l; dy /= l;
        const vmx = (A.vx + B.vx) * 0.5, vmy = (A.vy + B.vy) * 0.5;
        const hm = Math.max(2, b.mass * 0.25);
        const m1 = this.addPart(mx - dx * 0.03, my - dy * 0.03, hm, 0.06, PK_NODE);
        const m2 = this.addPart(mx + dx * 0.03, my + dy * 0.03, hm, 0.06, PK_NODE);
        P[m1].vx = P[m2].vx = vmx; P[m1].vy = P[m2].vy = vmy;
        const hr = b.rest * 0.5, oldB = b.b, mass = b.mass;
        b.b = m1; b.rest0 = b.rest = hr; b.broken = true; b.stress = 0; b.mass = mass * 0.5;
        this.beams.push({ a: m2, b: oldB, mat: b.mat, rest0: hr, rest: hr, ext: b.ext, acc: 0, force: 0, stress: 0, mass: mass * 0.5, alive: true, broken: true });
        this.breaks++;
        this.events.push({ type: EV_BREAK, x: mx, y: my, mag: mass });
        for (let k = 0; k < 10; k++) {
            const life = 0.6 + frand(this.rng) * 0.6;
            this.fx.push({ x: mx, y: my, vx: vmx + (frand(this.rng) - 0.5) * 6, vy: vmy + frand(this.rng) * 5, life, maxLife: life,
                           size: 0.05 + frand(this.rng) * 0.08, color: k < 5 ? 0x8D6E63 : 0xFFD54F, kind: 0 });
        }
    }

    buildBody(B, type, ox, oy, dir) {
        const T = VTYPES[type];
        B.type = type;
        const mc = T.mass * 0.25;
        B.c = [
            this.addPart(ox, oy, mc, 0.1, PK_BODY),
            this.addPart(ox + T.L * dir, oy, mc, 0.1, PK_BODY),
            this.addPart(ox + T.L * dir, oy + T.H, mc, 0.1, PK_BODY),
            this.addPart(ox, oy + T.H, mc, 0.1, PK_BODY),
        ];
        for (const k of [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]]) this.addCon(B.c[k[0]], B.c[k[1]], 0, 0);
        const load = (T.mass + T.nw * T.wheelMass) * 9.81 / T.nw;
        const comp = T.susp / load;
        B.wheel = []; B.spin = []; B.last = [];
        for (let k = 0; k < T.nw; k++) {
            const w = T.w[k];
            const id = this.addPart(ox + w.x * dir, oy + w.y, T.wheelMass, w.r, PK_WHEEL);
            B.wheel.push(id); B.spin.push(0); B.last.push(v2(this.parts[id].x, this.parts[id].y));
            this.susp.push({ w: id, a: B.c[0], b: B.c[1], dir, s: w.x / T.L, wy: w.y, comp, damp: 0.05, travel: Math.max(0.15, T.susp * 5) });
        }
    }

    static trailerLen(type) { const t = VTYPES[type].trailer; return t >= 0 ? VTYPES[t].L - 1.2 : 0; }

    spawnVehicle(type, dir, cx) {
        const T = VTYPES[type];
        let ground = terrainTopY(this.lv, cx);
        if (ground < -1e8) ground = 0;
        let lowest = 0;
        for (const w of T.w) lowest = Math.min(lowest, w.y - w.r);
        const ox = cx - dir * T.L * 0.5, oy = ground - lowest + 0.03;
        const v = { type, dir, color: COLORS[Math.floor(frand(this.rng) * 8) & 7], body: [{}, {}], nb: 1, hitch: -1, p0: this.parts.length, p1: 0,
                    target: T.speed, arrived: false, gone: false, failed: false, flipT: 0 };
        this.buildBody(v.body[0], type, ox, oy, dir);
        if (T.trailer >= 0) {
            const R = VTYPES[T.trailer];
            const hx = ox + T.hitch.x * dir, hy = oy + T.hitch.y;
            this.buildBody(v.body[1], T.trailer, hx - R.hitch.x * dir, hy - R.hitch.y, dir);
            v.nb = 2;
            const h = this.addPart(hx, hy, 60, 0.1, PK_HITCH);
            v.hitch = h;
            const B0 = v.body[0], B1 = v.body[1];
            this.addCon(h, B0.c[0], 0, 0); this.addCon(h, B0.c[3], 0, 0); this.addCon(h, B0.c[1], 0, 0);
            this.addCon(h, B1.c[1], 0, 0); this.addCon(h, B1.c[2], 0, 0);
        }
        v.p1 = this.parts.length;
        for (let i = v.p0; i < v.p1; i++) { this.parts[i].vx = dir * T.speed * 0.6; this.parts[i].vy = 0; }
        this.veh.push(v);
    }

    extent(v) {
        let x0 = 1e30, x1 = -1e30;
        for (let bi = 0; bi < v.nb; bi++) for (let k = 0; k < 4; k++) {
            const x = this.parts[v.body[bi].c[k]].x;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
        }
        return [x0, x1];
    }

    spawnLogic() {
        for (let d = 0; d < 2; d++) {
            const dir = d === 0 ? 1 : -1, q = this.queue[d];
            while (this.nextSpawn[d] < q.length && q[this.nextSpawn[d]].time <= this.time) {
                const s = q[this.nextSpawn[d]], sx = this.lv.spawnX[d], T = VTYPES[s.type], tl = Sim.trailerLen(s.type);
                const n0 = dir > 0 ? sx - T.L * 0.5 - tl : sx - T.L * 0.5;
                const n1 = dir > 0 ? sx + T.L * 0.5 : sx + T.L * 0.5 + tl;
                let blocked = false;
                for (const o of this.veh) {
                    if (o.gone || o.dir !== dir) continue;
                    const [a, b] = this.extent(o);
                    if (b > n0 - 2.5 && a < n1 + 2.5) { blocked = true; break; }
                }
                if (blocked) break;
                this.spawnVehicle(s.type, dir, sx);
                this.nextSpawn[d]++;
            }
        }
    }

    fail(msg, x, y) {
        if (!this.lost && !this.won) { this.lost = true; this.failMsg = msg; this.events.push({ type: EV_FAIL, x, y, mag: 1 }); }
    }

    vehicleLogic(dt) {
        const L = this.lv;
        for (let i = 0; i < this.veh.length; i++) {
            const v = this.veh[i];
            if (v.gone) continue;
            const [x0, x1] = this.extent(v);
            const c = this.vehCenter(v);
            if (!v.arrived && !v.failed && (v.dir > 0 ? c.x > L.goalX[0] : c.x < L.goalX[1])) {
                v.arrived = true; this.arrived++;
                this.events.push({ type: EV_ARRIVE, x: c.x, y: c.y, mag: 1 });
            }
            if (v.dir > 0 ? x0 > L.goalX[0] + 22 : x1 < L.goalX[1] - 22) {
                v.gone = true;
                for (let k = v.p0; k < v.p1; k++) this.parts[k].active = false;
                continue;
            }
            let gap = 1e9;
            for (let j = 0; j < this.veh.length; j++) {
                const o = this.veh[j];
                if (j === i || o.gone || o.dir !== v.dir) continue;
                const [a, b] = this.extent(o);
                if (v.dir > 0) { if (a > x0 + 0.5) gap = Math.min(gap, a - x1); }
                else { if (b < x1 - 0.5) gap = Math.min(gap, x0 - b); }
            }
            const cruise = VTYPES[v.type].speed;
            v.target = gap < 2 ? 0 : (gap < 7 ? cruise * (gap - 2) / 5 : cruise);
            if (v.failed) v.target = 0;
            const f = this.bodyFrame(v, 0);
            if (!v.arrived && !v.failed && c.y < L.waterY + 0.2) {
                v.failed = true;
                this.fail("Un véhicule est tombé à l'eau !", c.x, c.y);
            }
            if (f.uy < -0.2) v.flipT += dt; else v.flipT = 0;
            if (!v.failed && !v.arrived && v.flipT > 2) {
                v.failed = true;
                this.fail("Un véhicule s'est renversé !", c.x, c.y);
            }
        }
    }

    boatLogic() {
        for (const b of this.boats) {
            if (b.passed || b.hit) continue;
            if (this.time < b.d.time) continue;
            if (this.time > b.d.time + BOAT_PASS) { b.passed = true; continue; }
            const shapes = boatShapes(b.d, this.lv.waterY);
            const nb = this.beams.length;
            for (let i = 0; i < nb; i++) {
                const bm = this.beams[i];
                if (!bm.alive) continue;
                const A = this.parts[bm.a], B = this.parts[bm.b];
                if (!shapes.some(s => segPoly(s, A.x, A.y, B.x, B.y))) continue;
                b.hit = true;
                if (!bm.broken) this.breakBeam(i);
                this.parts[this.beams[i].a].vy += 3;
            }
            if (b.hit) {
                this.events.push({ type: EV_BOAT_HIT, x: b.d.x, y: this.lv.waterY + 2, mag: 1 });
                this.fail('Le bateau a heurté le pont !', b.d.x, this.lv.waterY + 2);
            }
        }
    }

    waterLogic() {
        const wy = this.lv.waterY;
        let splashes = 0;
        for (const q of this.parts) {
            if (!q.active) continue;
            if (!q.wet && q.y < wy) {
                q.wet = true;
                const sp = -q.vy;
                if (sp > 2 && splashes < 6) {
                    splashes++;
                    const n = Math.min(14, Math.floor(sp * 2));
                    for (let k = 0; k < n; k++) {
                        const life = 0.5 + frand(this.rng) * 0.6;
                        this.fx.push({ x: q.x, y: wy, vx: (frand(this.rng) - 0.5) * 4, vy: 2 + frand(this.rng) * sp * 0.6, life, maxLife: life,
                                       size: 0.06 + frand(this.rng) * 0.1, color: 0xE3F2FD, kind: 1 });
                    }
                    if (q.kind !== PK_NODE || sp > 5) this.events.push({ type: EV_SPLASH, x: q.x, y: wy, mag: sp });
                }
            } else if (q.wet && q.y > wy + 0.3) q.wet = false;
        }
    }

    spinWheels() {
        for (const v of this.veh) {
            if (v.gone) continue;
            for (let bi = 0; bi < v.nb; bi++) {
                const B = v.body[bi], T = VTYPES[B.type], f = this.bodyFrame(v, bi);
                for (let k = 0; k < T.nw; k++) {
                    const p = this.parts[B.wheel[k]];
                    B.spin[k] += ((p.x - B.last[k].x) * f.ax + (p.y - B.last[k].y) * f.ay) / T.w[k].r;
                    B.last[k].x = p.x; B.last[k].y = p.y;
                }
            }
        }
    }

    updateFx(dt) {
        for (const f of this.fx) { f.vy += GRAV * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
        this.fx = this.fx.filter(f => f.life > 0);
    }
}

// ============================================================ niveaux
function leftBank(xe, top, water, face) {
    const fy = Math.max(top - face, water + 0.8);
    return poly([[-90, -45], [xe + 3.5, -45], [xe + 1.5, water - 1.5], [xe + 0.25, fy - 0.4], [xe, fy], [xe, top], [-90, top]]);
}
function rightBank(xe, top, water, face) {
    const fy = Math.max(top - face, water + 0.8);
    return poly([[xe - 3.5, -45], [190, -45], [190, top], [xe, top], [xe, fy], [xe - 0.25, fy - 0.4], [xe - 1.5, water - 1.5]]);
}
function pillar(cx, top, w, water) {
    return poly([[cx - w * 0.5 - 2, -45], [cx + w * 0.5 + 2, -45], [cx + w * 0.5 + 0.5, water - 1], [cx + w * 0.5, top], [cx - w * 0.5, top], [cx - w * 0.5 - 0.5, water - 1]]);
}
const mask = (arr) => arr.reduce((r, i) => r | (1 << i), 0);
const sp = (type, dir, time) => ({ type, dir, time });

function basic(name, hint, gap, topL, topR, water, theme) {
    const tL = topL + ROAD_HALF, tR = topR + ROAD_HALF;
    const face = Math.max(tL, tR) - water + 2;
    return {
        name, hint, theme, waterY: water, budget: 0, mats: 0,
        terrain: [leftBank(0, tL, water, Math.min(face, tL - water - 0.8)), rightBank(gap, tR, water, Math.min(face, tR - water - 0.8))],
        anchors: [v2(0, topL), v2(gap, topR)],
        pylons: [], spawns: [], boats: [],
        spawnX: [-16, gap + 16], goalX: [gap + 7, -7],
        vx0: -7, vx1: gap + 7, vy0: Math.min(water - 2, Math.min(topL, topR) - 7), vy1: Math.max(topL, topR) + 6,
    };
}

function makeLevels() {
    const out = [];
    let L;
    // 1
    L = basic('Premier pont', 'Relie les deux rives avec de la route, puis renforce-la avec des triangles en bois.', 10, 0, 0, -4, 0);
    L.anchors.push(v2(0, -2.5), v2(10, -2.5));
    L.mats = mask([M_ROAD, M_WOOD]); L.spawns = [sp(V_CAR, 1, 0)]; L.budget = 5500; out.push(L);
    // 2
    L = basic('Le ruisseau', "Pas d'appui sous la brèche : construis un treillis au-dessus de la route.", 14, 0, 0, -3.5, 0);
    L.mats = mask([M_ROAD, M_WOOD]); L.spawns = [sp(V_CAR, 1, 0), sp(V_MOTO, 1, 2), sp(V_CAR, 1, 4)]; L.budget = 7500; out.push(L);
    // 3
    L = basic('Poids lourd', "Un camion-benne de 10 tonnes ! L'acier et la route renforcée seront tes alliés.", 16, 0, 0, -5, 1);
    L.anchors.push(v2(0, -3), v2(16, -3));
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL]); L.spawns = [sp(V_TRUCK, 1, 0)]; L.budget = 26000; out.push(L);
    // 4
    L = basic('Le rocher', 'Appuie-toi sur le rocher au milieu de la rivière.', 28, 0, 0, -4, 0);
    L.terrain.push(pillar(14, -1.2, 3, L.waterY));
    L.anchors.push(v2(12.5, -1.2), v2(15.5, -1.2), v2(0, -3), v2(28, -3));
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL]); L.spawns = [sp(V_CAR, 1, 0), sp(V_BUS, 1, 2), sp(V_CAR, 1, 9)]; L.budget = 46000; out.push(L);
    // 5
    L = basic('Le précipice', 'Le gouffre est trop profond : suspends la route aux pylônes avec des câbles.', 24, 0, 0, -12, 2);
    L.anchors.push(v2(-1.5, 8), v2(25.5, 8));
    L.pylons = [{ x: -1.5, y0: 0, y1: 8 }, { x: 25.5, y0: 0, y1: 8 }];
    L.mats = mask([M_ROAD, M_WOOD, M_ROPE, M_CABLE]);
    L.spawns = [sp(V_CAR, 1, 0), sp(V_CAR, 1, 1.5), sp(V_VAN, 1, 3), sp(V_CAR, 1, 5)];
    L.vy0 = -14; L.vy1 = 11; L.budget = 13000; out.push(L);
    // 6
    L = basic('La côte', "La rive d'en face est plus haute : la route doit grimper sans casser.", 18, 0, 3.5, -4, 1);
    L.anchors.push(v2(0, -3), v2(18, 0.5));
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL]); L.spawns = [sp(V_VAN, 1, 0), sp(V_TRUCK, 1, 3)]; L.budget = 30000; out.push(L);
    // 7
    L = basic('Le pont-levis', 'Un bateau passe à 14 s : lève le pont avec les vérins [H], puis rabaisse-le pour les voitures suivantes.', 16, 0, 0, -3, 0);
    L.anchors.push(v2(0, -2.5), v2(16, -2.5));
    L.mats = mask([M_ROAD, M_WOOD, M_STEEL, M_HYD]);
    L.spawns = [sp(V_CAR, 1, 0), sp(V_VAN, -1, 1.5), sp(V_CAR, 1, 21), sp(V_CAR, -1, 22)];
    L.boats = [{ time: 14, x: 8, width: 6, mast: 9 }]; L.budget = 18500; out.push(L);
    // 8
    L = basic('Double sens', 'Des véhicules arrivent des deux côtés en même temps.', 20, 0, 0, -5, 3);
    L.anchors.push(v2(0, -3), v2(20, -3));
    L.mats = mask([M_ROAD, M_WOOD, M_STEEL, M_ROPE]);
    L.spawns = [sp(V_CAR, 1, 0), sp(V_VAN, 1, 2), sp(V_MOTO, 1, 4), sp(V_CAR, -1, 0), sp(V_CAR, -1, 2.5), sp(V_VAN, -1, 5)];
    L.budget = 17000; out.push(L);
    // 9
    L = {
        name: 'Le tremplin', hint: "Budget serré : impossible de tout relier. Construis une rampe et fais sauter les 4x4 jusqu'à la pente d'en face !",
        theme: 1, waterY: -5, budget: 6000, mats: mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_SPRING]),
        terrain: [leftBank(0, ROAD_HALF, -5, 4.3),
                  poly([[16.5, -45], [190, -45], [190, -4.5 + ROAD_HALF], [36, -4.5 + ROAD_HALF], [20, -0.5 + ROAD_HALF], [20, -4.2], [19.75, -4.6], [18.5, -6.5]])],
        anchors: [v2(0, 0), v2(0, -2), v2(20, -0.5)], pylons: [], boats: [],
        spawns: [sp(V_JEEP, 1, 0), sp(V_JEEP, 1, 4)], spawnX: [-24, 60], goalX: [38, -7],
        vx0: -8, vx1: 40, vy0: -8, vy1: 8,
    };
    out.push(L);
    // 10
    L = basic('Le convoi', 'Semi-remorque, bus et camion se suivent. Il faut du solide !', 30, 0, 0, -5, 2);
    L.terrain.push(pillar(15, -2, 4, L.waterY));
    L.anchors.push(v2(13, -2), v2(17, -2), v2(0, -3), v2(30, -3));
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE]);
    L.spawns = [sp(V_SEMI, 1, 0), sp(V_BUS, 1, 4), sp(V_TRUCK, 1, 8), sp(V_CAR, 1, 12)];
    L.spawnX[0] = -18; L.budget = 50000; out.push(L);
    // 11
    L = basic('Le grand canyon', "40 mètres de vide, de la circulation dans les deux sens. Le chef-d'œuvre final.", 40, 0, 0, -12, 3);
    L.terrain.push(pillar(20, -5, 2, L.waterY));
    L.anchors.push(v2(19, -5), v2(21, -5), v2(-1.5, 9), v2(41.5, 9));
    L.pylons = [{ x: -1.5, y0: 0, y1: 9 }, { x: 41.5, y0: 0, y1: 9 }];
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING]);
    L.spawns = [sp(V_CAR, 1, 0), sp(V_BUS, 1, 3), sp(V_CAR, 1, 10), sp(V_SEMI, 1, 14), sp(V_VAN, -1, 0), sp(V_MOTO, -1, 3), sp(V_TRUCK, -1, 6)];
    L.spawnX = [-18, 58]; L.vy0 = -14; L.vy1 = 12; L.budget = 48000; out.push(L);
    // 12
    L = basic('Bac à sable', 'Budget illimité, tous les matériaux, tous les véhicules. Amuse-toi !', 36, 0, 0, -6, 0);
    L.terrain.push(pillar(18, -2.5, 3, L.waterY));
    L.anchors.push(v2(17, -2.5), v2(19, -2.5), v2(0, -3), v2(36, -3), v2(-1.5, 8), v2(37.5, 8));
    L.pylons = [{ x: -1.5, y0: 0, y1: 8 }, { x: 37.5, y0: 0, y1: 8 }];
    L.mats = mask([M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING, M_HYD]);
    L.spawns = [sp(V_CAR, 1, 0), sp(V_MOTO, 1, 2), sp(V_VAN, 1, 4), sp(V_JEEP, 1, 6), sp(V_BUS, 1, 8), sp(V_TRUCK, 1, 12), sp(V_SEMI, 1, 16), sp(V_CAR, -1, 1), sp(V_VAN, -1, 5)];
    L.spawnX = [-18, 54]; L.vy0 = -10; L.vy1 = 11; L.budget = 999999; out.push(L);
    for (const lv of out) lv.hasHyd = ((lv.mats >> M_HYD) & 1) === 1;
    return out;
}

// ============================================ conceptions de référence
// (tests automatiques uniquement : vérifient que chaque niveau est faisable)
const ref = {
    errors: 0,
    B(D, L, a, b, m, ext) { const r = addBeam(D, L, a, b, m, ext || 0); if (r !== ADD_OK && r !== ADD_EXISTS) ref.errors++; },
    truss(D, L, a, b, n, h, deck, web, chord) {
        const sx = (b.x - a.x) / n, sy = (b.y - a.y) / n;
        for (let i = 0; i < n; i++) {
            const p0 = v2(a.x + sx * i, a.y + sy * i), p1 = v2(a.x + sx * (i + 1), a.y + sy * (i + 1));
            const q = v2((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5 + h);
            ref.B(D, L, p0, p1, deck);
            if (h !== 0) {
                ref.B(D, L, p0, q, web); ref.B(D, L, q, p1, web);
                if (i + 1 < n) ref.B(D, L, q, v2(q.x + sx, q.y + sy), chord);
            }
        }
    },
    build(idx, L) {
        const D = initialDesign(L), B = (a, b, m, e) => ref.B(D, L, a, b, m, e), T = (...args) => ref.truss(D, L, ...args);
        const y = 0;
        switch (idx) {
        case 0: T(v2(0, y), v2(10, y), 5, 1.5, M_ROAD, M_WOOD, M_WOOD); break;
        case 1: T(v2(0, y), v2(14, y), 7, 1.6, M_ROAD, M_WOOD, M_WOOD); break;
        case 2:
            T(v2(0, y), v2(16, y), 8, 1.6, M_ROAD, M_STEEL, M_STEEL);
            B(v2(0, -3), v2(2, y), M_STEEL); B(v2(16, -3), v2(14, y), M_STEEL);
            break;
        case 3:
            T(v2(0, y), v2(14, y), 7, 1.7, M_ROAD, M_STEEL, M_STEEL);
            T(v2(14, y), v2(28, y), 7, 1.7, M_ROAD, M_STEEL, M_STEEL);
            B(v2(13, 1.7), v2(15, 1.7), M_STEEL);
            B(v2(12.5, -1.2), v2(12, y), M_WOOD); B(v2(12.5, -1.2), v2(14, y), M_STEEL);
            B(v2(15.5, -1.2), v2(14, y), M_STEEL); B(v2(15.5, -1.2), v2(16, y), M_WOOD);
            B(v2(0, -3), v2(2, y), M_STEEL); B(v2(28, -3), v2(26, y), M_STEEL);
            break;
        case 4:
            for (let i = 0; i < 12; i++) B(v2(2 * i, y), v2(2 * (i + 1), y), M_ROAD);
            for (let i = 2; i <= 10; i += 2) {
                const p = v2(2 * i, y);
                if (i <= 6) B(v2(-1.5, 8), p, M_CABLE);
                if (i >= 6) B(v2(25.5, 8), p, M_CABLE);
            }
            break;
        case 5: {
            const a = v2(0, y), b = v2(18, 3.5);
            T(a, b, 10, 1.6, M_ROAD, M_STEEL, M_STEEL);
            const sx = (b.x - a.x) / 10, sy = (b.y - a.y) / 10;
            B(v2(0, -3), v2(a.x + sx, a.y + sy), M_STEEL);
            B(v2(18, 0.5), v2(b.x - sx, b.y - sy), M_STEEL);
            break;
        }
        case 6: {
            const xs = [0, 2, 4, 6, 7.5], xr = [16, 14, 12, 10, 8.5];
            for (let i = 0; i < 4; i++) { B(v2(xs[i], y), v2(xs[i + 1], y), M_ROAD); B(v2(xr[i], y), v2(xr[i + 1], y), M_ROAD); }
            for (let i = 0; i < 4; i++) {
                const q = v2((xs[i] + xs[i + 1]) * 0.5, 1.4), r = v2((xr[i] + xr[i + 1]) * 0.5, 1.4), w = i < 2 ? M_STEEL : M_WOOD;
                B(v2(xs[i], y), q, w); B(q, v2(xs[i + 1], y), w);
                B(v2(xr[i], y), r, w); B(r, v2(xr[i + 1], y), w);
                if (i < 3) { B(q, v2((xs[i + 1] + xs[i + 2]) * 0.5, 1.4), w); B(r, v2((xr[i + 1] + xr[i + 2]) * 0.5, 1.4), w); }
            }
            B(v2(0, -2.5), v2(2, y), M_HYD, 1.3); B(v2(16, -2.5), v2(14, y), M_HYD, 1.3);
            break;
        }
        case 7: T(v2(0, y), v2(20, y), 10, 1.7, M_ROAD, M_WOOD, M_STEEL); break;
        case 8: {
            const r0 = v2(0, y), r1 = v2(1.9, 0.4), r2 = v2(3.8, 1.0), r3 = v2(5.6, 1.8);
            const u0 = v2(0, -2), u1 = v2(1.2, -1.2), u2 = v2(3.0, -0.6), u3 = v2(4.7, 0.2);
            B(r0, r1, M_ROAD_HEAVY); B(r1, r2, M_ROAD_HEAVY); B(r2, r3, M_ROAD_HEAVY);
            B(u0, u1, M_STEEL); B(u1, r0, M_STEEL); B(u1, r1, M_WOOD); B(u1, u2, M_STEEL);
            B(u2, r1, M_WOOD); B(u2, r2, M_WOOD); B(u2, u3, M_WOOD);
            B(u3, r2, M_WOOD); B(u3, r3, M_WOOD);
            break;
        }
        case 9:
            T(v2(0, y), v2(14, y), 7, 1.7, M_ROAD, M_STEEL, M_STEEL);
            T(v2(16, y), v2(30, y), 7, 1.7, M_ROAD, M_STEEL, M_STEEL);
            B(v2(14, y), v2(16, y), M_ROAD); B(v2(13, 1.7), v2(17, 1.7), M_STEEL);
            B(v2(13, -2), v2(14, y), M_STEEL); B(v2(17, -2), v2(16, y), M_STEEL);
            B(v2(13, -2), v2(12, y), M_STEEL); B(v2(17, -2), v2(18, y), M_STEEL);
            B(v2(0, -3), v2(2, y), M_STEEL); B(v2(30, -3), v2(28, y), M_STEEL);
            break;
        case 10:
            for (let i = 0; i < 20; i++) B(v2(2 * i, y), v2(2 * (i + 1), y), M_ROAD_HEAVY);
            for (let i = 1; i <= 19; i++) {
                const p = v2(2 * i, y);
                if (i <= 8) B(v2(-1.5, 9), p, M_CABLE);
                if (i >= 12) B(v2(41.5, 9), p, M_CABLE);
            }
            B(v2(19, -5), v2(19, -2.5), M_STEEL); B(v2(21, -5), v2(21, -2.5), M_STEEL); B(v2(19, -2.5), v2(21, -2.5), M_STEEL);
            B(v2(19, -2.5), v2(18, y), M_STEEL); B(v2(19, -2.5), v2(20, y), M_STEEL);
            B(v2(21, -2.5), v2(20, y), M_STEEL); B(v2(21, -2.5), v2(22, y), M_STEEL);
            B(v2(19, -5), v2(21, -2.5), M_STEEL);
            break;
        default: return null;
        }
        return D;
    },
};

const TV = {
    GRAV, SUBSTEPS, FRAME_DT, SUB_DT, ROAD_HALF, JOINT_MASS, GRID, HYD_SPEED, BOAT_PASS, HYD_DEFAULT_EXT,
    M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING, M_HYD, M_COUNT, MATS,
    V_CAR, V_MOTO, V_VAN, V_JEEP, V_BUS, V_TRUCK, V_SEMI, V_TRAILER, V_COUNT, VTYPES,
    PK_NODE, PK_WHEEL, PK_BODY, PK_HITCH,
    EV_BREAK, EV_SPLASH, EV_ARRIVE, EV_FAIL, EV_WIN, EV_BOAT_HIT, EV_HYD,
    ADD_OK, ADD_TOO_SHORT, ADD_TOO_LONG, ADD_IN_TERRAIN, ADD_EXISTS,
    clamp, lerp, v2, vlen, frand, poly, finalizePoly, pointInPoly, insideTerrain, terrainTopY, boatShapes,
    Design, initialDesign, canAddBeam, addBeam, Sim, makeLevels, ref,
};
if (typeof module !== 'undefined' && module.exports) module.exports = TV;
else global.TV = TV;
})(typeof window !== 'undefined' ? window : globalThis);
