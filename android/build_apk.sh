#!/usr/bin/env bash
# Construit dist/Travee.apk (application Android autonome, hors ligne).
#   Ubuntu/Debian : sudo apt install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner openjdk-17-jdk-headless
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
AJ=$SDK/platforms/android-23/android.jar
DX=$(command -v dalvik-exchange || command -v dx)
B=build
rm -rf "$B" assets && mkdir -p "$B/gen" "$B/obj" "$B/dex" assets ../dist

# 1. le jeu web devient les ressources de l'application
cp ../web/core.js ../web/game.js ../web/icon-192.png assets/
sed 's#<script src="core.js"></script>#<script>window.TRAVEE_APP = true;</script>\n<script src="core.js"></script>#' ../web/index.html > assets/index.html

# 2. icônes du lanceur
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p res/mipmap-${d%%:*}
  [ -f res/mipmap-${d%%:*}/ic_launcher.png ] || { echo "icône manquante : res/mipmap-${d%%:*}/ic_launcher.png"; exit 1; }
done

# 3. ressources -> R.java, compilation Java -> DEX
aapt package -f -m -J "$B/gen" -M AndroidManifest.xml -S res -I "$AJ"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$AJ" -d "$B/obj" \
      src/fr/travee/jeu/MainActivity.java "$B/gen/fr/travee/jeu/R.java"
"$DX" --dex --min-sdk-version=21 --output="$B/dex/classes.dex" "$B/obj"

# 4. empaquetage, alignement, signature
aapt package -f -M AndroidManifest.xml -S res -A assets -I "$AJ" -0 arsc -F "$B/unsigned.apk"
(cd "$B/dex" && aapt add ../unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"

KS=keystore/travee.jks
if [ ! -f "$KS" ]; then
  mkdir -p keystore
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > keystore/motdepasse.txt
  keytool -genkeypair -keystore "$KS" -alias travee -keyalg RSA -keysize 2048 -validity 10000 \
          -storepass "$(cat keystore/motdepasse.txt)" -keypass "$(cat keystore/motdepasse.txt)" \
          -dname "CN=Travee, O=Travee, C=FR" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-key-alias travee --ks-pass file:keystore/motdepasse.txt \
               --out ../dist/Travee.apk "$B/aligned.apk"
apksigner verify ../dist/Travee.apk
echo "OK : dist/Travee.apk"
