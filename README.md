# GTA Sales Tracker

Site statique (HTML/CSS/JS, sans dépendance) qui affiche :

- **GTA VI en direct** : un compteur d'exemplaires vendus et de chiffre d'affaires, extrapolé à partir des estimations publiques (Sensor Tower, Alinea Analytics), et la courbe des ventes cumulées.
- **Comparer tous les GTA** : les ventes totales de chaque épisode, un comparateur « face-à-face » et un tableau complet.

> Aucun chiffre officiel n'est publié en temps réel : le compteur est une **estimation** (voir la section « Sources et méthode » du site).

## Lancer le site

Ouvre `index.html` dans un navigateur, ou :

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

## Mettre à jour les chiffres

Tout est dans `data.js` : points d'estimation de GTA VI (`GTA6_ANCHORS`), paramètres du modèle (`GTA6_MODEL`) et ventes des autres épisodes (`GAMES`).
