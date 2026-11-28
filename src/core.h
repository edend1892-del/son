// =====================================================================
//  TRAVÉE — Bâtisseurs de ponts
//  core.h : moteur portable (maths, matériaux, véhicules, niveaux,
//           conception du pont et simulation physique XPBD).
//  Aucune dépendance à Windows : compilable aussi sous Linux (tests).
// =====================================================================
#pragma once
#include <vector>
#include <string>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <algorithm>

namespace tv {

// ---------------------------------------------------------------- maths
struct V2 {
    float x = 0, y = 0;
    V2() {}
    V2(float X, float Y) : x(X), y(Y) {}
    V2 operator+(V2 o) const { return V2(x + o.x, y + o.y); }
    V2 operator-(V2 o) const { return V2(x - o.x, y - o.y); }
    V2 operator*(float s) const { return V2(x * s, y * s); }
    V2 operator/(float s) const { return V2(x / s, y / s); }
    V2 operator-() const { return V2(-x, -y); }
    V2& operator+=(V2 o) { x += o.x; y += o.y; return *this; }
    V2& operator-=(V2 o) { x -= o.x; y -= o.y; return *this; }
    V2& operator*=(float s) { x *= s; y *= s; return *this; }
};
inline float dot(V2 a, V2 b) { return a.x * b.x + a.y * b.y; }
inline float cross(V2 a, V2 b) { return a.x * b.y - a.y * b.x; }
inline float len2(V2 a) { return a.x * a.x + a.y * a.y; }
inline float len(V2 a) { return std::sqrt(len2(a)); }
inline V2 perp(V2 a) { return V2(-a.y, a.x); }
inline V2 normz(V2 a) { float l = len(a); return l > 1e-9f ? a / l : V2(1, 0); }
inline float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
inline float frand(uint32_t& s) { s = s * 1664525u + 1013904223u; return (s >> 8) * (1.0f / 16777216.0f); }

// ------------------------------------------------------- constantes
constexpr float GRAV       = -9.81f;
constexpr int   SUBSTEPS   = 32;               // sous-pas par image
constexpr float FRAME_DT   = 1.0f / 60.0f;
constexpr float SUB_DT     = FRAME_DT / SUBSTEPS;
constexpr float ROAD_HALF  = 0.12f;            // demi-épaisseur de la chaussée
constexpr float JOINT_MASS = 10.0f;            // masse d'une articulation (kg)
constexpr float GRID       = 0.5f;             // pas de la grille (m)
constexpr float HYD_SPEED  = 0.45f;            // vitesse des vérins (phase / s)
constexpr float BOAT_PASS  = 2.5f;             // durée du passage d'un bateau (s)

// -------------------------------------------------------- matériaux
enum Mat { M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING, M_HYD, M_COUNT };

struct Material {
    const wchar_t* name;
    const wchar_t* desc;
    float cost;       // $ par mètre
    float maxLen;     // longueur maximale (m)
    float density;    // kg par mètre
    float EA;         // rigidité axiale (N)
    float strength;   // effort de rupture (N)
    bool  road;       // les véhicules roulent dessus
    bool  tensionOnly;// ne travaille qu'en traction (corde, câble)
    bool  hydraulic;  // vérin pilotable
    float damp;       // amortissement axial (fraction par sous-pas)
};

inline const Material& mat(int i) {
    static const Material M[M_COUNT] = {
        { L"Route",           L"Chaussée : les véhicules roulent dessus.",      200, 2.0f,  80, 1.40e7f, 110e3f, true,  false, false, 0.020f },
        { L"Route renforcée", L"Chaussée lourde pour camions et bus.",          360, 2.0f, 120, 3.00e7f, 240e3f, true,  false, false, 0.020f },
        { L"Bois",            L"Léger et bon marché, résistance moyenne.",      100, 2.0f,  30, 8.75e6f,  70e3f, false, false, false, 0.020f },
        { L"Acier",           L"Très solide et plus long, mais coûteux.",       400, 4.0f,  60, 3.25e7f, 260e3f, false, false, false, 0.020f },
        { L"Corde",           L"Traction seulement, souple et bon marché.",      30, 10.f,   4, 1.50e6f,  45e3f, false, true,  false, 0.020f },
        { L"Câble",           L"Traction seulement, très résistant.",            90, 20.f,  12, 3.50e7f, 280e3f, false, true,  false, 0.020f },
        { L"Ressort",         L"Élastique : absorbe les chocs.",                220, 2.0f,  25, 3.00e5f, 150e3f, false, false, false, 0.010f },
        { L"Vérin",           L"Change de longueur avec [H]. Réglable (+/-).",  600, 4.0f,  80, 3.75e7f, 300e3f, false, false, true,  0.020f },
    };
    return M[i];
}
constexpr float HYD_DEFAULT_EXT = 1.5f;

// --------------------------------------------------------- véhicules
enum VehKind { V_CAR, V_MOTO, V_VAN, V_JEEP, V_BUS, V_TRUCK, V_SEMI, V_TRAILER, V_COUNT };

struct WheelDef { float x, y, r; };
struct VehType {
    const wchar_t* name;
    float L, H;          // boîte physique du châssis (m) ; origine = arrière-bas
    float mass;          // masse de la caisse (kg)
    float wheelMass;     // masse d'une roue (kg)
    int   nw;            // nombre de roues
    WheelDef w[3];
    float speed;         // vitesse de croisière (m/s)
    float drive;         // force motrice totale (N)
    float susp;          // flèche statique de suspension (m)
    int   trailer;       // type de remorque, -1 sinon
    V2    hitch;         // point d'attelage (repère local)
};

inline const VehType& vtype(int i) {
    static const VehType T[V_COUNT] = {
        { L"Citadine",      3.6f, 1.0f,  1000,  60, 2, {{0.75f,-0.08f,0.34f},{2.85f,-0.08f,0.34f},{0,0,0}}, 8.0f,  7000, 0.05f, -1, V2() },
        { L"Moto",          2.0f, 0.8f,   230,  25, 2, {{0.30f,-0.05f,0.32f},{1.70f,-0.05f,0.32f},{0,0,0}}, 10.f,  2600, 0.04f, -1, V2() },
        { L"Fourgon",       4.8f, 1.9f,  2000,  80, 2, {{0.95f,-0.08f,0.38f},{3.90f,-0.08f,0.38f},{0,0,0}}, 7.0f, 13000, 0.05f, -1, V2() },
        { L"4x4",           4.0f, 1.3f,  1700, 120, 2, {{0.80f,-0.30f,0.55f},{3.20f,-0.30f,0.55f},{0,0,0}}, 13.f, 19000, 0.08f, -1, V2() },
        { L"Bus",           9.0f, 2.6f,  7000, 150, 2, {{1.70f,-0.08f,0.50f},{7.30f,-0.08f,0.50f},{0,0,0}}, 6.0f, 38000, 0.05f, -1, V2() },
        { L"Camion-benne",  7.0f, 2.4f, 10000, 200, 3, {{1.10f,-0.08f,0.55f},{2.30f,-0.08f,0.55f},{5.90f,-0.08f,0.55f}}, 5.5f, 60000, 0.05f, -1, V2() },
        { L"Semi-remorque", 4.6f, 2.4f,  4000, 180, 2, {{1.00f,-0.08f,0.52f},{3.80f,-0.08f,0.52f},{0,0,0}}, 5.5f, 60000, 0.05f, V_TRAILER, V2(1.2f, 0.9f) },
        { L"Remorque",      9.0f, 2.2f,  7000, 180, 2, {{0.90f,-0.68f,0.52f},{2.10f,-0.68f,0.52f},{0,0,0}}, 0.0f,     0, 0.05f, -1, V2(8.4f, 0.3f) },
    };
    return T[i];
}

// ----------------------------------------------------------- terrain
struct Poly {
    std::vector<V2> pts;
    float minx = 0, maxx = 0, miny = 0, maxy = 0;
};

inline void finalizePoly(Poly& P) {
    float a = 0;
    size_t n = P.pts.size();
    for (size_t i = 0; i < n; i++) a += cross(P.pts[i], P.pts[(i + 1) % n]);
    if (a < 0) std::reverse(P.pts.begin(), P.pts.end());   // sens trigonométrique
    P.minx = P.miny = 1e30f; P.maxx = P.maxy = -1e30f;
    for (auto& p : P.pts) {
        P.minx = std::min(P.minx, p.x); P.maxx = std::max(P.maxx, p.x);
        P.miny = std::min(P.miny, p.y); P.maxy = std::max(P.maxy, p.y);
    }
}

inline bool pointInPoly(const Poly& P, V2 q) {
    if (q.x < P.minx || q.x > P.maxx || q.y < P.miny || q.y > P.maxy) return false;
    bool in = false;
    size_t n = P.pts.size();
    for (size_t i = 0, j = n - 1; i < n; j = i++) {
        V2 a = P.pts[i], b = P.pts[j];
        if ((a.y > q.y) != (b.y > q.y)) {
            float xi = a.x + (q.y - a.y) * (b.x - a.x) / (b.y - a.y);
            if (q.x < xi) in = !in;
        }
    }
    return in;
}

// distance au bord, point le plus proche et normale sortante de l'arête
inline float closestOnPoly(const Poly& P, V2 q, V2& cp, V2& en) {
    float best = 1e30f;
    size_t n = P.pts.size();
    for (size_t i = 0; i < n; i++) {
        V2 a = P.pts[i], b = P.pts[(i + 1) % n], e = b - a;
        float l2 = len2(e);
        float t = l2 > 1e-12f ? clampf(dot(q - a, e) / l2, 0, 1) : 0;
        V2 c = a + e * t;
        float d = len2(q - c);
        if (d < best) { best = d; cp = c; en = normz(V2(e.y, -e.x)); }
    }
    return std::sqrt(best);
}

// cercle contre polygone : renvoie la normale et la contrainte C (<0 si pénétration)
inline bool circlePoly(const Poly& P, V2 q, float r, V2& n, float& C) {
    if (q.x < P.minx - r || q.x > P.maxx + r || q.y < P.miny - r || q.y > P.maxy + r) return false;
    V2 cp, en;
    float d = closestOnPoly(P, q, cp, en);
    if (pointInPoly(P, q)) {
        n = d > 1e-5f ? (cp - q) / d : en;
        C = -(d + r);
        return true;
    }
    if (d >= r) return false;
    n = d > 1e-5f ? (q - cp) / d : en;
    C = d - r;
    return true;
}

inline bool segSegIntersect(V2 a, V2 b, V2 c, V2 d) {
    V2 r = b - a, s = d - c;
    float den = cross(r, s);
    if (std::fabs(den) < 1e-9f) return false;
    float t = cross(c - a, s) / den, u = cross(c - a, r) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

inline bool segPoly(const Poly& P, V2 a, V2 b) {
    if (std::max(a.x, b.x) < P.minx || std::min(a.x, b.x) > P.maxx ||
        std::max(a.y, b.y) < P.miny || std::min(a.y, b.y) > P.maxy) return false;
    if (pointInPoly(P, a) || pointInPoly(P, b)) return true;
    size_t n = P.pts.size();
    for (size_t i = 0; i < n; i++)
        if (segSegIntersect(a, b, P.pts[i], P.pts[(i + 1) % n])) return true;
    return false;
}

// ------------------------------------------------------------ niveaux
struct Pylon    { float x, y0, y1; };          // décor : pylône sous un ancrage haut
struct SpawnDef { int type; int dir; float time; };
struct BoatDef  { float time; float x; float width; float mast; };

struct Level {
    std::wstring name, hint;
    int budget = 0;
    uint32_t mats = 0;                // masque des matériaux autorisés
    std::vector<Poly>  terrain;
    std::vector<V2>    anchors;
    std::vector<Pylon> pylons;
    float waterY = -5;
    float spawnX[2] = { -14, 30 };    // [0] véhicules allant à droite, [1] à gauche
    float goalX[2]  = {  20, -6 };
    std::vector<SpawnDef> spawns;
    std::vector<BoatDef>  boats;
    float vx0 = -10, vx1 = 20, vy0 = -8, vy1 = 6;   // cadrage initial
    int theme = 0;
    bool hasHyd() const { return (mats >> M_HYD) & 1; }
};

inline bool insideTerrain(const Level& L, V2 p) {
    for (auto& P : L.terrain) {
        if (!pointInPoly(P, p)) continue;
        V2 cp, en;
        if (closestOnPoly(P, p, cp, en) > 0.05f) return true;
    }
    return false;
}

inline float terrainTopY(const Level& L, float x) {
    float best = -1e9f;
    for (auto& P : L.terrain) {
        size_t n = P.pts.size();
        for (size_t i = 0; i < n; i++) {
            V2 a = P.pts[i], b = P.pts[(i + 1) % n];
            if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
                float t = (x - a.x) / (b.x - a.x);
                best = std::max(best, a.y + (b.y - a.y) * t);
            }
        }
    }
    return best;
}

// silhouettes du bateau (quadrilatères convexes) — utilisées pour collision et dessin
inline std::vector<Poly> boatShapes(const BoatDef& b, float waterY) {
    std::vector<Poly> out;
    auto quad = [&](V2 a, V2 c, V2 d, V2 e) { Poly p; p.pts = { a, c, d, e }; finalizePoly(p); out.push_back(p); };
    float x = b.x, hw = b.width * 0.5f, w = waterY;
    quad(V2(x - hw, w + 1.0f), V2(x - hw + 0.7f, w - 0.7f), V2(x + hw - 0.4f, w - 0.7f), V2(x + hw + 0.3f, w + 1.2f));   // coque
    quad(V2(x - hw * 0.45f, w + 1.0f), V2(x + hw * 0.45f, w + 1.0f), V2(x + hw * 0.35f, w + 3.8f), V2(x - hw * 0.45f, w + 3.8f)); // cabine
    quad(V2(x + 0.05f, w + 3.8f), V2(x + 0.35f, w + 3.8f), V2(x + 0.35f, w + b.mast), V2(x + 0.05f, w + b.mast));       // mât
    return out;
}

// ------------------------------------------------------- conception
struct DNode { V2 p; bool anchor = false; };
struct DBeam { int a, b, mat; float ext = 1.0f; };

struct Design {
    std::vector<DNode> nodes;
    std::vector<DBeam> beams;

