// =====================================================================
//  TRAVÉE — Bâtisseurs de ponts
//  main.cpp : application Windows native (Win32 + GDI+ + waveOut)
//  Compilation : voir build.sh (MinGW-w64) ou build.bat (MSVC / MinGW)
// =====================================================================
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <objidl.h>
#include <mmsystem.h>
#include <shellapi.h>
#include <algorithm>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>
namespace Gdiplus { using std::min; using std::max; }
#include <gdiplus.h>
#include "core.h"

using namespace Gdiplus;
using namespace tv;

// =========================================================== constantes UI
static const float TOPBAR = 62.f;
static const float BOTBAR = 106.f;
static const wchar_t* APP_TITLE = L"Travée — Bâtisseurs de ponts";

// ================================================================== état
enum Screen { SCR_MENU, SCR_BUILD, SCR_SIM };
enum BtnId {
    B_NONE = 0, B_MENU, B_UNDO, B_REDO, B_CLEAR, B_HELP, B_PLAY, B_SPEED, B_HYD, B_STRESS, B_PAUSE,
    B_NEXT, B_EDIT, B_WATCH, B_QUIT, B_HELPCLOSE, B_GRID, B_FIT, B_MAT = 100, B_LEVEL = 200
};
struct Btn { int id; RectF r; };

static HWND     gWnd = nullptr;
static int      gW = 1280, gH = 760;          // taille logique (pixels à 96 ppp)
static int      gPW = 1280, gPH = 760;        // taille physique du tampon
static float    gScale = 1.f;                 // facteur d'échelle DPI
static HDC      gMemDC = nullptr;
static HBITMAP  gDib = nullptr, gOldBmp = nullptr;
static void*    gBits = nullptr;
static bool     gRunning = true;

static std::vector<Level>  gLevels;
static std::vector<Design> gSaved;
static std::vector<int>    gBest;
static int     gCur = 0;
static Screen  gScr = SCR_MENU;
static Design  gDesign;
static std::vector<Design> gUndo, gRedo;
static Sim     gSim;
static Sim     gDemo;
static Design  gDemoDesign;
static int     gDemoLevel = 1;
static int     gMat = M_ROAD;
static float   gCamX = 5, gCamY = 0, gZoom = 40;
static float   gMx = 0, gMy = 0;
static V2      gMouseW;
static bool    gDrawing = false, gChain = false;
static V2      gStart;
static float   gDownX = 0, gDownY = 0;
static bool    gPanning = false;
static float   gPanMx = 0, gPanMy = 0, gPanCX = 0, gPanCY = 0;
static bool    gDragNode = false;
static int     gDragIdx = -1;
static int     gHoverNode = -1, gHoverBeam = -1;
static bool    gShowStress = false, gShowGrid = true, gPaused = false, gHelp = false;
static int     gSpeedIdx = 2;
static const float SPEEDS[] = { 0.25f, 0.5f, 1.f, 2.f };
static float   gTime = 0;
static std::wstring gToast;
static float   gToastT = 0;
static float   gWinT = -1;
static bool    gResultDismissed = false;
static bool    gFirstRun = false;
static std::vector<Btn> gBtns, gBtnsPrev;
static int     gPressBtn = 0;
struct Tree { float x, y, s; int kind; };
static std::vector<Tree> gTrees;

// polices
static FontFamily* gFF = nullptr;
static Font *fTitle = nullptr, *fH1 = nullptr, *fH2 = nullptr, *fBody = nullptr, *fSmall = nullptr, *fTiny = nullptr;

// ============================================================== thèmes
struct Theme {
    uint32_t sky0, sky1, sun, hillFar, hillMid, ground0, ground1, grass, water0, water1, trunk, leaf;
    int treeKind;   // 0 feuillus, 1 cactus, 2 sapins enneigés, 3 sapins sombres
};
static const Theme THEMES[4] = {
    { 0xFF7FB8F0, 0xFFE4F4FF, 0xFFFFF4B8, 0xFFA9C9B0, 0xFF83B582, 0xFF9A7357, 0xFF5E4232, 0xFF6DBE45, 0xFF4FA6DA, 0xFF1C5F8F, 0xFF6D4C41, 0xFF4E9F3D, 0 },
    { 0xFFF5C77E, 0xFFFDE3C2, 0xFFFFF1C9, 0xFFE9BE8A, 0xFFD39B63, 0xFFD9A066, 0xFF9C5F36, 0xFFEBCB8B, 0xFF3FB8C9, 0xFF1A7180, 0xFF5D7F3A, 0xFF6E9C45, 1 },
    { 0xFF9DBEEB, 0xFFDDEEFA, 0xFFFFFFFF, 0xFFC5D3E3, 0xFF97ACC2, 0xFF7E8B9B, 0xFF4B5664, 0xFFF4F8FC, 0xFF5AA9D6, 0xFF22587F, 0xFF5D4037, 0xFF2E6B4A, 2 },
    { 0xFF2C1F55, 0xFFF59A6E, 0xFFFFC58A, 0xFF6A4A7A, 0xFF46335E, 0xFF6E5264, 0xFF35263A, 0xFF59B07F, 0xFF4A6A9C, 0xFF1A2A4E, 0xFF3E2C2C, 0xFF2F5A4F, 3 },
};

// ============================================================ utilitaires
static inline Color C(uint32_t c) { return Color((BYTE)(c >> 24), (BYTE)(c >> 16), (BYTE)(c >> 8), (BYTE)c); }
static inline Color CA(uint32_t c, int a) { return Color((BYTE)a, (BYTE)(c >> 16), (BYTE)(c >> 8), (BYTE)c); }
static inline uint32_t shade(uint32_t c, float f) {
    auto ch = [&](int s) { int v = (int)(((c >> s) & 255) * f); return (uint32_t)std::min(255, std::max(0, v)) << s; };
    return (c & 0xFF000000u) | ch(16) | ch(8) | ch(0);
}
static inline uint32_t mix(uint32_t a, uint32_t b, float t) {
    auto ch = [&](int s) { float va = (float)((a >> s) & 255), vb = (float)((b >> s) & 255); return (uint32_t)(va + (vb - va) * t) << s; };
    return 0xFF000000u | ch(16) | ch(8) | ch(0);
}
static std::wstring money(float v) {
    long long n = (long long)std::llround(v);
    bool neg = n < 0; if (neg) n = -n;
    std::wstring s = std::to_wstring(n), o;
    int c = 0;
    for (int i = (int)s.size() - 1; i >= 0; i--) { o.insert(o.begin(), s[i]); if (++c % 3 == 0 && i > 0) o.insert(o.begin(), L' '); }
    return (neg ? L"-" : L"") + o + L" $";
}
static std::wstring fnum(float v, int dec = 1) {
    wchar_t b[32]; swprintf(b, 32, dec == 0 ? L"%.0f" : (dec == 1 ? L"%.1f" : L"%.2f"), v);
    for (wchar_t* p = b; *p; p++) if (*p == L'.') *p = L',';
    return b;
}
static std::wstring str(const wchar_t* fmt, ...) {
    wchar_t b[512];
    va_list ap; va_start(ap, fmt); vswprintf(b, 512, fmt, ap); va_end(ap);
    return b;
}

// --------------------------------------------------------- caméra
static inline float viewCY() { return (gScr == SCR_MENU) ? gH * 0.5f : (TOPBAR + (gH - BOTBAR)) * 0.5f; }
static inline PointF S(V2 w) { return PointF(gW * 0.5f + (w.x - gCamX) * gZoom, viewCY() - (w.y - gCamY) * gZoom); }
static inline V2 Wd(float sx, float sy) { return V2(gCamX + (sx - gW * 0.5f) / gZoom, gCamY - (sy - viewCY()) / gZoom); }

static void fitCamera(const Level& L, bool menu = false) {
    float aw = gW - 40.f, ah = menu ? gH * 0.9f : gH - TOPBAR - BOTBAR - 30.f;
    gZoom = std::min(aw / (L.vx1 - L.vx0), ah / (L.vy1 - L.vy0));
    gZoom = clampf(gZoom, 6.f, 140.f);
    gCamX = (L.vx0 + L.vx1) * 0.5f;
    gCamY = (L.vy0 + L.vy1) * 0.5f;
}

// ============================================================ audio
namespace audio {
enum { S_PLACE, S_DELETE, S_BREAK, S_SPLASH, S_WIN, S_FAIL, S_CLICK, S_HYD, S_ARRIVE, S_HORN, S_COUNT };
static const int RATE = 22050, BUF = 1024, NBUF = 4;
static std::vector<short> snd[S_COUNT];
struct Voice { int id; size_t pos; float vol; };
static std::vector<Voice> voices;
static CRITICAL_SECTION cs;
static HWAVEOUT wo = nullptr;
static WAVEHDR hdr[NBUF];
static short bufs[NBUF][BUF];
static HANDLE th = nullptr;
static volatile bool run = false;
static bool muted = false;

static float noise(uint32_t& s) { return frand(s) * 2.f - 1.f; }
static void gen() {
    uint32_t r = 1234567;
    auto make = [&](int id, float dur, auto fn) {
        int n = (int)(dur * RATE);
        snd[id].resize(n);
        for (int i = 0; i < n; i++) {
            float t = (float)i / RATE;
            float v = clampf(fn(t, i), -1.f, 1.f);
            snd[id][i] = (short)(v * 30000);
        }
    };
    const float PI2 = 6.2831853f;
    { float ph = 0; make(S_PLACE, 0.09f, [&](float t, int) { float f = 520 - 1800 * t; ph += PI2 * f / RATE; return (std::sin(ph) * 0.6f + noise(r) * 0.15f * std::exp(-t * 90)) * std::exp(-t * 38); }); }
    { float lp = 0; make(S_DELETE, 0.12f, [&](float t, int) { lp += (noise(r) - lp) * 0.25f; return lp * 1.2f * std::exp(-t * 30); }); }
    { float lp = 0, ph = 0; make(S_BREAK, 0.55f, [&](float t, int) { lp += (noise(r) - lp) * 0.55f; ph += PI2 * (95 - 60 * t) / RATE;
        return lp * 0.9f * std::exp(-t * 14) + std::sin(ph) * 0.7f * std::exp(-t * 7); }); }
    { float lp = 0; make(S_SPLASH, 0.8f, [&](float t, int) { lp += (noise(r) - lp) * (0.12f + 0.2f * std::exp(-t * 4)); float env = std::min(1.f, t * 30) * std::exp(-t * 4.5f); return lp * 1.6f * env; }); }
    make(S_WIN, 0.9f, [&](float t, int) {
        static const float notes[] = { 523.25f, 659.25f, 783.99f, 1046.5f };
        int k = std::min(3, (int)(t / 0.13f)); float lt = t - k * 0.13f;
        float f = notes[k]; float env = std::exp(-lt * (k == 3 ? 3.f : 9.f));
        return (std::sin(PI2 * f * t) * 0.5f + std::sin(PI2 * f * 2 * t) * 0.15f) * env; });
    make(S_FAIL, 0.7f, [&](float t, int) { float f = t < 0.25f ? 330.f : 247.f; float lt = t < 0.25f ? t : t - 0.25f;
        float sq = std::sin(PI2 * f * t) > 0 ? 0.35f : -0.35f; return sq * std::exp(-lt * 5) * 0.8f; });
    make(S_CLICK, 0.03f, [&](float t, int) { return std::sin(PI2 * 1800 * t) * std::exp(-t * 200) * 0.5f; });
    { float ph = 0; make(S_HYD, 1.0f, [&](float t, int) { float f = 70 + 40 * t; ph += f / RATE; float saw = 2 * (ph - std::floor(ph)) - 1;
        float env = std::min(1.f, t * 8) * std::min(1.f, (1 - t) * 6); return saw * 0.25f * env + noise(r) * 0.04f * env; }); }
    make(S_ARRIVE, 0.45f, [&](float t, int) { return (std::sin(PI2 * 880 * t) * 0.35f + std::sin(PI2 * 1320 * t) * 0.2f) * std::exp(-t * 9); });
    make(S_HORN, 1.3f, [&](float t, int) { float env = std::min(1.f, t * 10) * std::min(1.f, (1.3f - t) * 5);
        float a = std::sin(PI2 * 140 * t) + 0.5f * std::sin(PI2 * 210 * t) + 0.25f * std::sin(PI2 * 280 * t); return a * 0.3f * env; });
}
static void mixInto(short* out) {
    static float acc[BUF];
    std::fill(acc, acc + BUF, 0.f);
    EnterCriticalSection(&cs);
    for (auto& v : voices) {
        const auto& s = snd[v.id];
        for (int i = 0; i < BUF && v.pos < s.size(); i++, v.pos++) acc[i] += s[v.pos] * v.vol;
    }
    voices.erase(std::remove_if(voices.begin(), voices.end(), [](const Voice& v) { return v.pos >= snd[v.id].size(); }), voices.end());
    LeaveCriticalSection(&cs);
    for (int i = 0; i < BUF; i++) out[i] = (short)clampf(acc[i], -32767.f, 32767.f);
}
static DWORD WINAPI proc(LPVOID) {
    while (run) {
        for (int i = 0; i < NBUF; i++)
            if (hdr[i].dwFlags & WHDR_DONE) {
                mixInto(bufs[i]);
                hdr[i].dwFlags &= ~WHDR_DONE;
                waveOutWrite(wo, &hdr[i], sizeof(WAVEHDR));
            }
        Sleep(4);
    }
    return 0;
}
static void init() {
    InitializeCriticalSection(&cs);
    gen();
    WAVEFORMATEX f = {};
    f.wFormatTag = WAVE_FORMAT_PCM; f.nChannels = 1; f.nSamplesPerSec = RATE; f.wBitsPerSample = 16;
    f.nBlockAlign = 2; f.nAvgBytesPerSec = RATE * 2;
    if (waveOutOpen(&wo, WAVE_MAPPER, &f, 0, 0, CALLBACK_NULL) != MMSYSERR_NOERROR) { wo = nullptr; return; }
    for (int i = 0; i < NBUF; i++) {
        hdr[i] = WAVEHDR();
        hdr[i].lpData = (LPSTR)bufs[i]; hdr[i].dwBufferLength = BUF * 2;
        waveOutPrepareHeader(wo, &hdr[i], sizeof(WAVEHDR));
        mixInto(bufs[i]);
        waveOutWrite(wo, &hdr[i], sizeof(WAVEHDR));
    }
    run = true;
    th = CreateThread(nullptr, 0, proc, nullptr, 0, nullptr);
}
static void play(int id, float vol = 1.f) {
    if (!wo || muted) return;
    EnterCriticalSection(&cs);
    if (voices.size() < 12) voices.push_back({ id, 0, clampf(vol, 0.f, 1.5f) });
    LeaveCriticalSection(&cs);
}
static void shutdown() {
    if (!wo) return;
    run = false;
    if (th) { WaitForSingleObject(th, 500); CloseHandle(th); }
    waveOutReset(wo);
    for (int i = 0; i < NBUF; i++) waveOutUnprepareHeader(wo, &hdr[i], sizeof(WAVEHDR));
    waveOutClose(wo);
    wo = nullptr;
}
} // namespace audio

