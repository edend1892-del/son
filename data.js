// =====================================================================
//  Données du site. Modifie ce fichier pour mettre à jour les chiffres.
//  Ventes en millions d'exemplaires, recettes en millions de dollars US.
// =====================================================================

// Sortie de GTA VI : 19 novembre 2026, minuit heure de New York (05:00 UTC).
const GTA6_LAUNCH = Date.UTC(2026, 10, 19, 5, 0, 0);

// Points d'ancrage publiés pour GTA VI (jours depuis la sortie → millions cumulés).
// Ce sont des estimations d'analystes, pas des chiffres officiels.
const GTA6_ANCHORS = [
  { day: 0,    copies: 16.0, label: "Précommandes débloquées (hypothèse)", source: null },
  { day: 0.3,  copies: 19.1, label: "Matin de la sortie", source: "Sensor Tower" },
  { day: 1,    copies: 24.6, label: "Fin du jour 1 (numérique)", source: "Sensor Tower" },
  { day: 4,    copies: 44.9, label: "Fin du premier week-end", source: "Alinea Analytics" },
];

// Modèle après le dernier ancrage : rythme qui décroît exponentiellement + plancher.
const GTA6_MODEL = {
  halfLifeDays: 3.5,     // le rythme de ventes est divisé par 2 tous les 3,5 jours
  floorPerDay: 0.15,     // plancher : 150 000 ventes / jour
  avgPriceUSD: 89.5,     // ≈ 4,0 Md$ / 44,9 M exemplaires (Alinea)
};

// Tous les GTA principaux avec un chiffre public connu.
// lifetime = ventes totales (millions) ; null pour GTA VI (calculé en direct).
const GAMES = [
  { id: "gta3",  name: "GTA III",                     year: 2001, lifetime: 14.5, day1: null, day1Rev: null, platforms: "PS2",            handheld: false, approx: true },
  { id: "gtavc", name: "GTA Vice City",               year: 2002, lifetime: 17.5, day1: null, day1Rev: null, platforms: "PS2",            handheld: false, approx: true },
  { id: "gtasa", name: "GTA San Andreas",             year: 2004, lifetime: 27.5, day1: null, day1Rev: null, platforms: "PS2",            handheld: false, approx: true },
  { id: "gtalcs",name: "GTA Liberty City Stories",    year: 2005, lifetime: 8.0,  day1: null, day1Rev: null, platforms: "PSP",            handheld: true,  approx: true },
  { id: "gtavcs",name: "GTA Vice City Stories",       year: 2006, lifetime: 4.5,  day1: null, day1Rev: null, platforms: "PSP",            handheld: true,  approx: true },
  { id: "gta4",  name: "GTA IV",                      year: 2008, lifetime: 25.0, day1: 3.6,  day1Rev: 310,  platforms: "PS3, Xbox 360",  handheld: false, approx: true },
  { id: "gta5",  name: "GTA V",                       year: 2013, lifetime: 220,  day1: 11.2, day1Rev: 815,  platforms: "PS3, Xbox 360",  handheld: false, approx: true },
  { id: "gta6",  name: "GTA VI",                      year: 2026, lifetime: null, day1: 24.6, day1Rev: 2360, platforms: "PS5, Xbox Series", handheld: false, approx: false, live: true },
];
