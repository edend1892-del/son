// Données du comparatif. Pour mettre le site à jour, modifier uniquement ce fichier.
// Scores : tableau comparatif publié par Anthropic sur la page de Claude Fable 5.2
// (https://www.anthropic.com/claude/fable), consulté le 12 novembre 2026.

window.BENCH_DATA = {
  updated: "2026-11-12",

  models: {
    fable: { name: "Claude Fable 5.2", short: "Fable 5.2", id: "claude-fable-5-2" },
    opus: { name: "Claude Opus 5.5", short: "Opus 5.5", id: "claude-opus-5-5" },
  },

  categories: {
    code: "Code agentique",
    agents: "Agents et outils",
    knowledge: "Travail intellectuel",
    reasoning: "Raisonnement et vision",
  },

  // unit "pct" : score en % (axe commun 0-100). unit "elo" : classement Elo, hors axe.
  benchmarks: [
    { id: "frontiercode", name: "FrontierCode 2.0", category: "code", unit: "pct",
      fable: 49.1, opus: 45.5, note: "Fable 5.2 mesuré à l'effort xhigh." },
    { id: "frontierswe", name: "FrontierSWE v2", category: "code", unit: "pct",
      fable: 69.9, opus: 62.3 },
    { id: "automationbench", name: "AutomationBench", category: "agents", unit: "pct",
      fable: 51.4, opus: 42.5, note: "Workflows métier." },
    { id: "tbscience", name: "Terminal-Bench-Science 0.1", category: "agents", unit: "pct",
      fable: 74.6, opus: 58.7, note: "Recherche scientifique agentique." },
    { id: "wandr", name: "WANDR", category: "agents", unit: "pct",
      fable: 82.1, opus: 72.3, note: "Recherche agentique, score « relaxed »." },
    { id: "osworld", name: "OSWorld 2.1", category: "agents", unit: "pct",
      fable: 89.3, opus: 87.2, note: "Utilisation d'ordinateur, jeu hors ligne, score partiel." },
    { id: "robodojo", name: "RoboDojo Sim", category: "agents", unit: "pct",
      fable: 64.9, opus: 39.4, note: "Robotique simulée, évaluation interne d'Anthropic." },
    { id: "briefcase", name: "AA-Briefcase v1.1 (grille)", category: "knowledge", unit: "pct",
      fable: 66.1, opus: 61.2, note: "Notation par grille d'évaluation." },
    { id: "briefcase-elo", name: "AA-Briefcase v1.1 (Elo)", category: "knowledge", unit: "elo",
      fable: 1785, opus: 1800, note: "Classement Elo, non comparable aux scores en %." },
    { id: "rli", name: "Remote Labor Index", category: "knowledge", unit: "pct",
      fable: 41.3, opus: 21.3, note: "Fable 5.2 mesuré à l'effort high." },
    { id: "hle", name: "Humanity's Last Exam", category: "reasoning", unit: "pct",
      fable: 74.2, opus: 67.7, note: "Avec outils." },
    { id: "chartography", name: "Chartography", category: "reasoning", unit: "pct",
      fable: 73.4, opus: 64.4, note: "Lecture de graphiques, sans outils." },
  ],

  // Prix API Anthropic, en dollars par million de tokens.
  pricing: [
    { id: "input", label: "Entrée", fable: 8, opus: 4 },
    { id: "output", label: "Sortie", fable: 40, opus: 20 },
    { id: "fast-input", label: "Entrée, mode rapide", fable: 16, opus: 8 },
    { id: "fast-output", label: "Sortie, mode rapide", fable: 80, opus: 40 },
  ],
  cacheRead: { fable: 0.2, opus: 0.2 },

  specs: [
    { label: "Identifiant API", fable: "claude-fable-5-2", opus: "claude-opus-5-5", mono: true },
    { label: "Annonce", fable: "9 novembre 2026", opus: "22 septembre 2026" },
    { label: "Entrée (par million de tokens)", fable: "8 $", opus: "4 $" },
    { label: "Sortie (par million de tokens)", fable: "40 $", opus: "20 $" },
    { label: "Lecture de cache (par million de tokens)", fable: "0,20 $", opus: "0,20 $" },
    { label: "Mode rapide (entrée / sortie)", fable: "16 $ / 80 $", opus: "8 $ / 40 $" },
    { label: "Fenêtre de contexte", fable: "1 M tokens", opus: "1 M tokens" },
    { label: "Sortie maximale", fable: "128 K tokens", opus: "128 K tokens" },
    { label: "Réflexion", fable: "Toujours active", opus: "Toujours active" },
    { label: "Niveaux d'effort", fable: "low à max", opus: "low à max" },
    { label: "Effort par défaut", fable: "high", opus: "medium" },
  ],
};