// ============================================================ sauvegarde
static std::wstring savePath() {
    wchar_t p[MAX_PATH];
    GetModuleFileNameW(nullptr, p, MAX_PATH);
    std::wstring s = p;
    size_t k = s.find_last_of(L"\\/");
    std::wstring dir = k == std::wstring::npos ? L"." : s.substr(0, k);
    std::wstring f = dir + L"\\travee_sauvegarde.txt";
    // dossier non inscriptible ? on passe par %APPDATA%
    HANDLE h = CreateFileW(f.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h != INVALID_HANDLE_VALUE) { CloseHandle(h); return f; }
    wchar_t ad[MAX_PATH];
    if (GetEnvironmentVariableW(L"APPDATA", ad, MAX_PATH)) {
        std::wstring d = std::wstring(ad) + L"\\Travee";
        CreateDirectoryW(d.c_str(), nullptr);
        return d + L"\\travee_sauvegarde.txt";
    }
    return f;
}

static void saveGame() {
    if (gScr != SCR_MENU && gCur < (int)gSaved.size()) gSaved[gCur] = gDesign;
    FILE* f = _wfopen(savePath().c_str(), L"w");
    if (!f) return;
    fprintf(f, "TRAVEE 1\n");
    for (size_t i = 0; i < gLevels.size(); i++) {
        fprintf(f, "P %zu %d\n", i, gBest[i]);
        const Design& D = gSaved[i];
        fprintf(f, "D %zu %zu %zu\n", i, D.nodes.size(), D.beams.size());
        for (auto& n : D.nodes) fprintf(f, "%.4f %.4f %d\n", n.p.x, n.p.y, n.anchor ? 1 : 0);
        for (auto& b : D.beams) fprintf(f, "%d %d %d %.3f\n", b.a, b.b, b.mat, b.ext);
    }
    fclose(f);
}

static bool validDesign(const Design& D, const Level& L) {
    if (D.nodes.size() < L.anchors.size()) return false;
    for (size_t i = 0; i < L.anchors.size(); i++)
        if (!D.nodes[i].anchor || len(D.nodes[i].p - L.anchors[i]) > 1e-3f) return false;
    for (size_t i = L.anchors.size(); i < D.nodes.size(); i++) if (D.nodes[i].anchor) return false;
    for (auto& b : D.beams) {
        if (b.a < 0 || b.b < 0 || b.a >= (int)D.nodes.size() || b.b >= (int)D.nodes.size() || b.a == b.b) return false;
        if (b.mat < 0 || b.mat >= M_COUNT || !((L.mats >> b.mat) & 1)) return false;
        if (D.beamLen(b) > mat(b.mat).maxLen + 0.01f) return false;
    }
    return true;
}

static void loadGame() {
    gSaved.clear(); gBest.assign(gLevels.size(), -1);
    for (auto& L : gLevels) gSaved.push_back(initialDesign(L));
    FILE* f = _wfopen(savePath().c_str(), L"r");
    if (!f) { gFirstRun = true; return; }
    char tag[16] = {};
    int ver = 0;
    if (fscanf(f, "%15s %d", tag, &ver) != 2 || strcmp(tag, "TRAVEE") != 0) { fclose(f); gFirstRun = true; return; }
    char t[4];
    while (fscanf(f, "%3s", t) == 1) {
        if (!strcmp(t, "P")) {
            int i, b;
            if (fscanf(f, "%d %d", &i, &b) != 2) break;
            if (i >= 0 && i < (int)gLevels.size()) gBest[i] = b;
        } else if (!strcmp(t, "D")) {
            int i; size_t nn, nb;
            if (fscanf(f, "%d %zu %zu", &i, &nn, &nb) != 3 || nn > 5000 || nb > 10000) break;
            Design D;
            bool ok = true;
            for (size_t k = 0; k < nn && ok; k++) {
                DNode n; int a;
                ok = fscanf(f, "%f %f %d", &n.p.x, &n.p.y, &a) == 3; n.anchor = a != 0;
                D.nodes.push_back(n);
            }
            for (size_t k = 0; k < nb && ok; k++) {
                DBeam b;
                ok = fscanf(f, "%d %d %d %f", &b.a, &b.b, &b.mat, &b.ext) == 4;
                D.beams.push_back(b);
            }
            if (!ok) break;
            if (i >= 0 && i < (int)gLevels.size() && validDesign(D, gLevels[i])) gSaved[i] = D;
        } else break;
    }
    fclose(f);
}

// ============================================================ dessin : bases
static void addRoundRect(GraphicsPath& p, float x, float y, float w, float h, float r) {
    r = std::min(r, std::min(w, h) * 0.5f);
    float d = r * 2;
    p.AddArc(x, y, d, d, 180, 90);
    p.AddArc(x + w - d, y, d, d, 270, 90);
    p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
    p.AddArc(x, y + h - d, d, d, 90, 90);
    p.CloseFigure();
}
static void fillRound(Graphics& g, float x, float y, float w, float h, float r, Color c) {
    GraphicsPath p; addRoundRect(p, x, y, w, h, r);
    SolidBrush b(c); g.FillPath(&b, &p);
}
static void strokeRound(Graphics& g, float x, float y, float w, float h, float r, Color c, float width) {
    GraphicsPath p; addRoundRect(p, x, y, w, h, r);
    Pen pen(c, width); g.DrawPath(&pen, &p);
}
static void text(Graphics& g, const std::wstring& s, Font* f, float x, float y, Color c, int align = 0, int valign = 0) {
    StringFormat sf;
    sf.SetAlignment(align == 0 ? StringAlignmentNear : align == 1 ? StringAlignmentCenter : StringAlignmentFar);
    sf.SetLineAlignment(valign == 0 ? StringAlignmentNear : valign == 1 ? StringAlignmentCenter : StringAlignmentFar);
    SolidBrush b(c);
    g.DrawString(s.c_str(), -1, f, PointF(x, y), &sf, &b);
}
static void textBox(Graphics& g, const std::wstring& s, Font* f, RectF r, Color c, int align = 0, bool ellipsis = false) {
    StringFormat sf;
    sf.SetAlignment(align == 0 ? StringAlignmentNear : align == 1 ? StringAlignmentCenter : StringAlignmentFar);
    if (ellipsis) { sf.SetTrimming(StringTrimmingEllipsisCharacter); sf.SetFormatFlags(StringFormatFlagsNoWrap); }
    SolidBrush b(c);
    g.DrawString(s.c_str(), -1, f, r, &sf, &b);
}
static float textW(Graphics& g, const std::wstring& s, Font* f) {
    RectF out;
    g.MeasureString(s.c_str(), -1, f, PointF(0, 0), &out);
    return out.Width;
}
static void line(Graphics& g, PointF a, PointF b, Color c, float w, bool round = true) {
    Pen p(c, w);
    if (round) { p.SetStartCap(LineCapRound); p.SetEndCap(LineCapRound); }
    g.DrawLine(&p, a, b);
}
static void disc(Graphics& g, PointF c, float r, Color col) {
    SolidBrush b(col); g.FillEllipse(&b, c.X - r, c.Y - r, r * 2, r * 2);
}
static void ring(Graphics& g, PointF c, float r, Color col, float w) {
    Pen p(col, w); g.DrawEllipse(&p, c.X - r, c.Y - r, r * 2, r * 2);
}
static void star(Graphics& g, float cx, float cy, float r, Color fill, Color outline) {
    PointF pts[10];
    for (int i = 0; i < 10; i++) {
        float a = -1.5707963f + i * 0.6283185f, rr = (i & 1) ? r * 0.45f : r;
        pts[i] = PointF(cx + std::cos(a) * rr, cy + std::sin(a) * rr);
    }
    SolidBrush b(fill); g.FillPolygon(&b, pts, 10);
    Pen p(outline, 1.2f); g.DrawPolygon(&p, pts, 10);
}

// boutons (mode immédiat)
static bool hit(const RectF& r, float x, float y) { return x >= r.X && x <= r.X + r.Width && y >= r.Y && y <= r.Y + r.Height; }
static void regBtn(int id, RectF r) { gBtns.push_back({ id, r }); }
static void button(Graphics& g, int id, RectF r, const std::wstring& label, uint32_t col, bool active = false, Font* f = nullptr, bool enabled = true) {
    bool hot = enabled && hit(r, gMx, gMy);
    bool down = hot && gPressBtn == id;
    uint32_t c = enabled ? col : 0xFF7A8290;
    if (active) c = mix(c, 0xFFFFFFFF, 0.18f);
    if (hot) c = mix(c, 0xFFFFFFFF, 0.12f);
    if (down) c = shade(c, 0.85f);
    fillRound(g, r.X, r.Y + 2, r.Width, r.Height, 9, CA(0x000000, 60));
    fillRound(g, r.X, r.Y + (down ? 1.f : 0.f), r.Width, r.Height, 9, C(c));
    if (active) strokeRound(g, r.X + 1, r.Y + 1, r.Width - 2, r.Height - 2, 8, CA(0xFFFFFF, 220), 2);
    if (!label.empty())
        textBox(g, label, f ? f : fH2, RectF(r.X + 4, r.Y + r.Height * 0.5f - 11 + (down ? 1.f : 0.f), r.Width - 8, 24), C(enabled ? 0xFFFFFFFF : 0xFFD0D4DA), 1, true);
    if (enabled) regBtn(id, r);
}

// ============================================================ dessin : décor
static void buildTrees(const Level& L) {
    gTrees.clear();
    uint32_t r = 777u + (uint32_t)gCur * 131u;
    float bx0 = 1e9f, bx1 = -1e9f;
    for (auto& a : L.anchors) { bx0 = std::min(bx0, a.x); bx1 = std::max(bx1, a.x); }
    for (auto& P : L.terrain) {
        size_t n = P.pts.size();
        for (size_t i = 0; i < n; i++) {
            V2 a = P.pts[i], b = P.pts[(i + 1) % n], e = b - a;
            V2 nrm = normz(V2(e.y, -e.x));
            if (nrm.y < 0.8f) continue;
            float x0 = std::min(a.x, b.x), x1 = std::max(a.x, b.x);
            x0 = std::max(x0, L.vx0 - 40); x1 = std::min(x1, L.vx1 + 40);
            for (float x = x0 + 1.5f + frand(r) * 3; x < x1 - 1; x += 3.f + frand(r) * 5) {
                if (x > bx0 - 4 && x < bx1 + 4) continue;
                if (std::fabs(x - L.spawnX[0]) < 1 || std::fabs(x - L.goalX[0]) < 2.5f || std::fabs(x - L.goalX[1]) < 2.5f) continue;
                float t = (x - a.x) / (b.x - a.x);
                Tree tr; tr.x = x; tr.y = a.y + (b.y - a.y) * t; tr.s = 0.8f + frand(r) * 0.7f; tr.kind = (int)(frand(r) * 3);
                gTrees.push_back(tr);
            }
        }
    }
}

static void drawTree(Graphics& g, const Tree& t, const Theme& T) {
    float s = t.s;
    PointF base = S(V2(t.x, t.y));
    float z = gZoom * s;
    switch (T.treeKind) {
    case 0: {
        line(g, base, PointF(base.X, base.Y - 1.6f * z), C(T.trunk), std::max(2.f, 0.22f * z));
        uint32_t lc = t.kind == 0 ? T.leaf : (t.kind == 1 ? shade(T.leaf, 0.85f) : mix(T.leaf, 0xFFB5D96B, 0.3f));
        disc(g, PointF(base.X, base.Y - 2.2f * z), 0.95f * z, C(shade(lc, 0.85f)));
        disc(g, PointF(base.X - 0.5f * z, base.Y - 1.8f * z), 0.7f * z, C(lc));
        disc(g, PointF(base.X + 0.55f * z, base.Y - 1.9f * z), 0.65f * z, C(lc));
        disc(g, PointF(base.X + 0.1f * z, base.Y - 2.6f * z), 0.6f * z, C(mix(lc, 0xFFFFFFFF, 0.12f)));
        break;
    }
    case 1: {
        uint32_t c = T.leaf;
        float w = 0.32f * z;
        line(g, base, PointF(base.X, base.Y - 2.0f * z), C(c), w);
        line(g, PointF(base.X, base.Y - 1.0f * z), PointF(base.X - 0.55f * z, base.Y - 1.0f * z), C(c), w * 0.8f);
        line(g, PointF(base.X - 0.55f * z, base.Y - 1.0f * z), PointF(base.X - 0.55f * z, base.Y - 1.6f * z), C(c), w * 0.8f);
        line(g, PointF(base.X, base.Y - 1.3f * z), PointF(base.X + 0.5f * z, base.Y - 1.3f * z), C(c), w * 0.8f);
        line(g, PointF(base.X + 0.5f * z, base.Y - 1.3f * z), PointF(base.X + 0.5f * z, base.Y - 1.75f * z), C(c), w * 0.8f);
        if (t.kind == 0) disc(g, PointF(base.X, base.Y - 2.05f * z), 0.12f * z, C(0xFFF06292));
        break;
    }
    default: {
        line(g, base, PointF(base.X, base.Y - 0.6f * z), C(T.trunk), std::max(2.f, 0.2f * z));
        uint32_t c = T.leaf;
        for (int k = 0; k < 3; k++) {
            float y0 = base.Y - (0.4f + k * 0.75f) * z, hw = (1.0f - k * 0.25f) * z;
            PointF tri[3] = { PointF(base.X - hw, y0), PointF(base.X + hw, y0), PointF(base.X, y0 - 1.25f * z) };
            SolidBrush b(C(k == 1 ? shade(c, 0.9f) : c)); g.FillPolygon(&b, tri, 3);
            if (T.treeKind == 2) {
                PointF cap[3] = { PointF(base.X - hw * 0.35f, y0 - 0.85f * z), PointF(base.X + hw * 0.35f, y0 - 0.85f * z), PointF(base.X, y0 - 1.25f * z) };
                SolidBrush w(C(0xFFF7FBFF)); g.FillPolygon(&w, cap, 3);
            }
        }
        break;
    }
    }
}