    float beamLen(const DBeam& b) const { return len(nodes[b.b].p - nodes[b.a].p); }
    float cost() const {
        float c = 0;
        for (auto& b : beams) c += mat(b.mat).cost * beamLen(b);
        return c;
    }
    int nodeAt(V2 p, float r) const {
        int best = -1; float bd = r;
        for (size_t i = 0; i < nodes.size(); i++) {
            float d = len(nodes[i].p - p);
            if (d <= bd) { bd = d; best = (int)i; }
        }
        return best;
    }
    int beamBetween(int a, int b) const {
        for (size_t i = 0; i < beams.size(); i++)
            if ((beams[i].a == a && beams[i].b == b) || (beams[i].a == b && beams[i].b == a)) return (int)i;
        return -1;
    }
    int degree(int n) const {
        int d = 0;
        for (auto& b : beams) if (b.a == n || b.b == n) d++;
        return d;
    }
    // supprime les articulations orphelines (hors ancrages)
    void prune() {
        for (int i = (int)nodes.size() - 1; i >= 0; i--)
            if (!nodes[i].anchor && degree(i) == 0) eraseNode(i);
    }
    void eraseNode(int i) {
        for (int k = (int)beams.size() - 1; k >= 0; k--)
            if (beams[k].a == i || beams[k].b == i) beams.erase(beams.begin() + k);
        nodes.erase(nodes.begin() + i);
        for (auto& b : beams) { if (b.a > i) b.a--; if (b.b > i) b.b--; }
    }
    void removeBeam(int i) { beams.erase(beams.begin() + i); prune(); }
    void removeNode(int i) { if (nodes[i].anchor) return; eraseNode(i); prune(); }
};

inline Design initialDesign(const Level& L) {
    Design D;
    for (auto& a : L.anchors) { DNode n; n.p = a; n.anchor = true; D.nodes.push_back(n); }
    return D;
}

enum AddResult { ADD_OK, ADD_TOO_SHORT, ADD_TOO_LONG, ADD_IN_TERRAIN, ADD_EXISTS };

inline int canAddBeam(const Design& D, const Level& L, V2 a, V2 b, int m) {
    float l = len(b - a);
    if (l < 0.3f) return ADD_TOO_SHORT;
    if (l > mat(m).maxLen + 1e-3f) return ADD_TOO_LONG;
    int ia = D.nodeAt(a, 0.01f), ib = D.nodeAt(b, 0.01f);
    if (ia < 0 && insideTerrain(L, a)) return ADD_IN_TERRAIN;
    if (ib < 0 && insideTerrain(L, b)) return ADD_IN_TERRAIN;
    if (ia >= 0 && ib >= 0) {
        int ex = D.beamBetween(ia, ib);
        if (ex >= 0 && D.beams[ex].mat == m) return ADD_EXISTS;
    }
    return ADD_OK;
}

inline int addBeam(Design& D, const Level& L, V2 a, V2 b, int m, float ext = 0) {
    int r = canAddBeam(D, L, a, b, m);
    if (r != ADD_OK) return r;
    int ia = D.nodeAt(a, 0.01f), ib = D.nodeAt(b, 0.01f);
    if (ia < 0) { DNode n; n.p = a; D.nodes.push_back(n); ia = (int)D.nodes.size() - 1; }
    if (ib < 0) { DNode n; n.p = b; D.nodes.push_back(n); ib = (int)D.nodes.size() - 1; }
    float e = mat(m).hydraulic ? (ext > 0 ? ext : HYD_DEFAULT_EXT) : 1.0f;
    int ex = D.beamBetween(ia, ib);
    if (ex >= 0) { D.beams[ex].mat = m; D.beams[ex].ext = e; return ADD_OK; }
    DBeam nb; nb.a = ia; nb.b = ib; nb.mat = m; nb.ext = e;
    D.beams.push_back(nb);
    return ADD_OK;
}

// ======================================================== simulation
enum PartKind { PK_NODE, PK_WHEEL, PK_BODY, PK_HITCH };
enum ContactMode { CM_FREE, CM_FRICTION, CM_DRIVE };
enum EventType { TVE_BREAK, TVE_SPLASH, TVE_ARRIVE, TVE_FAIL, TVE_WIN, TVE_BOAT_HIT, TVE_HYD };

struct Part {
    V2 x, p, v;
    float w = 0;        // masse inverse
    float r = 0;
    uint8_t kind = PK_NODE;
    bool active = true;
    bool wet = false;
};

struct SBeam {
    int a, b, mat;
    float rest0, rest, ext;
    float acc = 0, force = 0, stress = 0, mass = 0;
    bool alive = true, broken = false;
};

struct DCon { int a, b; float rest, comp, damp; };
// suspension : roue w attachée au bas de caisse (a = arrière, b = avant) en s (0..1),
// rigide dans l'axe du véhicule, ressort amorti selon la verticale de la caisse
struct SCon { int w, a, b, dir; float s, wy, comp, damp, travel; };

struct Body {
    int type = 0;
    int c[4] = { 0, 0, 0, 0 };    // arrière-bas, avant-bas, avant-haut, arrière-haut
    int wheel[3] = { 0, 0, 0 };
    float spin[3] = { 0, 0, 0 };
    V2 lastW[3];
};

struct Vehicle {
    int type = 0, dir = 1;
    uint32_t color = 0xFFE53935;
    Body body[2];
    int nb = 1;
    int hitch = -1;
    int p0 = 0, p1 = 0;           // plage des particules
    float target = 0;
    bool arrived = false, gone = false, failed = false;
    float flipT = 0;
};

struct SBoat { BoatDef d; bool hit = false, passed = false; };

struct Fx { V2 x, v; float life, maxLife, size; uint32_t color; uint8_t kind; };
struct Event { int type; V2 pos; float mag; };

class Sim {
public:
    const Level* lv = nullptr;
    std::vector<Part>    parts;
    std::vector<SBeam>   beams;
    std::vector<DCon>    cons;
    std::vector<SCon>    susp;
    std::vector<Vehicle> veh;
    std::vector<SBoat>   boats;
    std::vector<Fx>      fx;
    std::vector<Event>   events;
    int   nodeCount = 0;
    float time = 0, hydPhase = 0, hydTarget = 0, subAcc = 0;
    int   arrived = 0, total = 0, breaks = 0;
    bool  won = false, lost = false;
    std::wstring failMsg;
    float maxStress = 0;
    uint32_t rng = 0x9E3779B9u;

