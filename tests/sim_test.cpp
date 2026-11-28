// Banc d'essai sans affichage : construit une conception de référence pour
// chaque niveau, simule, et vérifie que tous les véhicules arrivent sans
// dépasser le budget.   g++ -O2 -std=c++17 tests/sim_test.cpp -o sim_test
#include "../src/core.h"
#include <cstdio>
#include <cstring>
#include <clocale>

using namespace tv;

static int runLevel(int idx, const Level& L, bool verbose, float extraHydAt = -1, float hydDown = -1) {
    Design D;
    if (!ref::build(idx, L, D)) { printf("  niveau %2d : pas de référence\n", idx + 1); return 0; }
    float cost = D.cost();
    Sim S;
    S.init(L, D);
    float maxT = 60;
    bool hydUp = false, hydLowered = false;
    float wonAt = -1;
    while (S.time < maxT) {
        S.frame(1.0f);
        if (extraHydAt > 0 && !hydUp && S.time >= extraHydAt) { S.toggleHydraulics(); hydUp = true; }
        if (hydDown > 0 && hydUp && !hydLowered && S.time >= hydDown) { S.toggleHydraulics(); hydLowered = true; }
        if (S.won && wonAt < 0) wonAt = S.time;
        if (S.lost) break;
        if (wonAt > 0 && S.time > wonAt + 1) break;
        if (verbose && ((int)(S.time * 60) % 60) == 0) {
            printf("    t=%5.1f arrivés=%d/%d ruptures=%d stressMax=%.2f", S.time, S.arrived, S.total, S.breaks, S.maxStress);
            for (auto& v : S.veh) if (!v.gone) { V2 c = S.vehCenter(v); printf("  [%ls %.1f,%.1f]", vtype(v.type).name, c.x, c.y); }
            printf("\n");
        }
    }
    bool ok = S.won && cost <= L.budget;
    printf("  niveau %2d %-18ls coût %7.0f / %6d  %s  arrivés %d/%d  ruptures %d  stressMax %.2f  t=%.1f %ls\n",
           idx + 1, L.name.c_str(), cost, L.budget, ok ? "OK  " : "ÉCHEC", S.arrived, S.total, S.breaks, S.maxStress, S.time,
           S.lost ? S.failMsg.c_str() : L"");
    return ok ? 1 : 0;
}

int main(int argc, char** argv) {
    setlocale(LC_ALL, "C.UTF-8");
    auto levels = makeLevels();
    int only = -1; bool verbose = false;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-v")) verbose = true;
        else only = atoi(argv[i]) - 1;
    }
    int ok = 0, n = 0;
    for (int i = 0; i < (int)levels.size(); i++) {
        if (only >= 0 && i != only) continue;
        float hu = -1, hd = -1;
        if (i == 6) { hu = 9.5f; hd = 17.5f; }
        Design D;
        if (!ref::build(i, levels[i], D)) continue;
        n++;
        ok += runLevel(i, levels[i], verbose, hu, hd);
    }
    printf("%d / %d niveaux réussis\n", ok, n);
    // contrôle inverse : sans pont, aucun niveau ne doit être réussi
    int falsePass = 0;
    for (int i = 0; i < (int)levels.size(); i++) {
        if (only >= 0 && i != only) continue;
        Sim S; Design D = initialDesign(levels[i]);
        S.init(levels[i], D);
        while (S.time < 40 && !S.won && !S.lost) S.frame(1.0f);
        if (S.won) { printf("  ERREUR : niveau %d réussi sans pont !\n", i + 1); falsePass++; }
    }
    printf("contrôle sans pont : %s\n", falsePass ? "ÉCHEC" : "OK (tous échouent)");
    return (ok == n && !falsePass) ? 0 : 1;
}