static void drawSky(Graphics& g, const Theme& T, const Level& L) {
    LinearGradientBrush br(PointF(0, 0), PointF(0, (REAL)gH + 1), C(T.sky0), C(T.sky1));
    g.FillRectangle(&br, 0, 0, gW, gH);
    // soleil
    float sx = gW * 0.78f - gCamX * 0.6f, sy = gH * (T.treeKind == 3 ? 0.55f : 0.2f);
    for (int k = 4; k >= 1; k--) disc(g, PointF(sx, sy), 30.f + k * 16.f, CA(T.sun, 18));
    disc(g, PointF(sx, sy), 34, C(T.sun));
    // nuages
    for (int i = 0; i < 6; i++) {
        float spd = 4.f + i * 1.3f;
        float span = gW + 400.f;
        float x = std::fmod(i * 397.f + gTime * spd - gCamX * gZoom * 0.15f, span);
        if (x < 0) x += span;
        x -= 200;
        float y = 50.f + (i * 53) % 170;
        float s = 0.7f + (i % 3) * 0.25f;
        Color c = T.treeKind == 3 ? CA(0xFFD9C2, 70) : CA(0xFFFFFF, 190);
        SolidBrush b(c);
        g.FillEllipse(&b, x, y, 120 * s, 34 * s);
        g.FillEllipse(&b, x + 22 * s, y - 18 * s, 70 * s, 44 * s);
        g.FillEllipse(&b, x + 58 * s, y - 8 * s, 56 * s, 34 * s);
    }
    // collines en parallaxe
    float base = S(V2(0, L.waterY + 1.0f)).Y;
    for (int layer = 0; layer < 2; layer++) {
        float par = layer == 0 ? 0.25f : 0.5f;
        float amp = (layer == 0 ? 4.2f : 2.6f) * std::min(gZoom, 40.f);
        std::vector<PointF> pts;
        pts.push_back(PointF(0, (REAL)gH));
        for (int sx2 = 0; sx2 <= gW + 16; sx2 += 16) {
            float u = (sx2 - gW * 0.5f) / std::max(gZoom, 10.f) + gCamX * (1 - par) + layer * 40;
            float h = 0.55f + 0.22f * std::sin(u * 0.09f + layer) + 0.14f * std::sin(u * 0.21f + 2.0f * layer) + 0.09f * std::sin(u * 0.043f);
            pts.push_back(PointF((REAL)sx2, base - h * amp - (layer == 0 ? 0.25f * amp : 0)));
        }
        pts.push_back(PointF((REAL)gW + 16, (REAL)gH));
        SolidBrush b(C(mix(layer == 0 ? T.hillFar : T.hillMid, T.sky1, layer == 0 ? 0.45f : 0.25f)));
        g.FillPolygon(&b, pts.data(), (INT)pts.size());
    }
}

static void terrainPath(GraphicsPath& path, const Poly& P) {
    std::vector<PointF> pts;
    for (auto& p : P.pts) pts.push_back(S(p));
    path.AddPolygon(pts.data(), (INT)pts.size());
}

static void drawTerrain(Graphics& g, const Level& L, bool build) {
    const Theme& T = THEMES[L.theme];
    for (auto& P : L.terrain) {
        GraphicsPath path;
        terrainPath(path, P);
        if (build) {
            SolidBrush b(C(0xFF34445E));
            g.FillPath(&b, &path);
            Pen p(C(0xFF6F86AB), 1.5f);
            g.DrawPath(&p, &path);
            continue;
        }
        PointF top = S(V2(0, P.maxy)), bot = S(V2(0, std::max(P.miny, L.waterY - 12)));
        LinearGradientBrush b(PointF(0, top.Y - 1), PointF(0, bot.Y + 1), C(T.ground0), C(T.ground1));
        b.SetWrapMode(WrapModeTileFlipX);
        g.FillPath(&b, &path);
        // strates
        g.SetClip(&path);
        for (int k = 1; k < 14; k++) {
            float y = P.maxy - k * 1.6f;
            PointF a = S(V2(P.minx, y)), c = S(V2(P.maxx, y));
            line(g, a, c, CA(0x000000, 22), std::max(1.f, 0.25f * gZoom), false);
        }
        g.ResetClip();
        // herbe / neige / sable sur les dessus
        size_t n = P.pts.size();
        for (size_t i = 0; i < n; i++) {
            V2 a = P.pts[i], c = P.pts[(i + 1) % n], e = c - a;
            V2 nrm = normz(V2(e.y, -e.x));
            if (nrm.y < 0.9f) continue;
            V2 off = V2(0, -0.12f);
            line(g, S(a + off), S(c + off), C(T.grass), std::max(3.f, 0.38f * gZoom));
            line(g, S(a + V2(0, 0.02f)), S(c + V2(0, 0.02f)), C(mix(T.grass, 0xFFFFFFFF, 0.25f)), std::max(1.f, 0.07f * gZoom));
        }
    }
}

static void drawWater(Graphics& g, const Level& L, bool build, bool front) {
    const Theme& T = THEMES[L.theme];
    float wy = S(V2(0, L.waterY)).Y;
    if (wy > gH) return;
    if (build) {
        if (front) return;
        SolidBrush b(CA(0x3A6EA5, 90));
        g.FillRectangle(&b, 0.f, wy, (REAL)gW, gH - wy);
        line(g, PointF(0, wy), PointF((REAL)gW, wy), CA(0x7FB2E5, 200), 2, false);
        return;
    }
    if (!front) {
        LinearGradientBrush b(PointF(0, wy - 1), PointF(0, (REAL)gH + 1), C(T.water0), C(T.water1));
        g.FillRectangle(&b, 0.f, wy, (REAL)gW, gH - wy + 1);
        return;
    }
    SolidBrush ov(CA(T.water0, 95));
    g.FillRectangle(&ov, 0.f, wy, (REAL)gW, gH - wy + 1);
    std::vector<PointF> wave;
    for (int x = -10; x <= gW + 20; x += 12) {
        float u = Wd((float)x, 0).x;
        wave.push_back(PointF((REAL)x, wy + std::sin(u * 1.3f + gTime * 2.2f) * std::max(1.f, 0.06f * gZoom)));
    }
    Pen p(CA(0xFFFFFF, 170), std::max(1.5f, 0.07f * gZoom));
    g.DrawLines(&p, wave.data(), (INT)wave.size());
}

static void drawPylons(Graphics& g, const Level& L, bool build) {
    for (auto& p : L.pylons) {
        PointF a = S(V2(p.x, p.y0)), b = S(V2(p.x, p.y1));
        float w = 0.8f * gZoom;
        if (build) {
            Pen pen(CA(0x8FA3C0, 160), 1.5f); pen.SetDashStyle(DashStyleDash);
            g.DrawRectangle(&pen, a.X - w * 0.5f, b.Y, w, a.Y - b.Y);
            continue;
        }
        PointF quad[4] = { PointF(a.X - w * 0.6f, a.Y), PointF(a.X + w * 0.6f, a.Y), PointF(b.X + w * 0.35f, b.Y), PointF(b.X - w * 0.35f, b.Y) };
        SolidBrush br(C(0xFF8C8F99)); g.FillPolygon(&br, quad, 4);
        Pen pen(C(0xFF5E616B), 1.5f); g.DrawPolygon(&pen, quad, 4);
        for (float y = p.y0 + 1.2f; y < p.y1 - 0.5f; y += 1.5f) {
            float t = (y - p.y0) / (p.y1 - p.y0);
            float hw = lerpf(w * 0.6f, w * 0.35f, t);
            PointF c = S(V2(p.x, y));
            line(g, PointF(c.X - hw, c.Y), PointF(c.X + hw, c.Y), C(0xFF6E717B), std::max(1.f, 0.06f * gZoom), false);
        }
        fillRound(g, b.X - w * 0.55f, b.Y - 0.25f * gZoom, w * 1.1f, 0.35f * gZoom, 3, C(0xFF6E717B));
    }
}

static void drawFlags(Graphics& g, const Level& L) {
    bool used[2] = { false, false };
    for (auto& s : L.spawns) used[s.dir > 0 ? 0 : 1] = true;
    for (int d = 0; d < 2; d++) {
        if (!used[d]) continue;
        float x = L.goalX[d];
        float y = terrainTopY(L, x);
        PointF a = S(V2(x, y)), b = S(V2(x, y + 2.6f));
        line(g, a, b, C(0xFFECEFF1), std::max(2.f, 0.09f * gZoom));
        float fw = 1.1f * gZoom * (d == 0 ? 1 : -1), fh = 0.7f * gZoom;
        float wav = std::sin(gTime * 4 + d) * 0.08f * gZoom;
        PointF fl[4] = { b, PointF(b.X + fw, b.Y + wav), PointF(b.X + fw, b.Y + fh + wav), PointF(b.X, b.Y + fh) };
        SolidBrush br(C(0xFF2ECC71)); g.FillPolygon(&br, fl, 4);
        // damier
        SolidBrush w(C(0xFFFFFFFF));
        for (int i = 0; i < 4; i++) for (int j = 0; j < 2; j++) if ((i + j) & 1) {
            float u0 = i / 4.f, u1 = (i + 1) / 4.f, v0 = j / 2.f, v1 = (j + 1) / 2.f;
            auto P = [&](float u, float v) { return PointF(b.X + fw * u, b.Y + wav * u + fh * v); };
            PointF q[4] = { P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1) };
            g.FillPolygon(&w, q, 4);
        }
    }
}

// ============================================================ dessin : pont
static uint32_t stressColor(float s) {
    s = clampf(s, 0, 1.2f);
    if (s < 0.5f) return mix(0xFF43A047, 0xFFFDD835, s / 0.5f);
    return mix(0xFFFDD835, 0xFFE53935, std::min(1.f, (s - 0.5f) / 0.5f));
}

static void drawBeam(Graphics& g, V2 a, V2 b, int m, float base, float stress, bool stressMode, bool build, int style /*0 normal,1 ghost ok,2 ghost bad,3 hover*/, bool broken) {
    PointF A = S(a), B = S(b);
    const float z = gZoom;
    int alpha = style == 1 ? 170 : (style == 2 ? 150 : 255);
    auto col = [&](uint32_t c) { return style == 2 ? CA(0xFF5252, alpha) : CA(c, alpha); };
    bool sm = stressMode && style == 0;
    uint32_t sc = stressColor(stress);
    if (style == 3) line(g, A, B, CA(0xFFFFFF, 140), std::max(6.f, 0.34f * z) + 6);
    switch (m) {
    case M_ROAD:
    case M_ROAD_HEAVY: {
        float w = std::max(4.f, 2 * ROAD_HALF * z);
        line(g, A, B, col(sm ? shade(sc, 0.55f) : 0xFF2E3138), w);
        line(g, A, B, col(sm ? sc : (m == M_ROAD ? 0xFF4A4E57 : 0xFF51443A)), w * 0.62f);
        V2 d = normz(b - a), n = perp(d); if (n.y < 0) n = -n;
        V2 o = n * (ROAD_HALF * 0.78f);
        line(g, S(a + o), S(b + o), col(m == M_ROAD ? 0xFFE6E6E6 : 0xFFF2994A), std::max(1.f, 0.045f * z), false);
        if (m == M_ROAD_HEAVY) line(g, S(a - o), S(b - o), col(0xFFF2994A), std::max(1.f, 0.045f * z), false);
        break;
    }
    case M_WOOD: {
        float w = std::max(3.f, 0.16f * z);
        line(g, A, B, col(sm ? shade(sc, 0.6f) : 0xFF7A5230), w + 2);
        line(g, A, B, col(sm ? sc : 0xFFC9914F), w);
        break;
    }
    case M_STEEL: {
        float w = std::max(3.f, 0.19f * z);
        line(g, A, B, col(sm ? shade(sc, 0.6f) : 0xFF253F60), w + 2);
        line(g, A, B, col(sm ? sc : 0xFF4F86C6), w);
        line(g, A, B, col(sm ? mix(sc, 0xFFFFFFFF, 0.4f) : 0xFF8DB7E8), std::max(1.f, w * 0.25f));
        break;
    }
    case M_ROPE: {
        float w = std::max(1.5f, 0.06f * z);
        line(g, A, B, col(sm ? sc : 0xFFD8BE85), w);
        break;
    }
    case M_CABLE: {
        float w = std::max(1.5f, 0.07f * z);
        line(g, A, B, col(sm ? sc : (build ? 0xFFAAB6C4 : 0xFF2F353E)), w);
        break;
    }
    case M_SPRING: {
        float L = len(b - a);
        V2 d = normz(b - a), n = perp(d);
        int coils = std::max(3, (int)(L * 4));
        std::vector<PointF> pts;
        pts.push_back(A);
        V2 p0 = a + d * (L * 0.12f);
        pts.push_back(S(p0));
        float span = L * 0.76f;
        for (int i = 0; i < coils * 2; i++) {
            float t = (i + 0.5f) / (coils * 2);
            pts.push_back(S(p0 + d * (span * t) + n * ((i & 1) ? 0.13f : -0.13f)));
        }
        pts.push_back(S(a + d * (L * 0.88f)));
        pts.push_back(B);
        Pen p(col(sm ? sc : 0xFF7CB342), std::max(1.5f, 0.05f * z));
        p.SetLineJoin(LineJoinRound);
        g.DrawLines(&p, pts.data(), (INT)pts.size());
        break;
    }
    case M_HYD: {
        float L = len(b - a);
        float cyl = std::min(L, base * 0.58f);
        V2 d = normz(b - a);
        PointF M = S(a + d * cyl);
        line(g, A, B, col(sm ? mix(sc, 0xFFFFFFFF, 0.5f) : 0xFFCFD8DC), std::max(1.5f, 0.07f * z));
        line(g, A, M, col(sm ? shade(sc, 0.6f) : 0xFF8A6512), std::max(4.f, 0.22f * z) + 2);
        line(g, A, M, col(sm ? sc : 0xFFF2B233), std::max(4.f, 0.22f * z));
        break;
    }
    }
    if (broken) {
        disc(g, B, std::max(2.f, 0.06f * z), CA(0x3E2723, alpha));
    }
}

static void drawJoint(Graphics& g, V2 p, bool anchor, bool build, bool hover) {
    PointF c = S(p);
    if (anchor) {
        float r = std::max(4.f, 0.17f * gZoom);
        if (hover) disc(g, c, r + 4, CA(0xFFFFFF, 120));
        disc(g, c, r, C(0xFFE5484D));
        ring(g, c, r, C(0xFF7A1E22), 1.5f);
        disc(g, c, r * 0.35f, C(0xFFFFE0E0));
    } else {
        float r = std::max(build ? 3.5f : 2.2f, (build ? 0.12f : 0.085f) * gZoom);
        if (hover) disc(g, c, r + 4, CA(0xFFFFFF, 140));
        disc(g, c, r, C(0xFFF4F1EA));
        ring(g, c, r, C(0xFF2B2B2B), 1.2f);
    }
}