    std::vector<SpawnDef> queue[2];
    size_t nextSpawn[2] = { 0, 0 };

    // ------------------------------------------------------------ init
    void init(const Level& L, const Design& D) {
        lv = &L;
        parts.clear(); beams.clear(); cons.clear(); susp.clear(); veh.clear(); boats.clear(); fx.clear(); events.clear();
        time = hydPhase = hydTarget = subAcc = 0;
        arrived = breaks = 0; won = lost = false; failMsg.clear(); maxStress = 0;
        std::vector<float> m(D.nodes.size(), JOINT_MASS);
        for (auto& b : D.beams) {
            float bm = mat(b.mat).density * D.beamLen(b);
            m[b.a] += bm * 0.5f; m[b.b] += bm * 0.5f;
        }
        for (size_t i = 0; i < D.nodes.size(); i++) {
            Part q; q.x = q.p = D.nodes[i].p; q.kind = PK_NODE; q.r = 0.06f;
            q.w = D.nodes[i].anchor ? 0.f : 1.f / m[i];
            parts.push_back(q);
        }
        nodeCount = (int)parts.size();
        for (auto& b : D.beams) {
            SBeam s; s.a = b.a; s.b = b.b; s.mat = b.mat;
            s.rest0 = s.rest = D.beamLen(b); s.ext = b.ext;
            s.mass = mat(b.mat).density * s.rest0;
            beams.push_back(s);
        }
        queue[0].clear(); queue[1].clear();
        for (auto& s : L.spawns) queue[s.dir > 0 ? 0 : 1].push_back(s);
        for (int d = 0; d < 2; d++)
            std::stable_sort(queue[d].begin(), queue[d].end(), [](const SpawnDef& a, const SpawnDef& b) { return a.time < b.time; });
        nextSpawn[0] = nextSpawn[1] = 0;
        total = (int)L.spawns.size();
        for (auto& b : L.boats) { SBoat sb; sb.d = b; boats.push_back(sb); }
    }

    // ------------------------------------------------------- une image
    void frame(float scale) {
        subAcc += SUBSTEPS * scale;
        int n = (int)subAcc;
        subAcc -= n;
        float dt = n * SUB_DT;
        if (n > 0) {
            for (auto& b : beams) b.acc = 0;
            for (int i = 0; i < n; i++) substep();
            time += dt;
            size_t nb = beams.size();
            for (size_t i = 0; i < nb; i++) {
                SBeam& b = beams[i];
                if (!b.alive) continue;
                b.force = b.acc / n;
                float s = std::fabs(b.force) / mat(b.mat).strength;
                b.stress = b.stress * 0.6f + s * 0.4f;
                if (!b.broken) {
                    maxStress = std::max(maxStress, b.stress);
                    if (b.stress > 1.0f) breakBeam((int)i);
                }
            }
            spawnLogic();
            vehicleLogic(dt);
            boatLogic();
            waterLogic();
            spinWheels();
        }
        updateFx(FRAME_DT * scale);
        if (!won && !lost && arrived >= total) {
            bool boatsOk = true;
            for (auto& b : boats) if (!b.passed) boatsOk = false;
            if (boatsOk) { won = true; events.push_back({ TVE_WIN, V2(), 1 }); }
        }
    }

    void toggleHydraulics() {
        hydTarget = hydTarget > 0.5f ? 0.f : 1.f;
        events.push_back({ TVE_HYD, V2(), hydTarget });
    }

    // repère d'une caisse (origine arrière-bas, axe avant, axe haut)
    void bodyFrame(const Vehicle& v, int bi, V2& o, V2& ax, V2& ay) const {
        const Body& B = v.body[bi];
        o = parts[B.c[0]].x;
        ax = normz(parts[B.c[1]].x - o);
        ay = v.dir > 0 ? perp(ax) : -perp(ax);
    }
    V2 vehCenter(const Vehicle& v) const {
        const Body& B = v.body[0];
        return (parts[B.c[0]].x + parts[B.c[1]].x + parts[B.c[2]].x + parts[B.c[3]].x) * 0.25f;
    }

private:
    int addPart(V2 x, float m, float r, int kind) {
        Part q; q.x = q.p = x; q.w = 1.f / m; q.r = r; q.kind = (uint8_t)kind;
        parts.push_back(q);
        return (int)parts.size() - 1;
    }
    void addCon(int a, int b, float comp, float damp) {
        DCon c; c.a = a; c.b = b; c.rest = len(parts[b].x - parts[a].x); c.comp = comp; c.damp = damp;
        cons.push_back(c);
    }

