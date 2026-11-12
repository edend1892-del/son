# Claude Fable 5.2 vs Claude Opus 5.5

Site statique de comparaison entre Claude Fable 5.2 et Claude Opus 5.5 : scores sur 12 benchmarks, écarts, prix et simulateur de coût mensuel.

## Lancer le site

Aucune dépendance ni étape de build. Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
```

## Fichiers

- `index.html` : structure de la page
- `styles.css` : styles, thèmes clair et sombre
- `data.js` : toutes les données (scores, prix, fiche technique)
- `app.js` : graphiques, filtres, infobulles, simulateur

Pour mettre les chiffres à jour, modifier uniquement `data.js`.

## Sources

- Scores : tableau comparatif de la [page de Claude Fable 5.2](https://www.anthropic.com/claude/fable), chiffres communiqués par Anthropic.
- Prix et caractéristiques : [tarifs](https://platform.claude.com/docs/en/about-claude/pricing) et [documentation des modèles](https://platform.claude.com/docs/en/about-claude/models/overview).

Site indépendant, sans lien avec Anthropic.