// ============================================================ dessin : véhicules
struct VX {
    V2 o, ax, ay;
    PointF operator()(float lx, float ly) const { return S(o + ax * lx + ay * ly); }
};
static void vpoly(Graphics& g, const VX& X, std::initializer_list<float> xy, Color fill, Color edge, float ew = 1.2f) {
    std::vector<PointF> pts;
    auto it = xy.begin();
    while (it != xy.end()) { float x = *it++; float y = *it++; pts.push_back(X(x, y)); }
    SolidBrush b(fill); g.FillPolygon(&b, pts.data(), (INT)pts.size());
    if (ew > 0) { Pen p(edge, ew); p.SetLineJoin(LineJoinRound); g.DrawPolygon(&p, pts.data(), (INT)pts.size()); }
}
static void drawWheel(Graphics& g, V2 c, float r, float ang) {
    PointF C0 = S(c);
    float R = r * gZoom;
    disc(g, C0, R, C(0xFF1E1F22));
    disc(g, C0, R * 0.55f, C(0xFFB0BEC5));
    for (int k = 0; k < 3; k++) {
        float a = ang + k * 2.0943951f;
        line(g, C0, PointF(C0.X + std::cos(a) * R * 0.5f, C0.Y - std::sin(a) * R * 0.5f), C(0xFF607D8B), std::max(1.f, R * 0.14f));
    }
    disc(g, C0, R * 0.16f, C(0xFF455A64));
}

static void drawBody(Graphics& g, const Sim& sim, const Vehicle& v, int bi) {
    V2 o, ax, ay;
    sim.bodyFrame(v, bi, o, ax, ay);
    VX X{ o, ax, ay };
    const Body& B = v.body[bi];
    const VehType& T = vtype(B.type);
    Color body = C(v.color), edge = C(shade(v.color, 0.55f)), glass = C(0xFFBFE6F7), dark = C(0xFF37474F);
    switch (B.type) {
    case V_CAR:
        vpoly(g, X, { 0.05f,0.1f, 0.0f,0.62f, 0.35f,0.78f, 3.25f,0.78f, 3.6f,0.5f, 3.6f,0.12f, 3.4f,0.0f, 0.2f,0.0f }, body, edge);
        vpoly(g, X, { 0.75f,0.76f, 1.15f,1.38f, 2.45f,1.38f, 2.95f,0.76f }, body, edge);
        vpoly(g, X, { 0.95f,0.8f, 1.25f,1.28f, 1.72f,1.28f, 1.72f,0.8f }, glass, edge, 0.8f);
        vpoly(g, X, { 1.82f,0.8f, 1.82f,1.28f, 2.4f,1.28f, 2.78f,0.8f }, glass, edge, 0.8f);
        disc(g, X(3.52f, 0.5f), std::max(1.5f, 0.08f * gZoom), C(0xFFFFF59D));
        disc(g, X(0.06f, 0.5f), std::max(1.5f, 0.07f * gZoom), C(0xFFE53935));
        break;
    case V_MOTO: {
        vpoly(g, X, { 0.25f,0.15f, 0.75f,0.45f, 1.55f,0.4f, 1.8f,0.62f, 1.35f,0.68f, 0.55f,0.62f }, body, edge);
        line(g, X(1.7f, 0.0f), X(1.5f, 0.75f), dark, std::max(1.5f, 0.07f * gZoom));
        line(g, X(0.95f, 0.65f), X(1.15f, 1.3f), C(0xFF263238), std::max(2.f, 0.2f * gZoom));
        line(g, X(1.15f, 1.25f), X(1.55f, 0.85f), C(0xFF263238), std::max(1.5f, 0.1f * gZoom));
        line(g, X(0.95f, 0.65f), X(1.25f, 0.35f), C(0xFF37474F), std::max(1.5f, 0.12f * gZoom));
        disc(g, X(1.2f, 1.55f), 0.22f * gZoom, body);
        disc(g, X(1.27f, 1.55f), 0.1f * gZoom, glass);
        break;
    }
    case V_VAN:
        vpoly(g, X, { 0.0f,0.05f, 0.0f,1.95f, 3.55f,1.95f, 4.35f,1.15f, 4.8f,1.0f, 4.8f,0.1f, 4.6f,0.0f, 0.2f,0.0f }, body, edge);
        vpoly(g, X, { 3.6f,1.85f, 4.22f,1.2f, 3.6f,1.2f }, glass, edge, 0.8f);
        vpoly(g, X, { 2.7f,1.25f, 2.7f,1.8f, 3.45f,1.8f, 3.45f,1.25f }, glass, edge, 0.8f);
        line(g, X(0.2f, 1.05f), X(2.55f, 1.05f), CA(0xFFFFFF, 120), std::max(1.f, 0.12f * gZoom), false);
        disc(g, X(4.72f, 0.65f), std::max(1.5f, 0.09f * gZoom), C(0xFFFFF59D));
        break;
    case V_JEEP:
        vpoly(g, X, { 0.0f,0.25f, 0.0f,1.0f, 1.05f,1.05f, 1.45f,1.75f, 2.95f,1.75f, 3.25f,1.05f, 4.0f,0.95f, 4.0f,0.25f, 3.7f,0.1f, 0.3f,0.1f }, body, edge);
        vpoly(g, X, { 1.55f,1.12f, 1.75f,1.62f, 2.2f,1.62f, 2.2f,1.12f }, glass, edge, 0.8f);
        vpoly(g, X, { 2.3f,1.12f, 2.3f,1.62f, 2.85f,1.62f, 3.05f,1.12f }, glass, edge, 0.8f);
        line(g, X(0.2f, 1.0f), X(0.6f, 1.6f), dark, std::max(1.5f, 0.1f * gZoom));
        line(g, X(0.6f, 1.6f), X(1.45f, 1.75f), dark, std::max(1.5f, 0.1f * gZoom));
        disc(g, X(3.95f, 0.65f), std::max(1.5f, 0.1f * gZoom), C(0xFFFFF59D));
        break;
    case V_BUS:
        vpoly(g, X, { 0.0f,0.05f, 0.0f,2.65f, 8.6f,2.65f, 9.0f,2.25f, 9.0f,0.1f, 8.8f,0.0f, 0.2f,0.0f }, body, edge);
        for (float x = 0.5f; x < 7.8f; x += 1.05f) vpoly(g, X, { x,1.45f, x,2.35f, x + 0.85f,2.35f, x + 0.85f,1.45f }, glass, edge, 0.7f);
        vpoly(g, X, { 8.05f,1.45f, 8.05f,2.4f, 8.75f,2.3f, 8.92f,1.45f }, glass, edge, 0.7f);
        vpoly(g, X, { 7.95f,0.25f, 7.95f,1.35f, 8.7f,1.35f, 8.7f,0.25f }, C(shade(v.color, 0.8f)), edge, 0.7f);
        line(g, X(0.1f, 1.2f), X(7.8f, 1.2f), CA(0xFFFFFF, 150), std::max(1.f, 0.1f * gZoom), false);
        break;
    case V_TRUCK:
        vpoly(g, X, { 0.0f,0.25f, 7.0f,0.25f, 7.0f,0.55f, 0.0f,0.55f }, dark, dark, 0);
        vpoly(g, X, { 5.2f,0.1f, 5.2f,2.4f, 6.4f,2.4f, 7.0f,1.5f, 7.0f,0.1f }, body, edge);
        vpoly(g, X, { 5.45f,1.45f, 5.45f,2.2f, 6.3f,2.2f, 6.75f,1.45f }, glass, edge, 0.8f);
        vpoly(g, X, { 0.0f,0.55f, 0.1f,2.15f, 5.0f,2.15f, 4.9f,0.55f }, C(0xFFF9A825), C(0xFF8D6E00));
        for (float x = 0.8f; x < 4.8f; x += 1.0f) line(g, X(x, 0.6f), X(x, 2.1f), C(0xFFC17900), std::max(1.f, 0.06f * gZoom), false);
        vpoly(g, X, { 0.3f,2.15f, 1.0f,2.55f, 4.0f,2.55f, 4.7f,2.15f }, C(0xFF8D6E63), C(0xFF5D4037), 0.8f);
        break;
    case V_SEMI:
        vpoly(g, X, { 0.0f,0.25f, 4.6f,0.25f, 4.6f,0.55f, 0.0f,0.55f }, dark, dark, 0);
        vpoly(g, X, { 2.5f,0.1f, 2.5f,2.8f, 3.8f,2.8f, 4.6f,1.7f, 4.6f,0.1f }, body, edge);
        vpoly(g, X, { 2.75f,1.75f, 2.75f,2.6f, 3.7f,2.6f, 4.3f,1.75f }, glass, edge, 0.8f);
        line(g, X(2.35f, 0.6f), X(2.35f, 3.1f), dark, std::max(1.5f, 0.1f * gZoom));
        break;
    case V_TRAILER: {
        vpoly(g, X, { 0.0f,0.0f, 0.0f,2.9f, 9.0f,2.9f, 9.0f,0.0f }, C(0xFFECEFF1), C(0xFF90A4AE));
        line(g, X(0.0f, 0.6f), X(9.0f, 0.6f), body, std::max(2.f, 0.25f * gZoom), false);
        line(g, X(0.0f, 2.5f), X(9.0f, 2.5f), body, std::max(1.5f, 0.12f * gZoom), false);
        vpoly(g, X, { 1.2f,-0.35f, 1.2f,0.0f, 2.8f,0.0f, 2.8f,-0.35f }, dark, dark, 0);
        break;
    }
    }
    for (int k = 0; k < T.nw; k++) {
        V2 c = sim.parts[B.wheel[k]].x;
        drawWheel(g, c, T.w[k].r, -B.spin[k] * v.dir);
    }
}

static void drawVehicles(Graphics& g, const Sim& sim) {
    for (auto& v : sim.veh) {
        if (v.gone) continue;
        for (int bi = v.nb - 1; bi >= 0; bi--) drawBody(g, sim, v, bi);
    }
}

// ============================================================ dessin : bateau
static void drawBoat(Graphics& g, const Level& L, const BoatDef& b, float scale, int alpha, bool build) {
    auto shapes = boatShapes(b, L.waterY);
    auto P = [&](V2 p) { return S(V2(b.x + (p.x - b.x) * scale, L.waterY + (p.y - L.waterY) * scale)); };
    uint32_t cols[3] = { 0xFFC62828, 0xFFF5F5F5, 0xFF6D4C41 };
    for (size_t i = 0; i < shapes.size(); i++) {
        std::vector<PointF> pts;
        for (auto& p : shapes[i].pts) pts.push_back(P(p));
        if (build) {
            SolidBrush br(CA(0xFF5252, 45)); g.FillPolygon(&br, pts.data(), (INT)pts.size());
            Pen pen(CA(0xFF8A80, 200), 1.5f); pen.SetDashStyle(DashStyleDash);
            g.DrawPolygon(&pen, pts.data(), (INT)pts.size());
        } else {
            SolidBrush br(CA(cols[i], alpha)); g.FillPolygon(&br, pts.data(), (INT)pts.size());
            Pen pen(CA(shade(cols[i], 0.6f), alpha), 1.2f); g.DrawPolygon(&pen, pts.data(), (INT)pts.size());
        }
    }
    if (!build) {
        // hublots + drapeau
        for (int k = 0; k < 3; k++) disc(g, P(V2(b.x - b.width * 0.3f + k * 1.0f, L.waterY + 0.25f)), 0.12f * gZoom * scale, CA(0xFFFFFF, alpha));
        V2 top(b.x + 0.35f, L.waterY + b.mast);
        PointF f[3] = { P(top), P(top + V2(1.0f, -0.3f)), P(top + V2(0, -0.6f)) };
        SolidBrush fb(CA(0xFFFFC107, alpha)); g.FillPolygon(&fb, f, 3);
    }
}

static void drawBoats(Graphics& g, const Level& L, const Sim* sim, bool front, bool build) {
    for (size_t i = 0; i < L.boats.size(); i++) {
        const BoatDef& b = L.boats[i];
        if (build) { if (!front) drawBoat(g, L, b, 1, 255, true); continue; }
        float tt = b.time - sim->time;
        if (!front && tt > 0 && tt < 9) {
            float k = clampf(1 - tt / 9, 0, 1);
            drawBoat(g, L, b, 0.5f + 0.5f * k, (int)(80 + 175 * k), false);
        } else if (front && tt <= 0 && tt > -BOAT_PASS - 3) {
            float k = clampf((-tt - BOAT_PASS) / 3, 0, 1);
            drawBoat(g, L, b, 1 + k * 0.6f, (int)(255 * (1 - k)), false);
        }
    }
}

// ============================================================ scène complète
static void drawScene(Graphics& g, const Level& L, const Sim* sim, bool build, bool stressMode) {
    const Theme& T = THEMES[L.theme];
    if (build) {
        LinearGradientBrush br(PointF(0, 0), PointF(0, (REAL)gH + 1), C(0xFF1D2A40), C(0xFF141C2B));
        g.FillRectangle(&br, 0, 0, gW, gH);
        if (gShowGrid) {
            V2 w0 = Wd(0, (REAL)gH), w1 = Wd((REAL)gW, 0);
            float step = gZoom > 35 ? 0.5f : 1.f;
            for (float x = std::floor(w0.x / step) * step; x <= w1.x; x += step) {
                bool major = std::fabs(std::fmod(std::fabs(x), 5.f)) < 1e-3f;
                bool unit = std::fabs(x - std::round(x)) < 1e-3f;
                PointF a = S(V2(x, w0.y)), b = S(V2(x, w1.y));
                line(g, a, b, CA(major ? 0x4B628A : (unit ? 0x2E3D57 : 0x243248), 255), major ? 1.4f : 1.f, false);
            }
            for (float y = std::floor(w0.y / step) * step; y <= w1.y; y += step) {
                bool major = std::fabs(std::fmod(std::fabs(y), 5.f)) < 1e-3f;
                bool unit = std::fabs(y - std::round(y)) < 1e-3f;
                PointF a = S(V2(w0.x, y)), b = S(V2(w1.x, y));
                line(g, a, b, CA(major ? 0x4B628A : (unit ? 0x2E3D57 : 0x243248), 255), major ? 1.4f : 1.f, false);
            }
        }
        drawWater(g, L, true, false);
        drawPylons(g, L, true);
        drawTerrain(g, L, true);
        drawBoats(g, L, nullptr, false, true);
        drawFlags(g, L);
        return;
    }
    drawSky(g, T, L);
    drawWater(g, L, false, false);
    drawPylons(g, L, false);
    for (auto& t : gTrees) drawTree(g, t, T);
    drawTerrain(g, L, false);
    drawFlags(g, L);
    if (sim) drawBoats(g, L, sim, false, false);
}