    // ------------------------------------------------------ sous-pas
    void substep() {
        const float h = SUB_DT, h2 = h * h;
        if (hydPhase != hydTarget) {
            float s = h * HYD_SPEED;
            hydPhase = hydTarget > hydPhase ? std::min(hydTarget, hydPhase + s) : std::max(hydTarget, hydPhase - s);
        }
        float e = hydPhase * hydPhase * (3.f - 2.f * hydPhase);    // démarrage et arrêt en douceur
        for (auto& b : beams)
            if (b.alive && !b.broken && mat(b.mat).hydraulic) b.rest = b.rest0 * (1.f + (b.ext - 1.f) * e);

        const float wy = lv->waterY;
        for (auto& q : parts) {
            if (!q.active || q.w == 0) continue;
            float g = GRAV;
            if (q.x.y < wy) {                       // poussée + traînée dans l'eau
                g += (q.kind == PK_NODE ? 7.0f : 5.0f);
                q.v *= (1.f - 2.5f * h);
            }
            q.v.y += g * h;
            q.p = q.x;
            q.x += q.v * h;
            if (q.x.y < wy - 40) { q.active = false; }
        }
        // poutres du pont
        for (auto& b : beams) {
            if (!b.alive) continue;
            Part& A = parts[b.a]; Part& B = parts[b.b];
            float wsum = A.w + B.w;
            if (wsum == 0) continue;
            V2 d = B.x - A.x;
            float L = len(d);
            if (L < 1e-6f) continue;
            V2 n = d / L;
            float C = L - b.rest;
            const Material& M = mat(b.mat);
            if (M.tensionOnly && C < 0) continue;
            float alpha = (b.rest / M.EA) / h2;
            float dl = -C / (wsum + alpha);
            A.x -= n * (A.w * dl);
            B.x += n * (B.w * dl);
            b.acc += -dl / h2;
        }
        // contraintes des véhicules
        for (auto& c : cons) {
            Part& A = parts[c.a]; Part& B = parts[c.b];
            if (!A.active || !B.active) continue;
            V2 d = B.x - A.x;
            float L = len(d);
            if (L < 1e-6f) continue;
            V2 n = d / L;
            float C = L - c.rest;
            float dl = -C / (A.w + B.w + c.comp / h2);
            A.x -= n * (A.w * dl);
            B.x += n * (B.w * dl);
        }
        for (auto& c : susp) solveSusp(c, h2);
        // contacts
        for (auto& v : veh) {
            if (v.gone) continue;
            for (int bi = 0; bi < v.nb; bi++) {
                Body& B = v.body[bi];
                const VehType& T = vtype(B.type);
                bool driven = T.drive > 0;
                float maxImp = driven ? T.drive / T.nw * h2 : 0;
                for (int k = 0; k < T.nw; k++)
                    collide(B.wheel[k], T.w[k].r, driven ? CM_DRIVE : CM_FREE, v.target, maxImp, 0.9f, v.dir);
                for (int k = 0; k < 4; k++)
                    collide(B.c[k], 0.1f, CM_FRICTION, 0, 0, 0.5f, v.dir);
            }
            if (v.hitch >= 0) collide(v.hitch, 0.1f, CM_FRICTION, 0, 0, 0.5f, v.dir);
        }
        for (int i = 0; i < nodeCount; i++) terrainOnly(i);
        for (int i = nodeCount; i < (int)parts.size(); i++) if (parts[i].kind == PK_NODE) terrainOnly(i);

        // vitesses
        for (auto& q : parts) if (q.active && q.w > 0) q.v = (q.x - q.p) / h;
        // amortissement axial
        for (auto& b : beams) {
            if (!b.alive) continue;
            Part& A = parts[b.a]; Part& B = parts[b.b];
            float wsum = A.w + B.w;
            if (wsum == 0) continue;
            V2 n = normz(B.x - A.x);
            float vr = dot(B.v - A.v, n);
            if (mat(b.mat).tensionOnly && len(B.x - A.x) < b.rest) continue;
            float j = -vr * mat(b.mat).damp / wsum;
            A.v -= n * (A.w * j);
            B.v += n * (B.w * j);
        }
        for (auto& c : susp) {
            Part& W = parts[c.w]; Part& A = parts[c.a]; Part& B = parts[c.b];
            if (!W.active) continue;
            V2 ax = normz(B.x - A.x), ay = c.dir > 0 ? perp(ax) : -perp(ax);
            float wA = A.w * (1 - c.s), wB = B.w * c.s;
            float wsum = W.w + wA * (1 - c.s) + wB * c.s;
            V2 vT = A.v * (1 - c.s) + B.v * c.s;
            float j = -dot(W.v - vT, ay) * c.damp / wsum;
            W.v += ay * (W.w * j); A.v -= ay * (wA * j); B.v -= ay * (wB * j);
        }
        for (auto& c : cons) {
            if (c.damp <= 0) continue;
            Part& A = parts[c.a]; Part& B = parts[c.b];
            if (!A.active || !B.active) continue;
            V2 n = normz(B.x - A.x);
            float vr = dot(B.v - A.v, n);
            float j = -vr * c.damp / (A.w + B.w);
            A.v -= n * (A.w * j);
            B.v += n * (B.w * j);
        }
    }

    void solveSusp(const SCon& c, float h2) {
        Part& W = parts[c.w]; Part& A = parts[c.a]; Part& B = parts[c.b];
        if (!W.active) return;
        float wA = A.w * (1 - c.s), wB = B.w * c.s;
        float wsum = W.w + wA * (1 - c.s) + wB * c.s;
        for (int pass = 0; pass < 2; pass++) {
            V2 ax = normz(B.x - A.x), ay = c.dir > 0 ? perp(ax) : -perp(ax);
            V2 T = A.x * (1 - c.s) + B.x * c.s + ay * c.wy;
            V2 e = W.x - T;
            V2 d = pass == 0 ? ax : ay;
            float C = dot(e, d);
            float dl;
            if (pass == 0) dl = -C / wsum;
            else {
                dl = -C / (wsum + c.comp / h2);
                float after = C + dl * wsum;               // butée de suspension
                if (after > c.travel) dl = (c.travel - C) / wsum;
                else if (after < -c.travel) dl = (-c.travel - C) / wsum;
            }
            W.x += d * (W.w * dl); A.x -= d * (wA * dl); B.x -= d * (wB * dl);
        }
    }

    void terrainOnly(int i) {
        Part& q = parts[i];
        if (!q.active || q.w == 0) return;
        for (auto& P : lv->terrain) {
            V2 n; float C;
            if (circlePoly(P, parts[i].x, q.r, n, C)) applyContact(i, -1, -1, 0, n, C, CM_FRICTION, 0, 0, 0.6f, 1);
        }
    }

    void applyContact(int pi, int ia, int ib, float u, V2 n, float C, int mode, float tgt, float maxImp, float mu, int dir) {
        Part& P = parts[pi];
        Part* A = ia >= 0 ? &parts[ia] : nullptr;
        Part* B = ib >= 0 ? &parts[ib] : nullptr;
        float wa = A ? A->w * (1 - u) : 0, wb = B ? B->w * u : 0;
        float wsum = P.w + wa * (1 - u) + wb * u;
        if (wsum <= 0) return;
        float dl = -C / wsum;
        P.x += n * (P.w * dl);
        if (A) A->x -= n * (wa * dl);
        if (B) B->x -= n * (wb * dl);
        if (mode == CM_FREE) return;
        if (mode == CM_DRIVE && n.y < 0.25f) mode = CM_FRICTION;   // pas de traction contre un mur
        V2 t(n.y, -n.x);
        if (t.x * dir < 0) t = -t;
        V2 dP = P.x - P.p;
        V2 dS = (A ? (A->x - A->p) * (1 - u) : V2()) + (B ? (B->x - B->p) * u : V2());
        float vt = dot(dP - dS, t);
        float want = (mode == CM_DRIVE ? tgt * SUB_DT : 0.f) - vt;
        float dlt = want / wsum;
        float lim = mu * dl;
        if (mode == CM_DRIVE && tgt > 0.01f) lim = std::min(lim, maxImp);
        dlt = clampf(dlt, -lim, lim);
        P.x += t * (P.w * dlt);
        if (A) A->x -= t * (wa * dlt);
        if (B) B->x -= t * (wb * dlt);
    }

