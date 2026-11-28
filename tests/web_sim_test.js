// Banc d'essai du moteur JavaScript (web/core.js), identique à tests/sim_test.cpp :
//   node tests/web_sim_test.js [-v] [numéro de niveau]
'use strict';
const TV = require('../web/core.js');

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const only = args.filter(a => a !== '-v').map(Number)[0];
const levels = TV.makeLevels();
let ok = 0, n = 0, falsePass = 0;

for (let i = 0; i < levels.length; i++) {
    if (only && i !== only - 1) continue;
    const L = levels[i];
    TV.ref.errors = 0;
    const D = TV.ref.build(i, L);
    if (!D) continue;
    n++;
    const cost = D.cost();
    const S = new TV.Sim();
    S.init(L, D);
    let up = false, down = false, wonAt = -1;
    while (S.time < 60) {
        S.frame(1);
        if (i === 6 && !up && S.time >= 9.5) { S.toggleHydraulics(); up = true; }
        if (i === 6 && up && !down && S.time >= 17.5) { S.toggleHydraulics(); down = true; }
        if (S.won && wonAt < 0) wonAt = S.time;
        if (S.lost || (wonAt > 0 && S.time > wonAt + 1)) break;
        if (verbose && Math.round(S.time * 60) % 60 === 0)
            console.log(`    t=${S.time.toFixed(1)} arrivés=${S.arrived}/${S.total} ruptures=${S.breaks} stress=${S.maxStress.toFixed(2)}`);
    }
    const pass = S.won && cost <= L.budget && TV.ref.errors === 0;
    if (pass) ok++;
    console.log(`  niveau ${String(i + 1).padStart(2)} ${L.name.padEnd(17)} coût ${cost.toFixed(0).padStart(6)} / ${String(L.budget).padStart(6)}  ${pass ? 'OK   ' : 'ÉCHEC'}` +
                `  arrivés ${S.arrived}/${S.total}  ruptures ${S.breaks}  stressMax ${S.maxStress.toFixed(2)}  t=${S.time.toFixed(1)} ${S.lost ? S.failMsg : ''}` +
                (TV.ref.errors ? `  (${TV.ref.errors} poutres refusées)` : ''));

    // contrôle inverse : sans pont, le niveau doit échouer
    const E = new TV.Sim();
    E.init(L, TV.initialDesign(L));
    while (E.time < 40 && !E.won && !E.lost) E.frame(1);
    if (E.won) { console.log(`  ERREUR : niveau ${i + 1} réussi sans pont !`); falsePass++; }
}
console.log(`${ok} / ${n} niveaux réussis`);
console.log(`contrôle sans pont : ${falsePass ? 'ÉCHEC' : 'OK (tous échouent)'}`);
process.exit(ok === n && !falsePass ? 0 : 1);