static void drawBridgeSim(Graphics& g, const Sim& sim, bool stressMode) {
    // câbles et cordes d'abord, puis structure, puis routes
    for (int pass = 0; pass < 3; pass++) {
        for (auto& b : sim.beams) {
            if (!b.alive) continue;
            const Material& M = mat(b.mat);
            int p = M.tensionOnly ? 0 : (M.road ? 2 : 1);
            if (p != pass) continue;
            drawBeam(g, sim.parts[b.a].x, sim.parts[b.b].x, b.mat, b.rest0, b.stress, stressMode, false, 0, b.broken);
        }
    }
    for (int i = 0; i < sim.nodeCount; i++) drawJoint(g, sim.parts[i].x, sim.parts[i].w == 0, false, false);
}

static void drawFx(Graphics& g, const Sim& sim) {
    for (auto& f : sim.fx) {
        float a = clampf(f.life / f.maxLife, 0, 1);
        disc(g, S(f.x), std::max(1.5f, f.size * gZoom), CA(f.color, (int)(255 * a)));
    }
}

// ============================================================ conception (mode édition)
static void toast(const std::wstring& s) { gToast = s; gToastT = 2.6f; }

static void pushUndo() {
    gUndo.push_back(gDesign);
    if (gUndo.size() > 300) gUndo.erase(gUndo.begin());
    gRedo.clear();
}

static V2 gridSnap(V2 p) { return V2(std::round(p.x / GRID) * GRID, std::round(p.y / GRID) * GRID); }

static V2 snapTarget(bool fromStart) {
    V2 raw = gMouseW;
    float snapR = std::max(0.22f, 12.f / gZoom);
    bool ctrl = GetKeyState(VK_CONTROL) < 0;
    int n = gDesign.nodeAt(raw, snapR);
    V2 t = n >= 0 ? gDesign.nodes[n].p : (ctrl ? raw : gridSnap(raw));
    if (!fromStart) return t;
    float maxL = mat(gMat).maxLen;
    V2 d = t - gStart;
    float l = len(d);
    if (l <= maxL + 1e-3f) return t;
    V2 c = gStart + d * (maxL / l);
    int n2 = gDesign.nodeAt(c, snapR);
    if (n2 >= 0 && len(gDesign.nodes[n2].p - gStart) <= maxL + 1e-3f) return gDesign.nodes[n2].p;
    if (ctrl) return c;
    V2 best = c; float bd = 1e9f;
    float fx = std::floor(c.x / GRID) * GRID, fy = std::floor(c.y / GRID) * GRID;
    for (int i = -1; i <= 2; i++) for (int j = -1; j <= 2; j++) {
        V2 q(fx + i * GRID, fy + j * GRID);
        if (len(q - gStart) > maxL + 1e-3f || len(q - gStart) < 0.3f) continue;
        float dd = len(q - c);
        if (dd < bd) { bd = dd; best = q; }
    }
    return bd < 1e8f ? best : c;
}

static bool placeBeam(V2 a, V2 b) {
    const Level& L = gLevels[gCur];
    int r = canAddBeam(gDesign, L, a, b, gMat);
    if (r == ADD_OK) {
        pushUndo();
        addBeam(gDesign, L, a, b, gMat);
        audio::play(audio::S_PLACE, 0.6f);
        return true;
    }
    if (r == ADD_TOO_LONG) toast(str(L"Trop long : %ls mesure %ls m au maximum.", mat(gMat).name, fnum(mat(gMat).maxLen).c_str()));
    else if (r == ADD_IN_TERRAIN) toast(L"Impossible de placer une articulation dans le terrain.");
    else if (r == ADD_TOO_SHORT) toast(L"Poutre trop courte.");
    return false;
}

static void updateHover() {
    gHoverNode = gHoverBeam = -1;
    if (gScr != SCR_BUILD || gMy < TOPBAR || gMy > gH - BOTBAR) return;
    float r = std::max(0.15f, 10.f / gZoom);
    gHoverNode = gDesign.nodeAt(gMouseW, r);
    if (gHoverNode >= 0) return;
    float best = std::max(0.12f, 7.f / gZoom);
    for (size_t i = 0; i < gDesign.beams.size(); i++) {
        auto& b = gDesign.beams[i];
        V2 A = gDesign.nodes[b.a].p, B = gDesign.nodes[b.b].p, ab = B - A;
        float t = clampf(dot(gMouseW - A, ab) / std::max(1e-6f, len2(ab)), 0, 1);
        float d = len(gMouseW - (A + ab * t));
        if (d < best) { best = d; gHoverBeam = (int)i; }
    }
}

static void cancelDrawing() { gDrawing = gChain = false; }

static void startSim() {
    cancelDrawing();
    gDragNode = false;
    gSim.init(gLevels[gCur], gDesign);
    gScr = SCR_SIM;
    gWinT = -1; gResultDismissed = false; gPaused = false;
    audio::play(audio::S_CLICK);
}
static void stopSim() {
    gScr = SCR_BUILD;
    audio::play(audio::S_CLICK);
}

static void loadLevel(int i) {
    gCur = i;
    gDesign = gSaved[i];
    gUndo.clear(); gRedo.clear();
    gScr = SCR_BUILD;
    const Level& L = gLevels[i];
    if (!((L.mats >> gMat) & 1)) for (int m = 0; m < M_COUNT; m++) if ((L.mats >> m) & 1) { gMat = m; break; }
    fitCamera(L);
    buildTrees(L);
    cancelDrawing();
    gShowStress = false;
    if (gFirstRun) { gHelp = true; gFirstRun = false; }
}

static void goMenu() {
    if (gScr != SCR_MENU) gSaved[gCur] = gDesign;
    saveGame();
    gScr = SCR_MENU;
    gHelp = false;
    gDemo.init(gLevels[gDemoLevel], gDemoDesign);
}

static void undo() {
    if (gUndo.empty()) return;
    gRedo.push_back(gDesign); gDesign = gUndo.back(); gUndo.pop_back();
    audio::play(audio::S_DELETE, 0.4f);
}
static void redo() {
    if (gRedo.empty()) return;
    gUndo.push_back(gDesign); gDesign = gRedo.back(); gRedo.pop_back();
    audio::play(audio::S_PLACE, 0.4f);
}

static void adjustHyd(float delta) {
    if (gHoverBeam < 0) return;
    DBeam& b = gDesign.beams[gHoverBeam];
    if (!mat(b.mat).hydraulic) return;
    pushUndo();
    b.ext = clampf(std::round((b.ext + delta) * 20.f) / 20.f, 0.4f, 2.0f);
    toast(str(L"Vérin : course réglée à ×%ls", fnum(b.ext, 2).c_str()));
}

// ============================================================ HUD
static void drawTopBar(Graphics& g) {
    const Level& L = gLevels[gCur];
    LinearGradientBrush br(PointF(0, 0), PointF(0, TOPBAR), C(0xF0202838), C(0xF01A2130));
    g.FillRectangle(&br, 0.f, 0.f, (REAL)gW, TOPBAR);
    line(g, PointF(0, TOPBAR), PointF((REAL)gW, TOPBAR), CA(0x000000, 120), 2, false);
    button(g, B_MENU, RectF(10, 12, 84, 38), L"Menu", 0xFF3D4A63);
    text(g, str(L"%d. %ls", gCur + 1, L.name.c_str()), fH1, 108, 8, C(0xFFFFFFFF));
    float rightBlock = 320 + 4 * 96;
    textBox(g, L.hint, fSmall, RectF(109, 36, std::max(100.f, gW - rightBlock - 120), 20), C(0xFFB8C3D6), 0, true);
    // budget
    float cost = gDesign.cost();
    bool over = cost > L.budget;
    float bx = gW - rightBlock - 8, bw = 300;
    fillRound(g, bx, 8, bw, 46, 8, CA(0x0B1020, 200));
    text(g, L"Budget", fSmall, bx + 10, 10, C(0xFF9FB0C9));
    std::wstring bs = money(cost) + L"  /  " + (L.budget >= 999999 ? std::wstring(L"illimité") : money((float)L.budget));
    text(g, bs, fH2, bx + bw - 10, 8, C(over ? 0xFFFF6B6B : 0xFFFFFFFF), 2);
    float frac = L.budget >= 999999 ? 0.f : clampf(cost / L.budget, 0, 1);
    fillRound(g, bx + 10, 36, bw - 20, 10, 5, C(0xFF2B3550));
    if (frac > 0) fillRound(g, bx + 10, 36, std::max(10.f, (bw - 20) * frac), 10, 5, C(over ? 0xFFE5484D : (frac > 0.85f ? 0xFFF2B233 : 0xFF3FB97A)));
    float x = gW - 4 * 96.f;
    bool b = gScr == SCR_BUILD;
    button(g, B_UNDO, RectF(x, 12, 88, 38), L"Annuler", 0xFF3D4A63, false, nullptr, b && !gUndo.empty());
    button(g, B_REDO, RectF(x + 96, 12, 88, 38), L"Rétablir", 0xFF3D4A63, false, nullptr, b && !gRedo.empty());
    button(g, B_CLEAR, RectF(x + 192, 12, 88, 38), L"Effacer", 0xFF8E3B46, false, nullptr, b && !gDesign.beams.empty());
    button(g, B_HELP, RectF(x + 288, 12, 88, 38), L"Aide", 0xFF3D4A63, gHelp);
}

static void drawMaterialSample(Graphics& g, int m, float x, float y, float w) {
    float savedZ = gZoom, cx = gCamX, cy = gCamY;
    gZoom = 26; gCamX = 0; gCamY = 0;
    // place temporairement l'origine du monde au point (x, y)
    V2 a = Wd(x, y), b = Wd(x + w, y);
    drawBeam(g, a, b, m, len(b - a), 0, false, true, 0, false);
    gZoom = savedZ; gCamX = cx; gCamY = cy;
}

static void drawBottomBar(Graphics& g) {
    const Level& L = gLevels[gCur];
    float y0 = gH - BOTBAR;
    LinearGradientBrush br(PointF(0, y0), PointF(0, (REAL)gH), C(0xF0202838), C(0xF0151B28));
    g.FillRectangle(&br, 0.f, y0, (REAL)gW, BOTBAR);
    line(g, PointF(0, y0), PointF((REAL)gW, y0), CA(0x000000, 120), 2, false);
    float playW = 190;
    RectF play(gW - playW - 14, y0 + 16, playW, BOTBAR - 32);
    if (gScr == SCR_BUILD) {
        float x = 12;
        int nm = 0;
        for (int m = 0; m < M_COUNT; m++) if ((L.mats >> m) & 1) nm++;
        float step = std::min(134.f, (play.X - 24) / std::max(1, nm));
        for (int m = 0; m < M_COUNT; m++) {
            if (!((L.mats >> m) & 1)) continue;
            RectF r(x, y0 + 10, step - 8, BOTBAR - 20);
            bool sel = m == gMat, hot = hit(r, gMx, gMy);
            fillRound(g, r.X, r.Y + 2, r.Width, r.Height, 10, CA(0x000000, 70));
            fillRound(g, r.X, r.Y, r.Width, r.Height, 10, C(sel ? 0xFF3B4E74 : (hot ? 0xFF324058 : 0xFF2A3448)));
            if (sel) strokeRound(g, r.X + 1, r.Y + 1, r.Width - 2, r.Height - 2, 9, C(0xFFFFD166), 2.5f);
            text(g, std::to_wstring(m + 1), fTiny, r.X + 8, r.Y + 6, C(0xFF8D9BB5));
            drawMaterialSample(g, m, r.X + 22, r.Y + 17, r.Width - 34);
            Font* nf = textW(g, mat(m).name, fBody) <= r.Width - 10 ? fBody : fSmall;
            textBox(g, mat(m).name, nf, RectF(r.X + 4, r.Y + 28, r.Width - 8, 20), C(0xFFFFFFFF), 1, true);
            text(g, money(mat(m).cost) + L"/m", fSmall, r.X + r.Width * 0.5f, r.Y + 49, C(0xFFFFD166), 1);
            text(g, L"max " + fnum(mat(m).maxLen, 0) + L" m", fTiny, r.X + r.Width * 0.5f, r.Y + 67, C(0xFF9FB0C9), 1);
            regBtn(B_MAT + m, r);
            x += step;
        }
        // bouton tester
        bool hot = hit(play, gMx, gMy);
        fillRound(g, play.X, play.Y + 3, play.Width, play.Height, 14, CA(0x000000, 90));
        fillRound(g, play.X, play.Y, play.Width, play.Height, 14, C(hot ? 0xFF3CCB7F : 0xFF2EAF6B));
        PointF tri[3] = { PointF(play.X + 26, play.Y + 18), PointF(play.X + 26, play.Y + play.Height - 18), PointF(play.X + 50, play.Y + play.Height * 0.5f) };
        SolidBrush wb(C(0xFFFFFFFF)); g.FillPolygon(&wb, tri, 3);
        text(g, L"TESTER", fH1, play.X + 116, play.Y + play.Height * 0.5f, C(0xFFFFFFFF), 1, 1);
        regBtn(B_PLAY, play);
    } else {
        float x = 14, by = y0 + 22, bh = BOTBAR - 44;
        button(g, B_SPEED, RectF(x, by, 150, bh), L"Vitesse ×" + fnum(SPEEDS[gSpeedIdx], SPEEDS[gSpeedIdx] < 1 ? 2 : 0), 0xFF3D4A63);
        x += 160;
        button(g, B_PAUSE, RectF(x, by, 120, bh), gPaused ? L"Reprendre" : L"Pause", 0xFF3D4A63, gPaused);
        x += 130;
        button(g, B_STRESS, RectF(x, by, 150, bh), L"Contraintes", 0xFF3D4A63, gShowStress);
        x += 160;
        if (L.hasHyd()) {
            button(g, B_HYD, RectF(x, by, 170, bh), gSim.hydTarget > 0.5f ? L"Vérins : rentrer" : L"Vérins : sortir", 0xFFB7791F, gSim.hydTarget > 0.5f);
            x += 180;
        }
        text(g, L"[H] vérins   [T] contraintes   [F] vitesse   [Espace] modifier", fSmall, x + 6, by + bh * 0.5f, C(0xFF8D9BB5), 0, 1);
        bool hot = hit(play, gMx, gMy);
        fillRound(g, play.X, play.Y + 3, play.Width, play.Height, 14, CA(0x000000, 90));
        fillRound(g, play.X, play.Y, play.Width, play.Height, 14, C(hot ? 0xFFF39C42 : 0xFFE0832A));
        SolidBrush wb(C(0xFFFFFFFF));
        g.FillRectangle(&wb, play.X + 24, play.Y + play.Height * 0.5f - 11, 22.f, 22.f);
        text(g, L"MODIFIER", fH1, play.X + 120, play.Y + play.Height * 0.5f, C(0xFFFFFFFF), 1, 1);
        regBtn(B_PLAY, play);
    }
}