    void collide(int pi, float r, int mode, float tgt, float maxImp, float mu, int dir) {
        if (!parts[pi].active) return;
        for (auto& P : lv->terrain) {
            V2 n; float C;
            if (circlePoly(P, parts[pi].x, r, n, C)) applyContact(pi, -1, -1, 0, n, C, mode, tgt, maxImp, mu, dir);
        }
        const float R = r + ROAD_HALF;
        for (auto& b : beams) {
            if (!b.alive || !mat(b.mat).road) continue;
            V2 q = parts[pi].x;
            V2 A = parts[b.a].x, B = parts[b.b].x;
            if (q.x < std::min(A.x, B.x) - R || q.x > std::max(A.x, B.x) + R ||
                q.y < std::min(A.y, B.y) - R || q.y > std::max(A.y, B.y) + R) continue;
            V2 ab = B - A;
            float l2 = len2(ab);
            float u = l2 > 1e-9f ? clampf(dot(q - A, ab) / l2, 0, 1) : 0;
            V2 d = q - (A + ab * u);
            float dist = len(d);
            if (dist >= R || dist < 1e-6f) continue;
            applyContact(pi, b.a, b.b, u, d / dist, dist - R, mode, tgt, maxImp, mu, dir);
        }
    }

    // ---------------------------------------------------------- rupture
    void breakBeam(int i) {
        SBeam b = beams[i];
        V2 A = parts[b.a].x, B = parts[b.b].x, mid = (A + B) * 0.5f, d = normz(B - A);
        V2 vm = (parts[b.a].v + parts[b.b].v) * 0.5f;
        float hm = std::max(2.f, b.mass * 0.25f);
        int m1 = addPart(mid - d * 0.03f, hm, 0.06f, PK_NODE);
        int m2 = addPart(mid + d * 0.03f, hm, 0.06f, PK_NODE);
        parts[m1].v = vm; parts[m2].v = vm;
        float hr = b.rest * 0.5f;
        beams[i].b = m1; beams[i].rest0 = beams[i].rest = hr; beams[i].broken = true; beams[i].stress = 0;
        beams[i].mass = b.mass * 0.5f;
        SBeam s = b; s.a = m2; s.b = b.b; s.rest0 = s.rest = hr; s.broken = true; s.stress = 0; s.mass = b.mass * 0.5f;
        beams.push_back(s);
        breaks++;
        events.push_back({ TVE_BREAK, mid, b.mass });
        uint32_t col = 0xFF8D6E63;
        for (int k = 0; k < 10; k++) {
            Fx f; f.x = mid; f.v = vm + V2((frand(rng) - 0.5f) * 6, frand(rng) * 5);
            f.life = f.maxLife = 0.6f + frand(rng) * 0.6f; f.size = 0.05f + frand(rng) * 0.08f;
            f.color = k < 5 ? col : 0xFFFFD54F; f.kind = 0;
            fx.push_back(f);
        }
    }

    // ------------------------------------------------------- véhicules
    void buildBody(Body& B, int type, V2 o, int dir) {
        const VehType& T = vtype(type);
        B.type = type;
        auto W = [&](float lx, float ly) { return o + V2(lx * dir, ly); };
        float mc = T.mass * 0.25f;
        B.c[0] = addPart(W(0, 0), mc, 0.1f, PK_BODY);
        B.c[1] = addPart(W(T.L, 0), mc, 0.1f, PK_BODY);
        B.c[2] = addPart(W(T.L, T.H), mc, 0.1f, PK_BODY);
        B.c[3] = addPart(W(0, T.H), mc, 0.1f, PK_BODY);
        int e[6][2] = { {0,1},{1,2},{2,3},{3,0},{0,2},{1,3} };
        for (auto& k : e) addCon(B.c[k[0]], B.c[k[1]], 0, 0);
        float load = (T.mass + T.nw * T.wheelMass) * 9.81f / T.nw;
        float comp = T.susp / load;
        for (int k = 0; k < T.nw; k++) {
            int id = addPart(W(T.w[k].x, T.w[k].y), T.wheelMass, T.w[k].r, PK_WHEEL);
            B.wheel[k] = id; B.spin[k] = 0; B.lastW[k] = parts[id].x;
            SCon sc; sc.w = id; sc.a = B.c[0]; sc.b = B.c[1]; sc.dir = dir;
            sc.s = T.w[k].x / T.L; sc.wy = T.w[k].y; sc.comp = comp; sc.damp = 0.05f; sc.travel = std::max(0.15f, T.susp * 5.f);
            susp.push_back(sc);
        }
    }

    static float trailerLen(int type) { int t = vtype(type).trailer; return t >= 0 ? vtype(t).L - 1.2f : 0.f; }

    void spawnVehicle(int type, int dir, float cx) {
        const VehType& T = vtype(type);
        float ground = terrainTopY(*lv, cx);
        if (ground < -1e8f) ground = 0;
        float lowest = 0;
        for (int k = 0; k < T.nw; k++) lowest = std::min(lowest, T.w[k].y - T.w[k].r);
        V2 o(cx - dir * T.L * 0.5f, ground - lowest + 0.03f);
        Vehicle v;
        v.type = type; v.dir = dir;
        static const uint32_t cols[] = { 0xFFE53935, 0xFF1E88E5, 0xFF43A047, 0xFFFDD835, 0xFF8E24AA, 0xFFFB8C00, 0xFF00ACC1, 0xFFF06292 };
        v.color = cols[(int)(frand(rng) * 8) & 7];
        v.p0 = (int)parts.size();
        buildBody(v.body[0], type, o, dir);
        if (T.trailer >= 0) {
            const VehType& R = vtype(T.trailer);
            V2 hw = o + V2(T.hitch.x * dir, T.hitch.y);
            V2 oR = hw - V2(R.hitch.x * dir, R.hitch.y);
            buildBody(v.body[1], T.trailer, oR, dir);
            v.nb = 2;
            int h = addPart(hw, 60, 0.1f, PK_HITCH);
            v.hitch = h;
            Body& B0 = v.body[0]; Body& B1 = v.body[1];
            addCon(h, B0.c[0], 0, 0); addCon(h, B0.c[3], 0, 0); addCon(h, B0.c[1], 0, 0);
            addCon(h, B1.c[1], 0, 0); addCon(h, B1.c[2], 0, 0);
        }
        v.p1 = (int)parts.size();
        v.target = T.speed;
        for (int i = v.p0; i < v.p1; i++) parts[i].v = V2(dir * T.speed * 0.6f, 0);
        veh.push_back(v);
    }

    void extent(const Vehicle& v, float& x0, float& x1) const {
        x0 = 1e30f; x1 = -1e30f;
        for (int bi = 0; bi < v.nb; bi++)
            for (int k = 0; k < 4; k++) {
                float x = parts[v.body[bi].c[k]].x.x;
                x0 = std::min(x0, x); x1 = std::max(x1, x);
            }
    }

    void spawnLogic() {
        for (int d = 0; d < 2; d++) {
            int dir = d == 0 ? 1 : -1;
            while (nextSpawn[d] < queue[d].size() && queue[d][nextSpawn[d]].time <= time) {
                const SpawnDef& s = queue[d][nextSpawn[d]];
                float sx = lv->spawnX[d];
                const VehType& T = vtype(s.type);
                float tl = trailerLen(s.type);
                float n0 = dir > 0 ? sx - T.L * 0.5f - tl : sx - T.L * 0.5f;
                float n1 = dir > 0 ? sx + T.L * 0.5f : sx + T.L * 0.5f + tl;
                bool blocked = false;
                for (auto& o : veh) {
                    if (o.gone || o.dir != dir) continue;
                    float a, b; extent(o, a, b);
                    if (b > n0 - 2.5f && a < n1 + 2.5f) { blocked = true; break; }
                }
                if (blocked) break;
                spawnVehicle(s.type, dir, sx);
                nextSpawn[d]++;
            }
        }
    }

    void fail(const wchar_t* msg, V2 pos) {
        if (!lost && !won) { lost = true; failMsg = msg; events.push_back({ TVE_FAIL, pos, 1 }); }
    }

