#!/usr/bin/env bash
# Assemble le dossier publié sur Netlify : jeu web + téléchargements (APK, EXE).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf site && mkdir -p site
cp web/index.html web/core.js web/game.js web/manifest.webmanifest web/_headers \
   web/icon-192.png web/icon-512.png web/apercu.jpg site/
cp dist/Travee.apk dist/Travee.exe site/
printf '[build]\n  publish = "."\n  command = ""\n' > site/netlify.toml
echo "OK : site/ ($(du -sh site | cut -f1))"