static std::wstring vehicleList(const Level& L) {
    int cnt[V_COUNT] = {};
    for (auto& s : L.spawns) cnt[s.type]++;
    std::wstring out;
    for (int t = 0; t < V_COUNT; t++) {
        if (!cnt[t]) continue;
        if (!out.empty()) out += L"  ·  ";
        out += vtype(t).name;
        if (cnt[t] > 1) out += L" ×" + std::to_wstring(cnt[t]);
    }
    return out;
}

static void drawInfoPanel(Graphics& g) {
    const Level& L = gLevels[gCur];
    float x = 12, y = TOPBAR + 10;
    std::vector<std::wstring> lines;
    if (gScr == SCR_BUILD) {
        lines.push_back(L"Véhicules : " + vehicleList(L));
        for (auto& b : L.boats) lines.push_back(str(L"Bateau : passe sous le pont à %ls s (zone rouge)", fnum(b.time, 0).c_str()));
    } else {
        lines.push_back(str(L"Temps %ls s   ·   Arrivés %d / %d   ·   Ruptures %d", fnum(gSim.time).c_str(), gSim.arrived, gSim.total, gSim.breaks));
        for (auto& b : gSim.boats) {
            float tt = b.d.time - gSim.time;
            if (tt > 0) lines.push_back(str(L"Bateau dans %ls s", fnum(tt).c_str()));
            else if (!b.passed && !b.hit) lines.push_back(L"Le bateau passe…");
            else if (b.passed) lines.push_back(L"Le bateau est passé.");
        }
        if (L.hasHyd()) lines.push_back(str(L"Vérins : %d %%", (int)std::round(gSim.hydPhase * 100)));
    }
    float w = 0;
    for (auto& s : lines) w = std::max(w, textW(g, s, fBody));
    fillRound(g, x, y, w + 24, 12.f + lines.size() * 21.f, 9, CA(0x0B1020, 170));
    for (size_t i = 0; i < lines.size(); i++) text(g, lines[i], fBody, x + 12, y + 6 + i * 21.f, C(0xFFE8EEF8));
}

static void drawToast(Graphics& g) {
    if (gToastT <= 0 || gToast.empty()) return;
    float a = clampf(gToastT / 0.4f, 0, 1);
    float w = textW(g, gToast, fH2) + 36;
    float x = (gW - w) * 0.5f, y = gH - BOTBAR - 56;
    fillRound(g, x, y, w, 40, 12, CA(0x11161F, (int)(225 * a)));
    text(g, gToast, fH2, gW * 0.5f, y + 20, CA(0xFFFFFF, (int)(255 * a)), 1, 1);
}

static int starsFor(float cost, int budget) {
    if (cost > budget) return 0;
    if (budget >= 999999) return 3;
    float f = cost / budget;
    return f <= 0.75f ? 3 : (f <= 0.9f ? 2 : 1);
}

static void drawResult(Graphics& g) {
    const Level& L = gLevels[gCur];
    float cost = gDesign.cost();
    bool ok = cost <= L.budget;
    SolidBrush dim(CA(0x000000, 110)); g.FillRectangle(&dim, 0, 0, gW, gH);
    float w = 520, h = 300, x = (gW - w) * 0.5f, y = (gH - h) * 0.5f - 20;
    fillRound(g, x, y + 6, w, h, 18, CA(0x000000, 90));
    fillRound(g, x, y, w, h, 18, C(0xFF243049));
    strokeRound(g, x, y, w, h, 18, C(ok ? 0xFF3FB97A : 0xFFF2B233), 3);
    text(g, ok ? L"Pont réussi !" : L"Ils sont passés… mais trop cher !", fTitle, gW * 0.5f, y + 22, C(0xFFFFFFFF), 1);
    int st = starsFor(cost, L.budget);
    for (int i = 0; i < 3; i++) star(g, gW * 0.5f - 60 + i * 60, y + 110, 24, C(i < st ? 0xFFFFD166 : 0xFF3A4660), C(i < st ? 0xFFB7791F : 0xFF56637E));
    text(g, L"Coût : " + money(cost) + L"   ·   Budget : " + (L.budget >= 999999 ? std::wstring(L"illimité") : money((float)L.budget)), fH2, gW * 0.5f, y + 150, C(ok ? 0xFFE8EEF8 : 0xFFFF8A80), 1);
    std::wstring sub = ok ? (st == 3 ? L"Chef-d'œuvre d'économie !" : (st == 2 ? L"Très bien ! 3 étoiles à 75 % du budget." : L"Réussi ! 2 étoiles à 90 % du budget, 3 à 75 %."))
                          : str(L"Dépassement de %ls. Allège ta structure !", money(cost - L.budget).c_str());
    text(g, sub, fBody, gW * 0.5f, y + 180, C(0xFFB8C3D6), 1);
    float bw = 150, by = y + h - 70;
    button(g, B_EDIT, RectF(gW * 0.5f - bw * 1.5f - 12, by, bw, 46), L"Modifier", 0xFF3D4A63);
    button(g, B_WATCH, RectF(gW * 0.5f - bw * 0.5f, by, bw, 46), L"Regarder", 0xFF3D4A63);
    bool hasNext = gCur + 1 < (int)gLevels.size();
    button(g, B_NEXT, RectF(gW * 0.5f + bw * 0.5f + 12, by, bw, 46), hasNext ? L"Suivant" : L"Menu", 0xFF2EAF6B, false, nullptr, ok);
}

static void drawHelp(Graphics& g) {
    SolidBrush dim(CA(0x000000, 140)); g.FillRectangle(&dim, 0, 0, gW, gH);
    float w = std::min(900.f, gW - 40.f), h = std::min(640.f, gH - 30.f), x = (gW - w) * 0.5f, y = (gH - h) * 0.5f;
    fillRound(g, x, y, w, h, 18, C(0xFF243049));
    strokeRound(g, x, y, w, h, 18, C(0xFF4F86C6), 2);
    text(g, L"Comment jouer", fTitle, gW * 0.5f, y + 18, C(0xFFFFFFFF), 1);
    const wchar_t* rows[][2] = {
        { L"But", L"Construis un pont pour que tous les véhicules atteignent le drapeau, sans dépasser le budget." },
        { L"Poser une poutre", L"Clic gauche sur une articulation puis glisser, ou cliquer deux fois pour enchaîner." },
        { L"Annuler une pose", L"Clic droit ou Échap pendant le tracé." },
        { L"Supprimer", L"Clic droit sur une poutre ou une articulation." },
        { L"Déplacer un nœud", L"Maj + glisser une articulation." },
        { L"Vue", L"Molette : zoom. Glisser dans le vide (gauche, droit ou molette) : déplacer." },
        { L"Matériaux", L"Touches 1 à 8. La route est la seule surface où roulent les véhicules." },
        { L"Grille", L"Ctrl maintenu : placement libre. [G] : afficher/masquer la grille." },
        { L"Vérins", L"[+] / [−] sur un vérin pour régler sa course. [H] pendant le test pour l'actionner." },
        { L"Tester", L"[Espace]. [T] : contraintes (du vert au rouge). [F] : vitesse. [P] : pause." },
        { L"Annuler / Rétablir", L"Ctrl+Z / Ctrl+Y." },
        { L"Astuce", L"Les triangles sont indéformables : c'est le secret des ponts solides !" },
    };
    float ry = y + 78;
    float rowH = (h - 150) / 12.f;
    for (auto& r : rows) {
        text(g, r[0], fH2, x + 30, ry, C(0xFFFFD166));
        textBox(g, r[1], fSmall, RectF(x + 220, ry + 1, w - 245, rowH), C(0xFFE8EEF8));
        ry += rowH;
    }
    button(g, B_HELPCLOSE, RectF(gW * 0.5f - 90, y + h - 60, 180, 44), L"C'est parti !", 0xFF2EAF6B);
}

static void drawFailBanner(Graphics& g) {
    if (!gSim.lost) return;
    std::wstring s = gSim.failMsg + L"   [Espace] pour modifier ton pont";
    float w = textW(g, s, fH2) + 40;
    float x = (gW - w) * 0.5f, y = TOPBAR + 96;
    fillRound(g, x, y, w, 42, 12, CA(0xB3261E, 230));
    text(g, s, fH2, gW * 0.5f, y + 21, C(0xFFFFFFFF), 1, 1);
}

// ============================================================ menu
static void drawMenu(Graphics& g) {
    const Level& DL = gLevels[gDemoLevel];
    float cx = gCamX, cy = gCamY, z = gZoom;
    gZoom = clampf(gW / (DL.vx1 - DL.vx0 + 6.f), 10.f, 60.f);
    gCamX = (DL.vx0 + DL.vx1) * 0.5f;
    gCamY = (gH - 105.f - viewCY()) / gZoom;
    drawScene(g, DL, &gDemo, false, false);
    drawBridgeSim(g, gDemo, false);
    drawVehicles(g, gDemo);
    drawFx(g, gDemo);
    drawWater(g, DL, false, true);
    gCamX = cx; gCamY = cy; gZoom = z;
    SolidBrush veil(CA(0x0E1422, 120)); g.FillRectangle(&veil, 0, 0, gW, gH);

    // titre
    float ty = 26;
    text(g, L"TRAVÉE", fTitle, gW * 0.5f + 3, ty + 3, CA(0x000000, 120), 1);
    text(g, L"TRAVÉE", fTitle, gW * 0.5f, ty, C(0xFFFFFFFF), 1);
    text(g, L"Bâtisseurs de ponts", fH1, gW * 0.5f, ty + 66, C(0xFFFFD166), 1);

    int total = 0;
    for (size_t i = 0; i < gLevels.size(); i++) if (gBest[i] >= 0) total += starsFor((float)gBest[i], gLevels[i].budget);
    text(g, str(L"Étoiles : %d / %d", total, (int)gLevels.size() * 3), fBody, gW * 0.5f, ty + 100, C(0xFFE8EEF8), 1);

    int cols = 4;
    float cw = std::min(250.f, (gW - 80.f) / cols - 14), ch = 104;
    float gx = (gW - (cw * cols + 14 * (cols - 1))) * 0.5f, gy = ty + 136;
    for (size_t i = 0; i < gLevels.size(); i++) {
        int c = (int)i % cols, r = (int)i / cols;
        RectF rc(gx + c * (cw + 14), gy + r * (ch + 14), cw, ch);
        bool hot = hit(rc, gMx, gMy);
        const Theme& T = THEMES[gLevels[i].theme];
        fillRound(g, rc.X, rc.Y + 4, rc.Width, rc.Height, 14, CA(0x000000, 90));
        {
            GraphicsPath p; addRoundRect(p, rc.X, rc.Y, rc.Width, rc.Height, 14);
            LinearGradientBrush b(PointF(0, rc.Y), PointF(0, rc.Y + rc.Height), C(hot ? mix(T.sky0, 0xFFFFFFFF, 0.15f) : T.sky0), C(T.ground1));
            g.FillPath(&b, &p);
            Pen pen(C(hot ? 0xFFFFD166 : 0xFF0E1422), hot ? 3.f : 1.5f); g.DrawPath(&pen, &p);
        }
        fillRound(g, rc.X + 10, rc.Y + 10, 38, 38, 19, CA(0x0E1422, 190));
        text(g, std::to_wstring(i + 1), fH1, rc.X + 29, rc.Y + 29, C(0xFFFFFFFF), 1, 1);
        textBox(g, gLevels[i].name, fH2, RectF(rc.X + 56, rc.Y + 18, rc.Width - 62, 24), C(0xFFFFFFFF), 0, true);
        int st = gBest[i] >= 0 ? starsFor((float)gBest[i], gLevels[i].budget) : 0;
        for (int k = 0; k < 3; k++) star(g, rc.X + 22 + k * 26, rc.Y + 72, 10, C(k < st ? 0xFFFFD166 : 0x553A4660), C(k < st ? 0xFFB7791F : 0x88FFFFFF));
        std::wstring sub = gBest[i] >= 0 ? (L"Record : " + money((float)gBest[i])) : (gLevels[i].budget >= 999999 ? std::wstring(L"Libre") : L"Budget " + money((float)gLevels[i].budget));
        text(g, sub, fSmall, rc.X + rc.Width - 12, rc.Y + 64, C(0xFFFFFFFF), 2);
        regBtn(B_LEVEL + (int)i, rc);
    }
    float by = gy + 3 * (ch + 14) + 6;
    button(g, B_HELP, RectF(gW * 0.5f - 200, by, 190, 46), L"Comment jouer", 0xFF3D4A63);
    button(g, B_QUIT, RectF(gW * 0.5f + 10, by, 190, 46), L"Quitter", 0xFF8E3B46);
    text(g, L"Jeu original · physique XPBD · Win32 + GDI+", fTiny, gW - 12.f, gH - 22.f, CA(0xFFFFFF, 140), 2);
}