    void vehicleLogic(float dt) {
        for (size_t i = 0; i < veh.size(); i++) {
            Vehicle& v = veh[i];
            if (v.gone) continue;
            float x0, x1; extent(v, x0, x1);
            V2 c = vehCenter(v);
            int di = v.dir > 0 ? 0 : 1;
            if (!v.arrived && !v.failed && (v.dir > 0 ? c.x > lv->goalX[0] : c.x < lv->goalX[1])) {
                v.arrived = true; arrived++;
                events.push_back({ TVE_ARRIVE, c, 1 });
            }
            if (v.dir > 0 ? x0 > lv->goalX[0] + 22 : x1 < lv->goalX[1] - 22) {
                v.gone = true;
                for (int k = v.p0; k < v.p1; k++) parts[k].active = false;
                continue;
            }
            (void)di;
            float gap = 1e9f;
            for (size_t j = 0; j < veh.size(); j++) {
                const Vehicle& o = veh[j];
                if (j == i || o.gone || o.dir != v.dir) continue;
                float a, b; extent(o, a, b);
                if (v.dir > 0) { if (a > x0 + 0.5f) gap = std::min(gap, a - x1); }
                else           { if (b < x1 - 0.5f) gap = std::min(gap, x0 - b); }
            }
            float cruise = vtype(v.type).speed;
            v.target = gap < 2.0f ? 0.f : (gap < 7.0f ? cruise * (gap - 2.0f) / 5.0f : cruise);
            if (v.failed) v.target = 0;
            V2 o, ax, ay; bodyFrame(v, 0, o, ax, ay);
            if (!v.arrived && !v.failed && c.y < lv->waterY + 0.2f) {
                v.failed = true;
                fail(L"Un véhicule est tombé à l'eau !", c);
            }
            if (ay.y < -0.2f) v.flipT += dt; else v.flipT = 0;
            if (!v.failed && !v.arrived && v.flipT > 2.0f) {
                v.failed = true;
                fail(L"Un véhicule s'est renversé !", c);
            }
        }
    }

    void boatLogic() {
        for (auto& b : boats) {
            if (b.passed || b.hit) continue;
            if (time < b.d.time) continue;
            if (time > b.d.time + BOAT_PASS) { b.passed = true; continue; }
            auto shapes = boatShapes(b.d, lv->waterY);
            size_t nb = beams.size();
            for (size_t i = 0; i < nb; i++) {
                if (!beams[i].alive) continue;
                V2 A = parts[beams[i].a].x, B = parts[beams[i].b].x;
                bool hit = false;
                for (auto& s : shapes) if (segPoly(s, A, B)) { hit = true; break; }
                if (!hit) continue;
                b.hit = true;
                if (!beams[i].broken) breakBeam((int)i);
                parts[beams[i].a].v += V2(0, 3);
            }
            if (b.hit) {
                events.push_back({ TVE_BOAT_HIT, V2(b.d.x, lv->waterY + 2), 1 });
                fail(L"Le bateau a heurté le pont !", V2(b.d.x, lv->waterY + 2));
            }
        }
    }

    void waterLogic() {
        const float wy = lv->waterY;
        int splashes = 0;
        for (auto& q : parts) {
            if (!q.active) continue;
            if (!q.wet && q.x.y < wy) {
                q.wet = true;
                float sp = -q.v.y;
                if (sp > 2.0f && splashes < 6) {
                    splashes++;
                    int n = std::min(14, (int)(sp * 2));
                    for (int k = 0; k < n; k++) {
                        Fx f; f.x = V2(q.x.x, wy); f.v = V2((frand(rng) - 0.5f) * 4, 2 + frand(rng) * sp * 0.6f);
                        f.life = f.maxLife = 0.5f + frand(rng) * 0.6f; f.size = 0.06f + frand(rng) * 0.1f;
                        f.color = 0xFFE3F2FD; f.kind = 1;
                        fx.push_back(f);
                    }
                    if (q.kind != PK_NODE || sp > 5) events.push_back({ TVE_SPLASH, V2(q.x.x, wy), sp });
                }
            } else if (q.wet && q.x.y > wy + 0.3f) q.wet = false;
        }
    }

    void spinWheels() {
        for (auto& v : veh) {
            if (v.gone) continue;
            for (int bi = 0; bi < v.nb; bi++) {
                Body& B = v.body[bi];
                const VehType& T = vtype(B.type);
                V2 o, ax, ay; bodyFrame(v, bi, o, ax, ay);
                for (int k = 0; k < T.nw; k++) {
                    V2 p = parts[B.wheel[k]].x;
                    B.spin[k] += dot(p - B.lastW[k], ax) / T.w[k].r;
                    B.lastW[k] = p;
                }
            }
        }
    }

