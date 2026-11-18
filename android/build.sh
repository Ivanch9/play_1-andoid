#!/usr/bin/env bash
# Сборка подписанного APK без Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Запуск из корня репозитория: ./android/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AND="$ROOT/android"
OUT="$AND/build"

TOOLS="${ANDROID_TOOLS:-$HOME/android-tools}"
SDK="${ANDROID_SDK:-$TOOLS/sdk}"
JAVA_HOME="${JAVA_HOME:-$TOOLS/jdk}"
BT="$SDK/build-tools/${BUILD_TOOLS:-35.0.0}"
JAR="$SDK/platforms/android-${PLATFORM:-35}/android.jar"
KS="${NEONRIFT_KEYSTORE:-$TOOLS/neonrift.p12}"
KS_PASS_FILE="$TOOLS/neonrift.pass"
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-2.0}"
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

for f in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$JAR" "$JAVA_HOME/bin/javac"; do
  [ -e "$f" ] || { echo "Не найдено: $f (см. README, раздел Android)" >&2; exit 1; }
done

# Пароль ключа: переменная окружения или файл вне репозитория (создаётся при первой сборке)
if [ -z "${NEONRIFT_KS_PASS:-}" ]; then
  if [ ! -f "$KS_PASS_FILE" ]; then
    umask 077
    head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$KS_PASS_FILE"
  fi
  NEONRIFT_KS_PASS="$(cat "$KS_PASS_FILE")"
fi
export NEONRIFT_KS_PASS
if [ ! -f "$KS" ]; then
  echo "→ создаю ключ подписи $KS (сохраните его: без него не выйдет обновлять приложение)"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias neonrift \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Neon Rift" \
    -storepass "$NEONRIFT_KS_PASS" -keypass "$NEONRIFT_KS_PASS" >/dev/null
  chmod 600 "$KS"
fi

rm -rf "$OUT"
mkdir -p "$OUT/assets/js" "$OUT/classes" "$OUT/dex"

echo "→ ассеты"
cp "$ROOT/index.html" "$OUT/assets/"
cp "$ROOT"/js/*.js "$OUT/assets/js/"

echo "→ ресурсы"
"$BT/aapt2" compile --dir "$AND/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" \
  --manifest "$AND/AndroidManifest.xml" -A "$OUT/assets" "$OUT/res.zip" \
  --min-sdk-version 26 --target-sdk-version 35 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

echo "→ java"
javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 \
  -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -d "$OUT/classes" \
  $(find "$AND/java" -name '*.java')
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class')

echo "→ упаковка и подпись"
(cd "$OUT/dex" && "$BT/aapt" add "$OUT/unsigned.apk" classes.dex >/dev/null)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias neonrift \
  --ks-pass env:NEONRIFT_KS_PASS --key-pass env:NEONRIFT_KS_PASS \
  --out "$OUT/neon-rift.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/neon-rift.apk"

rm -rf "$OUT/classes" "$OUT/dex" "$OUT/res.zip" "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/assets" "$OUT"/*.idsig
echo "Готово: $OUT/neon-rift.apk ($(du -h "$OUT/neon-rift.apk" | cut -f1))"