// ============================================================ rendu principal
static void renderFrame() {
    if (!gMemDC) return;
    Graphics g(gMemDC);
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    g.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
    g.SetPixelOffsetMode(PixelOffsetModeHalf);
    if (gScale != 1.f) g.ScaleTransform(gScale, gScale);
    gBtns.clear();

    if (gScr == SCR_MENU) {
        drawMenu(g);
    } else {
        const Level& L = gLevels[gCur];
        bool build = gScr == SCR_BUILD;
        drawScene(g, L, build ? nullptr : &gSim, build, gShowStress);
        if (build) {
            // poutres : câbles, structure, routes
            for (int pass = 0; pass < 3; pass++) {
                for (size_t i = 0; i < gDesign.beams.size(); i++) {
                    auto& b = gDesign.beams[i];
                    const Material& M = mat(b.mat);
                    int p = M.tensionOnly ? 0 : (M.road ? 2 : 1);
                    if (p != pass) continue;
                    V2 A = gDesign.nodes[b.a].p, B = gDesign.nodes[b.b].p;
                    drawBeam(g, A, B, b.mat, len(B - A), 0, false, true, (int)i == gHoverBeam && !gDrawing ? 3 : 0, false);
                    if (M.hydraulic && (gZoom > 18 || (int)i == gHoverBeam)) {
                        PointF m = S((A + B) * 0.5f);
                        std::wstring s = L"×" + fnum(b.ext, 2);
                        float w = textW(g, s, fTiny) + 8;
                        fillRound(g, m.X - w * 0.5f, m.Y - 18, w, 16, 5, CA(0x000000, 170));
                        text(g, s, fTiny, m.X, m.Y - 10, C(0xFFF2B233), 1, 1);
                    }
                }
            }
            for (size_t i = 0; i < gDesign.nodes.size(); i++)
                drawJoint(g, gDesign.nodes[i].p, gDesign.nodes[i].anchor, true, (int)i == gHoverNode);
            // poutre en cours
            if (gDrawing) {
                V2 t = snapTarget(true);
                int r = canAddBeam(gDesign, L, gStart, t, gMat);
                drawBeam(g, gStart, t, gMat, len(t - gStart), 0, false, true, r == ADD_OK || r == ADD_EXISTS ? 1 : 2, false);
                drawJoint(g, t, false, true, true);
                // portée maximale
                PointF c = S(gStart);
                float R = mat(gMat).maxLen * gZoom;
                Pen pen(CA(0xFFD166, 90), 1.5f); pen.SetDashStyle(DashStyleDot);
                g.DrawEllipse(&pen, c.X - R, c.Y - R, R * 2, R * 2);
                float l = len(t - gStart);
                std::wstring s = fnum(l, 2) + L" m  ·  " + money(l * mat(gMat).cost);
                PointF m = S(t);
                float w = textW(g, s, fSmall) + 14;
                fillRound(g, m.X + 14, m.Y - 30, w, 22, 7, CA(0x000000, 190));
                text(g, s, fSmall, m.X + 21, m.Y - 27, C(0xFFFFFFFF));
            } else if (gMy > TOPBAR && gMy < gH - BOTBAR && !gPanning && gHoverBeam < 0) {
                V2 t = snapTarget(false);
                if (gHoverNode < 0) { PointF p = S(t); ring(g, p, 4, CA(0xFFFFFF, 110), 1.2f); }
            }
            if (gHoverBeam >= 0 && !gDrawing) {
                auto& b = gDesign.beams[gHoverBeam];
                float l = gDesign.beamLen(b);
                std::wstring s = std::wstring(mat(b.mat).name) + L"  ·  " + fnum(l, 2) + L" m  ·  " + money(l * mat(b.mat).cost);
                float w = textW(g, s, fSmall) + 14;
                fillRound(g, gMx + 16, gMy + 14, w, 22, 7, CA(0x000000, 190));
                text(g, s, fSmall, gMx + 23, gMy + 17, C(0xFFFFFFFF));
            }
        } else {
            drawBridgeSim(g, gSim, gShowStress);
            drawVehicles(g, gSim);
            drawBoats(g, L, &gSim, true, false);
            drawFx(g, gSim);
            drawWater(g, L, false, true);
        }
        drawInfoPanel(g);
        drawFailBanner(g);
        drawTopBar(g);
        drawBottomBar(g);
        drawToast(g);
        if (gScr == SCR_SIM && gSim.won && gWinT >= 1.2f && !gResultDismissed) drawResult(g);
    }
    if (gHelp) drawHelp(g);
    gBtnsPrev = gBtns;
}

// ============================================================ mise à jour
static void update(float dt) {
    gTime += dt;
    if (gToastT > 0) gToastT -= dt;
    if (gScr == SCR_MENU) {
        gDemo.frame(1.f);
        gDemo.events.clear();
        if (gDemo.time > 22 || gDemo.lost) gDemo.init(gLevels[gDemoLevel], gDemoDesign);
        return;
    }
    if (gScr == SCR_SIM) {
        if (!gPaused) gSim.frame(SPEEDS[gSpeedIdx]);
        for (auto& e : gSim.events) {
            switch (e.type) {
            case TVE_BREAK:    audio::play(audio::S_BREAK, clampf(0.35f + e.mag / 300.f, 0.3f, 1.f)); break;
            case TVE_SPLASH:   audio::play(audio::S_SPLASH, clampf(e.mag / 10.f, 0.2f, 1.f)); break;
            case TVE_ARRIVE:   audio::play(audio::S_ARRIVE, 0.6f); break;
            case TVE_FAIL:     audio::play(audio::S_FAIL, 0.8f); break;
            case TVE_BOAT_HIT: audio::play(audio::S_BREAK, 1.f); break;
            case TVE_HYD:      audio::play(audio::S_HYD, 0.6f); break;
            case TVE_WIN: {
                audio::play(audio::S_WIN, 0.9f);
                const Level& L = gLevels[gCur];
                float cost = gDesign.cost();
                if (cost <= L.budget && (gBest[gCur] < 0 || cost < gBest[gCur])) gBest[gCur] = (int)std::lround(cost);
                gSaved[gCur] = gDesign;
                saveGame();
                break;
            }
            }
        }
        gSim.events.clear();
        // klaxon du bateau
        for (auto& b : gSim.boats) {
            float tt = b.d.time - gSim.time;
            if (tt < 6.0f && tt + FRAME_DT * SPEEDS[gSpeedIdx] >= 6.0f) audio::play(audio::S_HORN, 0.7f);
        }
        if (gSim.won) { if (gWinT < 0) gWinT = 0; gWinT += dt; }
    }
}

// ============================================================ entrées
static void onButton(int id) {
    audio::play(audio::S_CLICK, 0.5f);
    if (id >= B_LEVEL) { loadLevel(id - B_LEVEL); return; }
    if (id >= B_MAT) { gMat = id - B_MAT; cancelDrawing(); return; }
    switch (id) {
    case B_MENU: goMenu(); break;
    case B_UNDO: undo(); break;
    case B_REDO: redo(); break;
    case B_CLEAR:
        if (!gDesign.beams.empty()) { pushUndo(); gDesign = initialDesign(gLevels[gCur]); toast(L"Pont effacé (Ctrl+Z pour annuler)."); }
        break;
    case B_HELP: gHelp = !gHelp; break;
    case B_HELPCLOSE: gHelp = false; break;
    case B_PLAY: if (gScr == SCR_BUILD) startSim(); else stopSim(); break;
    case B_SPEED: gSpeedIdx = (gSpeedIdx + 1) % 4; break;
    case B_PAUSE: gPaused = !gPaused; break;
    case B_STRESS: gShowStress = !gShowStress; break;
    case B_HYD: gSim.toggleHydraulics(); break;
    case B_EDIT: stopSim(); break;
    case B_WATCH: gResultDismissed = true; break;
    case B_NEXT:
        gSaved[gCur] = gDesign; saveGame();
        if (gCur + 1 < (int)gLevels.size()) loadLevel(gCur + 1); else goMenu();
        break;
    case B_QUIT: gRunning = false; PostMessage(gWnd, WM_CLOSE, 0, 0); break;
    }
}

static bool modalOpen() { return gHelp || (gScr == SCR_SIM && gSim.won && gWinT >= 1.2f && !gResultDismissed); }
static bool modalBtn(int id) { return id == B_HELPCLOSE || id == B_EDIT || id == B_WATCH || id == B_NEXT || (gHelp && id == B_HELP); }

static int btnAt(float x, float y) {
    for (auto it = gBtnsPrev.rbegin(); it != gBtnsPrev.rend(); ++it)
        if (hit(it->r, x, y)) {
            if (modalOpen() && !modalBtn(it->id)) return 0;
            return it->id;
        }
    return 0;
}

static bool inScene(float y) { return y > TOPBAR && y < gH - BOTBAR; }

static void onMouseMove(float x, float y) {
    gMx = x; gMy = y;
    gMouseW = Wd(x, y);
    if (gPanning) {
        gCamX = gPanCX - (x - gPanMx) / gZoom;
        gCamY = gPanCY + (y - gPanMy) / gZoom;
        gMouseW = Wd(x, y);
    }
    if (gDragNode && gDragIdx >= 0 && gScr == SCR_BUILD) {
        V2 t = snapTarget(false);
        DNode& n = gDesign.nodes[gDragIdx];
        if (len(t - n.p) > 1e-4f && !insideTerrain(gLevels[gCur], t)) {
            int other = gDesign.nodeAt(t, 0.05f);
            bool ok = other < 0 || other == gDragIdx;
            for (auto& b : gDesign.beams) {
                if (b.a != gDragIdx && b.b != gDragIdx) continue;
                V2 o = gDesign.nodes[b.a == gDragIdx ? b.b : b.a].p;
                float l = len(o - t);
                if (l > mat(b.mat).maxLen + 1e-3f || l < 0.3f) ok = false;
            }
            if (ok) n.p = t;
        }
    }
    updateHover();
}

static void onLDown(float x, float y) {
    gDownX = x; gDownY = y;
    int b = btnAt(x, y);
    if (b) { gPressBtn = b; return; }
    if (modalOpen() || !inScene(y) || gScr == SCR_MENU) return;
    if (gScr == SCR_SIM) {
        gPanning = true; gPanMx = x; gPanMy = y; gPanCX = gCamX; gPanCY = gCamY;
        return;
    }
    if (gChain && gDrawing) {
        V2 t = snapTarget(true);
        if (placeBeam(gStart, t)) gStart = t;
        return;
    }
    bool shift = GetKeyState(VK_SHIFT) < 0;
    if (shift && gHoverNode >= 0 && !gDesign.nodes[gHoverNode].anchor) {
        pushUndo();
        gDragNode = true; gDragIdx = gHoverNode;
        return;
    }
    int n = gDesign.nodeAt(gMouseW, std::max(0.22f, 12.f / gZoom));
    if (n >= 0) {
        gDrawing = true; gChain = false;
        gStart = gDesign.nodes[n].p;
        return;
    }
    gPanning = true; gPanMx = x; gPanMy = y; gPanCX = gCamX; gPanCY = gCamY;
}

static void onLUp(float x, float y) {
    if (gPressBtn) {
        int b = btnAt(x, y);
        int p = gPressBtn;
        gPressBtn = 0;
        if (b == p) onButton(b);
        return;
    }
    if (gPanning) { gPanning = false; return; }
    if (gDragNode) {
        gDragNode = false; gDragIdx = -1;
        if (!gUndo.empty()) {
            // annule l'entrée d'annulation si rien n'a bougé
            const Design& prev = gUndo.back();
            bool same = prev.nodes.size() == gDesign.nodes.size();
            for (size_t i = 0; same && i < prev.nodes.size(); i++) if (len(prev.nodes[i].p - gDesign.nodes[i].p) > 1e-5f) same = false;
            if (same) gUndo.pop_back();
        }
        return;
    }
    if (gDrawing && !gChain) {
        float moved = std::hypot(x - gDownX, y - gDownY);
        if (moved > 8) {
            V2 t = snapTarget(true);
            placeBeam(gStart, t);
            gDrawing = false;
        } else {
            gChain = true;   // clic simple : mode chaîne
        }
    }
}

static void onRDown(float x, float y) {
    if (modalOpen()) return;
    if (gDrawing) { cancelDrawing(); return; }
    if (!inScene(y) || gScr == SCR_MENU) return;
    if (gScr == SCR_BUILD) {
        if (gHoverBeam >= 0) {
            pushUndo(); gDesign.removeBeam(gHoverBeam); gHoverBeam = -1;
            audio::play(audio::S_DELETE, 0.6f);
            updateHover();
            return;
        }
        if (gHoverNode >= 0 && !gDesign.nodes[gHoverNode].anchor) {
            pushUndo(); gDesign.removeNode(gHoverNode); gHoverNode = -1;
            audio::play(audio::S_DELETE, 0.6f);
            updateHover();
            return;
        }
    }
    gPanning = true; gPanMx = x; gPanMy = y; gPanCX = gCamX; gPanCY = gCamY;
}

static void onWheel(float x, float y, int delta) {
    if (gScr == SCR_MENU || modalOpen()) return;
    if (gScr == SCR_BUILD && GetKeyState(VK_SHIFT) < 0 && gHoverBeam >= 0) { adjustHyd(delta > 0 ? 0.05f : -0.05f); return; }
    V2 before = Wd(x, y);
    gZoom = clampf(gZoom * std::pow(1.15f, delta / 120.f), 6.f, 140.f);
    V2 after = Wd(x, y);
    gCamX += before.x - after.x;
    gCamY += before.y - after.y;
    gMouseW = Wd(x, y);
}

static void onKey(WPARAM k) {
    bool ctrl = GetKeyState(VK_CONTROL) < 0;
    if (k == VK_F1) { gHelp = !gHelp; return; }
    if (k == VK_ESCAPE) {
        if (gHelp) { gHelp = false; return; }
        if (gDrawing) { cancelDrawing(); return; }
        if (gScr == SCR_SIM) { if (modalOpen()) gResultDismissed = true; else stopSim(); return; }
        if (gScr == SCR_BUILD) { goMenu(); return; }
        return;
    }
    if (gScr == SCR_MENU) return;
    if (k == VK_SPACE) { if (gScr == SCR_BUILD) startSim(); else stopSim(); return; }
    if (ctrl && (k == 'Z')) { if (gScr == SCR_BUILD) { if (GetKeyState(VK_SHIFT) < 0) redo(); else undo(); } return; }
    if (ctrl && (k == 'Y')) { if (gScr == SCR_BUILD) redo(); return; }
    if (k >= '1' && k <= '8') {
        int m = (int)(k - '1');
        if ((gLevels[gCur].mats >> m) & 1) { gMat = m; cancelDrawing(); audio::play(audio::S_CLICK, 0.4f); }
        return;
    }
    switch (k) {
    case 'H': if (gScr == SCR_SIM && gLevels[gCur].hasHyd()) gSim.toggleHydraulics(); break;
    case 'T': gShowStress = !gShowStress; break;
    case 'F': gSpeedIdx = (gSpeedIdx + 1) % 4; break;
    case 'P': if (gScr == SCR_SIM) gPaused = !gPaused; break;
    case 'G': gShowGrid = !gShowGrid; break;
    case 'R': case VK_HOME: fitCamera(gLevels[gCur]); break;
    case VK_DELETE: case VK_BACK:
        if (gScr == SCR_BUILD) {
            if (gHoverBeam >= 0) { pushUndo(); gDesign.removeBeam(gHoverBeam); gHoverBeam = -1; audio::play(audio::S_DELETE, 0.6f); }
            else if (gHoverNode >= 0 && !gDesign.nodes[gHoverNode].anchor) { pushUndo(); gDesign.removeNode(gHoverNode); gHoverNode = -1; audio::play(audio::S_DELETE, 0.6f); }
            updateHover();
        }
        break;
    case VK_ADD: case VK_OEM_PLUS: if (gScr == SCR_BUILD) adjustHyd(0.05f); break;
    case VK_SUBTRACT: case VK_OEM_MINUS: if (gScr == SCR_BUILD) adjustHyd(-0.05f); break;
    }
}