    void updateFx(float dt) {
        for (auto& f : fx) {
            f.v.y += GRAV * dt;
            f.x += f.v * dt;
            f.life -= dt;
        }
        fx.erase(std::remove_if(fx.begin(), fx.end(), [](const Fx& f) { return f.life <= 0; }), fx.end());
    }
};

// ===================================================== création des niveaux
namespace lvl {

inline Poly leftBank(float xe, float top, float water, float face = 5.f) {
    float fy = std::max(top - face, water + 0.8f);
    Poly p;
    p.pts = { V2(-90, -45), V2(xe + 3.5f, -45), V2(xe + 1.5f, water - 1.5f), V2(xe + 0.25f, fy - 0.4f),
              V2(xe, fy), V2(xe, top), V2(-90, top) };
    finalizePoly(p);
    return p;
}
inline Poly rightBank(float xe, float top, float water, float face = 5.f) {
    float fy = std::max(top - face, water + 0.8f);
    Poly p;
    p.pts = { V2(xe - 3.5f, -45), V2(190, -45), V2(190, top), V2(xe, top), V2(xe, fy),
              V2(xe - 0.25f, fy - 0.4f), V2(xe - 1.5f, water - 1.5f) };
    finalizePoly(p);
    return p;
}
inline Poly pillar(float cx, float top, float w, float water) {
    Poly p;
    p.pts = { V2(cx - w * 0.5f - 2.f, -45), V2(cx + w * 0.5f + 2.f, -45), V2(cx + w * 0.5f + 0.5f, water - 1.f),
              V2(cx + w * 0.5f, top), V2(cx - w * 0.5f, top), V2(cx - w * 0.5f - 0.5f, water - 1.f) };
    finalizePoly(p);
    return p;
}
inline uint32_t mask(std::initializer_list<int> m) { uint32_t r = 0; for (int i : m) r |= 1u << i; return r; }

// gabarit commun : deux rives séparées par une brèche [0, gap]
inline Level basic(const wchar_t* name, const wchar_t* hint, float gap, float topL, float topR, float water, int theme) {
    Level L;
    L.name = name; L.hint = hint; L.theme = theme; L.waterY = water;
    // le dessus du terrain est à top + ROAD_HALF : les ancrages de chaussée tombent
    // pile sur la grille et la route affleure le sol
    float tL = topL + ROAD_HALF, tR = topR + ROAD_HALF;
    float face = std::max(tL, tR) - water + 2.f;
    L.terrain.push_back(leftBank(0, tL, water, std::min(face, tL - water - 0.8f)));
    L.terrain.push_back(rightBank(gap, tR, water, std::min(face, tR - water - 0.8f)));
    L.anchors.push_back(V2(0, topL));
    L.anchors.push_back(V2(gap, topR));
    L.spawnX[0] = -16; L.spawnX[1] = gap + 16;
    L.goalX[0] = gap + 7; L.goalX[1] = -7;
    float top = std::max(topL, topR);
    L.vx0 = -7; L.vx1 = gap + 7; L.vy0 = std::min(water - 2.f, std::min(topL, topR) - 7.f); L.vy1 = top + 6;
    return L;
}

} // namespace lvl

inline std::vector<Level> makeLevels() {
    using namespace lvl;
    std::vector<Level> out;
    // 1 ----------------------------------------------------------------
    {
        Level L = basic(L"Premier pont", L"Relie les deux rives avec de la route, puis renforce-la avec des triangles en bois.", 10, 0, 0, -4, 0);
        L.anchors.push_back(V2(0, -2.5f)); L.anchors.push_back(V2(10, -2.5f));
        L.mats = mask({ M_ROAD, M_WOOD });
        L.spawns = { { V_CAR, 1, 0 } };
        L.budget = 5500;
        out.push_back(L);
    }
    // 2 ----------------------------------------------------------------
    {
        Level L = basic(L"Le ruisseau", L"Pas d'appui sous la brèche : construis un treillis au-dessus de la route.", 14, 0, 0, -3.5f, 0);
        L.mats = mask({ M_ROAD, M_WOOD });
        L.spawns = { { V_CAR, 1, 0 }, { V_MOTO, 1, 2 }, { V_CAR, 1, 4 } };
        L.budget = 7500;
        out.push_back(L);
    }
    // 3 ----------------------------------------------------------------
    {
        Level L = basic(L"Poids lourd", L"Un camion-benne de 10 tonnes ! L'acier et la route renforcée seront tes alliés.", 16, 0, 0, -5, 1);
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(16, -3));
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL });
        L.spawns = { { V_TRUCK, 1, 0 } };
        L.budget = 26000;
        out.push_back(L);
    }
    // 4 ----------------------------------------------------------------
    {
        Level L = basic(L"Le rocher", L"Appuie-toi sur le rocher au milieu de la rivière.", 28, 0, 0, -4, 0);
        L.terrain.push_back(pillar(14, -1.2f, 3, L.waterY));
        L.anchors.push_back(V2(12.5f, -1.2f)); L.anchors.push_back(V2(15.5f, -1.2f));
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(28, -3));
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL });
        L.spawns = { { V_CAR, 1, 0 }, { V_BUS, 1, 2 }, { V_CAR, 1, 9 } };
        L.budget = 46000;
        out.push_back(L);
    }
    // 5 ----------------------------------------------------------------
    {
        Level L = basic(L"Le précipice", L"Le gouffre est trop profond : suspends la route aux pylônes avec des câbles.", 24, 0, 0, -12, 2);
        L.anchors.push_back(V2(-1.5f, 8)); L.anchors.push_back(V2(25.5f, 8));
        L.pylons = { { -1.5f, 0, 8 }, { 25.5f, 0, 8 } };
        L.mats = mask({ M_ROAD, M_WOOD, M_ROPE, M_CABLE });
        L.spawns = { { V_CAR, 1, 0 }, { V_CAR, 1, 1.5f }, { V_VAN, 1, 3 }, { V_CAR, 1, 5 } };
        L.vy0 = -14; L.vy1 = 11;
        L.budget = 13000;
        out.push_back(L);
    }
    // 6 ----------------------------------------------------------------
    {
        Level L = basic(L"La côte", L"La rive d'en face est plus haute : la route doit grimper sans casser.", 18, 0, 3.5f, -4, 1);
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(18, 0.5f));
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL });
        L.spawns = { { V_VAN, 1, 0 }, { V_TRUCK, 1, 3 } };
        L.budget = 30000;
        out.push_back(L);
    }
    // 7 ----------------------------------------------------------------
    {
        Level L = basic(L"Le pont-levis", L"Un bateau passe à 14 s : lève le pont avec les vérins [H], puis rabaisse-le pour les voitures suivantes.", 16, 0, 0, -3, 0);
        L.anchors.push_back(V2(0, -2.5f)); L.anchors.push_back(V2(16, -2.5f));
        L.mats = mask({ M_ROAD, M_WOOD, M_STEEL, M_HYD });
        L.spawns = { { V_CAR, 1, 0 }, { V_VAN, -1, 1.5f }, { V_CAR, 1, 21 }, { V_CAR, -1, 22 } };
        L.boats = { { 14.f, 8.f, 6.f, 9.f } };
        L.budget = 18500;
        out.push_back(L);
    }
    // 8 ----------------------------------------------------------------
    {
        Level L = basic(L"Double sens", L"Des véhicules arrivent des deux côtés en même temps.", 20, 0, 0, -5, 3);
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(20, -3));
        L.mats = mask({ M_ROAD, M_WOOD, M_STEEL, M_ROPE });
        L.spawns = { { V_CAR, 1, 0 }, { V_VAN, 1, 2 }, { V_MOTO, 1, 4 }, { V_CAR, -1, 0 }, { V_CAR, -1, 2.5f }, { V_VAN, -1, 5 } };
        L.budget = 17000;
        out.push_back(L);
    }
    // 9 ----------------------------------------------------------------
    {
        Level L;
        L.name = L"Le tremplin";
        L.hint = L"Budget serré : impossible de tout relier. Construis une rampe et fais sauter les 4x4 jusqu'à la pente d'en face !";
        L.theme = 1; L.waterY = -5;
        L.terrain.push_back(leftBank(0, ROAD_HALF, L.waterY, 4.3f));
        Poly R;
        R.pts = { V2(16.5f, -45), V2(190, -45), V2(190, -4.5f + ROAD_HALF), V2(36, -4.5f + ROAD_HALF), V2(20, -0.5f + ROAD_HALF),
                  V2(20, -4.2f), V2(19.75f, -4.6f), V2(18.5f, -6.5f) };
        finalizePoly(R);
        L.terrain.push_back(R);
        L.anchors = { V2(0, 0), V2(0, -2), V2(20, -0.5f) };
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_SPRING });
        L.spawns = { { V_JEEP, 1, 0 }, { V_JEEP, 1, 4 } };
        L.spawnX[0] = -24; L.spawnX[1] = 60;
        L.goalX[0] = 38; L.goalX[1] = -7;
        L.vx0 = -8; L.vx1 = 40; L.vy0 = -8; L.vy1 = 8;
        L.budget = 6000;
        out.push_back(L);
    }
    // 10 ---------------------------------------------------------------
    {
        Level L = basic(L"Le convoi", L"Semi-remorque, bus et camion se suivent. Il faut du solide !", 30, 0, 0, -5, 2);
        L.terrain.push_back(pillar(15, -2.f, 4, L.waterY));
        L.anchors.push_back(V2(13, -2)); L.anchors.push_back(V2(17, -2));
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(30, -3));
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE });
        L.spawns = { { V_SEMI, 1, 0 }, { V_BUS, 1, 4 }, { V_TRUCK, 1, 8 }, { V_CAR, 1, 12 } };
        L.spawnX[0] = -18;
        L.budget = 50000;
        out.push_back(L);
    }
    // 11 ---------------------------------------------------------------
    {
        Level L = basic(L"Le grand canyon", L"40 mètres de vide, de la circulation dans les deux sens. Le chef-d'œuvre final.", 40, 0, 0, -12, 3);
        L.terrain.push_back(pillar(20, -5.f, 2, L.waterY));
        L.anchors.push_back(V2(19, -5)); L.anchors.push_back(V2(21, -5));
        L.anchors.push_back(V2(-1.5f, 9)); L.anchors.push_back(V2(41.5f, 9));
        L.pylons = { { -1.5f, 0, 9 }, { 41.5f, 0, 9 } };
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING });
        L.spawns = { { V_CAR, 1, 0 }, { V_BUS, 1, 3 }, { V_CAR, 1, 10 }, { V_SEMI, 1, 14 },
                     { V_VAN, -1, 0 }, { V_MOTO, -1, 3 }, { V_TRUCK, -1, 6 } };
        L.spawnX[0] = -18; L.spawnX[1] = 58;
        L.vy0 = -14; L.vy1 = 12;
        L.budget = 48000;
        out.push_back(L);
    }
    // 12 ---------------------------------------------------------------
    {
        Level L = basic(L"Bac à sable", L"Budget illimité, tous les matériaux, tous les véhicules. Amuse-toi !", 36, 0, 0, -6, 0);
        L.terrain.push_back(pillar(18, -2.5f, 3, L.waterY));
        L.anchors.push_back(V2(17, -2.5f)); L.anchors.push_back(V2(19, -2.5f));
        L.anchors.push_back(V2(0, -3)); L.anchors.push_back(V2(36, -3));
        L.anchors.push_back(V2(-1.5f, 8)); L.anchors.push_back(V2(37.5f, 8));
        L.pylons = { { -1.5f, 0, 8 }, { 37.5f, 0, 8 } };
        L.mats = mask({ M_ROAD, M_ROAD_HEAVY, M_WOOD, M_STEEL, M_ROPE, M_CABLE, M_SPRING, M_HYD });
        L.spawns = { { V_CAR, 1, 0 }, { V_MOTO, 1, 2 }, { V_VAN, 1, 4 }, { V_JEEP, 1, 6 }, { V_BUS, 1, 8 },
                     { V_TRUCK, 1, 12 }, { V_SEMI, 1, 16 }, { V_CAR, -1, 1 }, { V_VAN, -1, 5 } };
        L.spawnX[0] = -18; L.spawnX[1] = 54;
        L.vy0 = -10; L.vy1 = 11;
        L.budget = 999999;
        out.push_back(L);
    }
    return out;
}