// ============================================================ fenêtre
static void createBackBuffer(int w, int h) {
    if (gMemDC) { SelectObject(gMemDC, gOldBmp); DeleteObject(gDib); DeleteDC(gMemDC); gMemDC = nullptr; }
    gPW = std::max(w, 320); gPH = std::max(h, 240);
    gW = (int)(gPW / gScale); gH = (int)(gPH / gScale);
    HDC screen = GetDC(nullptr);
    gMemDC = CreateCompatibleDC(screen);
    ReleaseDC(nullptr, screen);
    BITMAPINFO bi = {};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = gPW; bi.bmiHeader.biHeight = -gPH;
    bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32; bi.bmiHeader.biCompression = BI_RGB;
    gDib = CreateDIBSection(gMemDC, &bi, DIB_RGB_COLORS, &gBits, nullptr, 0);
    gOldBmp = (HBITMAP)SelectObject(gMemDC, gDib);
}

static void present() {
    HDC dc = GetDC(gWnd);
    BitBlt(dc, 0, 0, gPW, gPH, gMemDC, 0, 0, SRCCOPY);
    ReleaseDC(gWnd, dc);
}

static HICON makeIcon(int size) {
    BITMAPINFO bi = {};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = size; bi.bmiHeader.biHeight = -size;
    bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32; bi.bmiHeader.biCompression = BI_RGB;
    void* bits = nullptr;
    HDC dc = CreateCompatibleDC(nullptr);
    HBITMAP col = CreateDIBSection(dc, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
    HBITMAP old = (HBITMAP)SelectObject(dc, col);
    {
        Graphics g(dc);
        g.SetSmoothingMode(SmoothingModeAntiAlias);
        g.Clear(Color(0, 0, 0, 0));
        float s = (float)size;
        GraphicsPath p; addRoundRect(p, 0, 0, s - 1, s - 1, s * 0.2f);
        LinearGradientBrush b(PointF(0, 0), PointF(0, s), C(0xFF5AA9E6), C(0xFF1C5F8F));
        g.FillPath(&b, &p);
        Pen road(C(0xFF2E3138), s * 0.1f);
        g.DrawLine(&road, PointF(s * 0.08f, s * 0.62f), PointF(s * 0.92f, s * 0.62f));
        Pen tr(C(0xFFFFD166), s * 0.06f); tr.SetLineJoin(LineJoinRound);
        PointF z[] = { PointF(s * 0.12f, s * 0.6f), PointF(s * 0.3f, s * 0.3f), PointF(s * 0.5f, s * 0.6f), PointF(s * 0.7f, s * 0.3f), PointF(s * 0.88f, s * 0.6f) };
        g.DrawLines(&tr, z, 5);
        g.DrawLine(&tr, PointF(s * 0.3f, s * 0.3f), PointF(s * 0.7f, s * 0.3f));
    }
    SelectObject(dc, old);
    HBITMAP mask = CreateBitmap(size, size, 1, 1, nullptr);
    ICONINFO ii = {}; ii.fIcon = TRUE; ii.hbmColor = col; ii.hbmMask = mask;
    HICON ic = CreateIconIndirect(&ii);
    DeleteObject(mask); DeleteObject(col); DeleteDC(dc);
    return ic;
}

static LRESULT CALLBACK WndProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_SIZE:
        if (LOWORD(lp) > 0 && HIWORD(lp) > 0) createBackBuffer(LOWORD(lp), HIWORD(lp));
        return 0;
    case WM_GETMINMAXINFO: {
        MINMAXINFO* mi = (MINMAXINFO*)lp;
        mi->ptMinTrackSize.x = (LONG)(1024 * gScale); mi->ptMinTrackSize.y = (LONG)(640 * gScale);
        return 0;
    }
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
        PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps);
        if (gMemDC) BitBlt(dc, 0, 0, gPW, gPH, gMemDC, 0, 0, SRCCOPY);
        EndPaint(h, &ps);
        return 0;
    }
    case WM_MOUSEMOVE: onMouseMove(GET_X_LPARAM(lp) / gScale, GET_Y_LPARAM(lp) / gScale); return 0;
    case WM_LBUTTONDOWN: SetCapture(h); onLDown(GET_X_LPARAM(lp) / gScale, GET_Y_LPARAM(lp) / gScale); return 0;
    case WM_LBUTTONUP: ReleaseCapture(); onLUp(GET_X_LPARAM(lp) / gScale, GET_Y_LPARAM(lp) / gScale); return 0;
    case WM_RBUTTONDOWN: SetCapture(h); onRDown(GET_X_LPARAM(lp) / gScale, GET_Y_LPARAM(lp) / gScale); return 0;
    case WM_RBUTTONUP: ReleaseCapture(); gPanning = false; return 0;
    case WM_MBUTTONDOWN: SetCapture(h); gPanning = true; gPanMx = GET_X_LPARAM(lp) / gScale; gPanMy = GET_Y_LPARAM(lp) / gScale; gPanCX = gCamX; gPanCY = gCamY; return 0;
    case WM_MBUTTONUP: ReleaseCapture(); gPanning = false; return 0;
    case WM_MOUSEWHEEL: {
        POINT p = { GET_X_LPARAM(lp), GET_Y_LPARAM(lp) };
        ScreenToClient(h, &p);
        onWheel(p.x / gScale, p.y / gScale, GET_WHEEL_DELTA_WPARAM(wp));
        return 0;
    }
    case WM_KEYDOWN: onKey(wp); return 0;
    case WM_SETCURSOR:
        if (LOWORD(lp) == HTCLIENT) {
            int b = btnAt(gMx, gMy);
            LPCWSTR c = IDC_ARROW;
            if (b) c = IDC_HAND;
            else if (gPanning) c = IDC_SIZEALL;
            else if (gScr == SCR_BUILD && inScene(gMy) && !modalOpen()) c = IDC_CROSS;
            SetCursor(LoadCursor(nullptr, c));
            return TRUE;
        }
        break;
    case WM_CLOSE:
        saveGame();
        gRunning = false;
        DestroyWindow(h);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(h, msg, wp, lp);
}

static void createFonts() {
    const wchar_t* names[] = { L"Segoe UI", L"Tahoma", L"Arial", L"DejaVu Sans" };
    for (auto n : names) {
        FontFamily* f = new FontFamily(n);
        if (f->IsAvailable()) { gFF = f; break; }
        delete f;
    }
    if (!gFF) gFF = FontFamily::GenericSansSerif()->Clone();
    fTitle = new Font(gFF, 46, FontStyleBold, UnitPixel);
    fH1    = new Font(gFF, 21, FontStyleBold, UnitPixel);
    fH2    = new Font(gFF, 16, FontStyleBold, UnitPixel);
    fBody  = new Font(gFF, 14.5f, FontStyleRegular, UnitPixel);
    fSmall = new Font(gFF, 13, FontStyleRegular, UnitPixel);
    fTiny  = new Font(gFF, 11.5f, FontStyleRegular, UnitPixel);
}

static void initGame() {
    gLevels = makeLevels();
    loadGame();
    gDemoDesign = initialDesign(gLevels[gDemoLevel]);
    ref::truss(gDemoDesign, gLevels[gDemoLevel], V2(0, 0), V2(14, 0), 7, 1.7f, M_ROAD, M_STEEL, M_STEEL);
    gDemo.init(gLevels[gDemoLevel], gDemoDesign);
}

// ------------------------------------------------- capture d'écran (tests)
static bool saveBMP(const wchar_t* path) {
    FILE* f = _wfopen(path, L"wb");
    if (!f) return false;
    BITMAPFILEHEADER fh = {};
    BITMAPINFOHEADER ih = {};
    ih.biSize = sizeof(ih); ih.biWidth = gPW; ih.biHeight = -gPH; ih.biPlanes = 1; ih.biBitCount = 32; ih.biCompression = BI_RGB;
    fh.bfType = 0x4D42; fh.bfOffBits = sizeof(fh) + sizeof(ih); fh.bfSize = fh.bfOffBits + gPW * gPH * 4;
    fwrite(&fh, sizeof(fh), 1, f); fwrite(&ih, sizeof(ih), 1, f);
    fwrite(gBits, 4, (size_t)gPW * gPH, f);
    fclose(f);
    return true;
}

static int shotMode(int argc, wchar_t** argv) {
    std::wstring out = L"capture.bmp";
    int level = -1, w = 1280, h = 760;
    float simT = -1, hydAt = -1, hydDown = -1, mx = -1, my = -1;
    bool useRef = false, help = false, stress = false, drawFrom = false, weaken = false;
    float dfx = 0, dfy = 0;
    for (int i = 1; i < argc; i++) {
        std::wstring a = argv[i];
        auto nx = [&]() { return i + 1 < argc ? std::wstring(argv[++i]) : std::wstring(); };
        if (a == L"--shot") out = nx();
        else if (a == L"--level") level = _wtoi(nx().c_str()) - 1;
        else if (a == L"--sim") simT = (float)_wtof(nx().c_str());
        else if (a == L"--hyd") hydAt = (float)_wtof(nx().c_str());
        else if (a == L"--hyddown") hydDown = (float)_wtof(nx().c_str());
        else if (a == L"--ref") useRef = true;
        else if (a == L"--help") help = true;
        else if (a == L"--stress") stress = true;
        else if (a == L"--weaken") weaken = true;
        else if (a == L"--w") w = _wtoi(nx().c_str());
        else if (a == L"--h") h = _wtoi(nx().c_str());
        else if (a == L"--mouse") { mx = (float)_wtof(nx().c_str()); my = (float)_wtof(nx().c_str()); }
        else if (a == L"--drawfrom") { drawFrom = true; dfx = (float)_wtof(nx().c_str()); dfy = (float)_wtof(nx().c_str()); }
    }
    createBackBuffer(w, h);
    if (level >= 0 && level < (int)gLevels.size()) {
        loadLevel(level);
        gFirstRun = false;
        if (useRef) ref::build(level, gLevels[level], gDesign);
        if (weaken) for (auto& b : gDesign.beams) if (b.mat == M_STEEL) b.mat = M_WOOD;
        if (mx >= 0) onMouseMove(mx, my);
        if (drawFrom) { gDrawing = true; gStart = V2(dfx, dfy); }
        if (simT >= 0) {
            startSim();
            gShowStress = stress;
            bool up = false, down = false;
            while (gSim.time < simT) {
                gSim.frame(1);
                if (hydAt >= 0 && !up && gSim.time >= hydAt) { gSim.toggleHydraulics(); up = true; }
                if (hydDown >= 0 && up && !down && gSim.time >= hydDown) { gSim.toggleHydraulics(); down = true; }
                if (gSim.won) { if (gWinT < 0) gWinT = 0; gWinT += FRAME_DT; }
                gTime += FRAME_DT;
            }
        }
    } else {
        gScr = SCR_MENU;
        for (int i = 0; i < 200; i++) { gDemo.frame(1); gTime += FRAME_DT; }
    }
    gHelp = help;
    renderFrame();
    return saveBMP(out.c_str()) ? 0 : 1;
}

// ============================================================ point d'entrée
int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR, int show) {
    typedef BOOL(WINAPI * DpiFn)();
    if (HMODULE u = GetModuleHandleW(L"user32.dll"))
        if (auto fn = (DpiFn)(void*)GetProcAddress(u, "SetProcessDPIAware")) fn();

    GdiplusStartupInput gsi;
    ULONG_PTR gtok;
    GdiplusStartup(&gtok, &gsi, nullptr);
    createFonts();
    initGame();

    int argc = 0;
    wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    for (int i = 1; i < argc; i++)
        if (std::wstring(argv[i]) == L"--shot") {
            int r = shotMode(argc, argv);
            LocalFree(argv);
            GdiplusShutdown(gtok);
            return r;
        }
    LocalFree(argv);

    audio::init();
    timeBeginPeriod(1);

    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hIcon = makeIcon(32);
    wc.hIconSm = makeIcon(16);
    wc.lpszClassName = L"TraveeWnd";
    RegisterClassExW(&wc);

    {
        HDC sdc = GetDC(nullptr);
        int dpi = GetDeviceCaps(sdc, LOGPIXELSX);
        ReleaseDC(nullptr, sdc);
        gScale = std::max(1.f, dpi / 96.f);
    }
    RECT work = { 0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN) };
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
    RECT r = { 0, 0, (LONG)(1280 * gScale), (LONG)(760 * gScale) };
    AdjustWindowRect(&r, WS_OVERLAPPEDWINDOW, FALSE);
    int ww = std::min((int)(r.right - r.left), (int)(work.right - work.left));
    int wh = std::min((int)(r.bottom - r.top), (int)(work.bottom - work.top));
    int sx = work.left + std::max(0, ((int)(work.right - work.left) - ww) / 2);
    int sy = work.top + std::max(0, ((int)(work.bottom - work.top) - wh) / 2);
    gWnd = CreateWindowExW(0, wc.lpszClassName, APP_TITLE, WS_OVERLAPPEDWINDOW, sx, sy, ww, wh, nullptr, nullptr, inst, nullptr);
    if (!gWnd) return 1;
    RECT cr; GetClientRect(gWnd, &cr);
    createBackBuffer(cr.right, cr.bottom);
    ShowWindow(gWnd, show);
    UpdateWindow(gWnd);

    LARGE_INTEGER freq, last, now;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&last);
    double acc = 0;
    MSG msg;
    while (gRunning) {
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) { gRunning = false; break; }
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        if (!gRunning) break;
        QueryPerformanceCounter(&now);
        double dt = (double)(now.QuadPart - last.QuadPart) / freq.QuadPart;
        last = now;
        acc += std::min(dt, 0.1);
        int steps = 0;
        while (acc >= FRAME_DT && steps < 4) { update(FRAME_DT); acc -= FRAME_DT; steps++; }
        if (steps == 4) acc = 0;
        if (IsIconic(gWnd)) { Sleep(30); continue; }
        renderFrame();
        present();
        QueryPerformanceCounter(&now);
        double spent = (double)(now.QuadPart - last.QuadPart) / freq.QuadPart;
        if (spent < 0.008) Sleep(1);
    }
    audio::shutdown();
    timeEndPeriod(1);
    GdiplusShutdown(gtok);
    return 0;
}