// ============================================== conceptions de référence
// (utilisées par les tests automatiques pour vérifier que chaque niveau est
//  faisable dans son budget ; elles ne sont pas montrées au joueur)
namespace ref {

inline int& refErrors() { static int e = 0; return e; }
inline void B(Design& D, const Level& L, V2 a, V2 b, int m, float ext = 0) {
    int r = addBeam(D, L, a, b, m, ext);
    if (r != ADD_OK && r != ADD_EXISTS) refErrors()++;
}

// tablier de a à b en n segments + treillis Warren décalé de h (au-dessus si h>0)
inline void truss(Design& D, const Level& L, V2 a, V2 b, int n, float h, int deck, int web, int chord) {
    V2 s = (b - a) / (float)n;
    for (int i = 0; i < n; i++) {
        V2 p0 = a + s * (float)i, p1 = a + s * (float)(i + 1), q = (p0 + p1) * 0.5f + V2(0, h);
        B(D, L, p0, p1, deck);
        if (h != 0) {
            B(D, L, p0, q, web); B(D, L, q, p1, web);
            if (i + 1 < n) B(D, L, q, q + s, chord);
        }
    }
}

inline bool build(int idx, const Level& L, Design& D) {
    D = initialDesign(L);
    float y = 0;
    switch (idx) {
    case 0:
        truss(D, L, V2(0, y), V2(10, y), 5, 1.5f, M_ROAD, M_WOOD, M_WOOD);
        return true;
    case 1:
        truss(D, L, V2(0, y), V2(14, y), 7, 1.6f, M_ROAD, M_WOOD, M_WOOD);
        return true;
    case 2:
        truss(D, L, V2(0, y), V2(16, y), 8, 1.6f, M_ROAD, M_STEEL, M_STEEL);
        B(D, L, V2(0, -3), V2(2, y), M_STEEL); B(D, L, V2(16, -3), V2(14, y), M_STEEL);
        return true;
    case 3:
        truss(D, L, V2(0, y), V2(14, y), 7, 1.7f, M_ROAD, M_STEEL, M_STEEL);
        truss(D, L, V2(14, y), V2(28, y), 7, 1.7f, M_ROAD, M_STEEL, M_STEEL);
        B(D, L, V2(13, 1.7f), V2(15, 1.7f), M_STEEL);
        B(D, L, V2(12.5f, -1.2f), V2(12, y), M_WOOD); B(D, L, V2(12.5f, -1.2f), V2(14, y), M_STEEL);
        B(D, L, V2(15.5f, -1.2f), V2(14, y), M_STEEL); B(D, L, V2(15.5f, -1.2f), V2(16, y), M_WOOD);
        B(D, L, V2(0, -3), V2(2, y), M_STEEL); B(D, L, V2(28, -3), V2(26, y), M_STEEL);
        return true;
    case 4: {
        for (int i = 0; i < 12; i++) B(D, L, V2(2.f * i, y), V2(2.f * (i + 1), y), M_ROAD);
        for (int i = 2; i <= 10; i += 2) {
            V2 p(2.f * i, y);
            if (i <= 6) B(D, L, V2(-1.5f, 8), p, M_CABLE);
            if (i >= 6) B(D, L, V2(25.5f, 8), p, M_CABLE);
        }
        return true;
    }
    case 5: {
        V2 a(0, y), b(18, 3.5f);
        truss(D, L, a, b, 10, 1.6f, M_ROAD, M_STEEL, M_STEEL);
        V2 s = (b - a) / 10.f;
        B(D, L, V2(0, -3), a + s, M_STEEL);
        B(D, L, V2(18, 0.5f), b - s, M_STEEL);
        return true;
    }
    case 6: {
        // deux volets basculants
        float xs[] = { 0, 2, 4, 6, 7.5f };
        float xr[] = { 16, 14, 12, 10, 8.5f };
        for (int i = 0; i < 4; i++) {
            B(D, L, V2(xs[i], y), V2(xs[i + 1], y), M_ROAD);
            B(D, L, V2(xr[i], y), V2(xr[i + 1], y), M_ROAD);
        }
        for (int i = 0; i < 4; i++) {
            V2 q((xs[i] + xs[i + 1]) * 0.5f, 1.4f), r((xr[i] + xr[i + 1]) * 0.5f, 1.4f);
            int w = i < 2 ? M_STEEL : M_WOOD;
            B(D, L, V2(xs[i], y), q, w); B(D, L, q, V2(xs[i + 1], y), w);
            B(D, L, V2(xr[i], y), r, w); B(D, L, r, V2(xr[i + 1], y), w);
            if (i < 3) {
                B(D, L, q, V2((xs[i + 1] + xs[i + 2]) * 0.5f, 1.4f), w);
                B(D, L, r, V2((xr[i + 1] + xr[i + 2]) * 0.5f, 1.4f), w);
            }
        }
        B(D, L, V2(0, -2.5f), V2(2, y), M_HYD, 1.3f);
        B(D, L, V2(16, -2.5f), V2(14, y), M_HYD, 1.3f);
        return true;
    }
    case 7:
        truss(D, L, V2(0, y), V2(20, y), 10, 1.7f, M_ROAD, M_WOOD, M_STEEL);
        return true;
    case 8: {
        // rampe de lancement : route renforcée sur treillis acier/bois
        V2 r0(0, y), r1(1.9f, 0.4f), r2(3.8f, 1.0f), r3(5.6f, 1.8f);
        V2 u0(0, -2), u1(1.2f, -1.2f), u2(3.0f, -0.6f), u3(4.7f, 0.2f);
        B(D, L, r0, r1, M_ROAD_HEAVY); B(D, L, r1, r2, M_ROAD_HEAVY); B(D, L, r2, r3, M_ROAD_HEAVY);
        B(D, L, u0, u1, M_STEEL); B(D, L, u1, r0, M_STEEL); B(D, L, u1, r1, M_WOOD); B(D, L, u1, u2, M_STEEL);
        B(D, L, u2, r1, M_WOOD); B(D, L, u2, r2, M_WOOD); B(D, L, u2, u3, M_WOOD);
        B(D, L, u3, r2, M_WOOD); B(D, L, u3, r3, M_WOOD);
        return true;
    }
    case 9: {
        truss(D, L, V2(0, y), V2(14, y), 7, 1.7f, M_ROAD, M_STEEL, M_STEEL);
        truss(D, L, V2(16, y), V2(30, y), 7, 1.7f, M_ROAD, M_STEEL, M_STEEL);
        B(D, L, V2(14, y), V2(16, y), M_ROAD);
        B(D, L, V2(13, 1.7f), V2(17, 1.7f), M_STEEL);
        B(D, L, V2(13, -2), V2(14, y), M_STEEL); B(D, L, V2(17, -2), V2(16, y), M_STEEL);
        B(D, L, V2(13, -2), V2(12, y), M_STEEL); B(D, L, V2(17, -2), V2(18, y), M_STEEL);
        B(D, L, V2(0, -3), V2(2, y), M_STEEL); B(D, L, V2(30, -3), V2(28, y), M_STEEL);
        return true;
    }
    case 10: {
        for (int i = 0; i < 20; i++) B(D, L, V2(2.f * i, y), V2(2.f * (i + 1), y), M_ROAD_HEAVY);
        for (int i = 1; i <= 19; i++) {
            V2 p(2.f * i, y);
            if (i <= 8)  B(D, L, V2(-1.5f, 9), p, M_CABLE);
            if (i >= 12) B(D, L, V2(41.5f, 9), p, M_CABLE);
        }
        B(D, L, V2(19, -5), V2(19, -2.5f), M_STEEL); B(D, L, V2(21, -5), V2(21, -2.5f), M_STEEL);
        B(D, L, V2(19, -2.5f), V2(21, -2.5f), M_STEEL);
        B(D, L, V2(19, -2.5f), V2(18, y), M_STEEL); B(D, L, V2(19, -2.5f), V2(20, y), M_STEEL);
        B(D, L, V2(21, -2.5f), V2(20, y), M_STEEL); B(D, L, V2(21, -2.5f), V2(22, y), M_STEEL);
        B(D, L, V2(19, -5), V2(21, -2.5f), M_STEEL);
        return true;
    }
    default:
        return false;
    }
}

} // namespace ref
} // namespace tv
