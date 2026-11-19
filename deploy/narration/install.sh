#!/bin/sh
set -eu
out=/opt/narration
mkdir -p "$out/lib" "$out/model" /tmp/tts-dist
fetch() {
  curl --fail --location --retry 3 -sS "$1" -o /tmp/tts-archive
  echo "$2  /tmp/tts-archive" | sha256sum -c -
  tar -xjf /tmp/tts-archive --strip-components=1 -C "$3"
}
fetch https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.2/sherpa-onnx-v2.0.2-linux-x64-shared.tar.bz2 e7f65778bfb891ec98db56c2cfc37b968d7f56e57271986a8dd2cd0c21d002c9 /tmp/tts-dist
fetch https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2 82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427 "$out/model"
cp /tmp/tts-dist/bin/sherpa-onnx-offline-tts "$out/synthesize"
# Keep the glibc speech runtime private. The Next.js server continues to use musl.
LD_LIBRARY_PATH=/tmp/tts-dist/lib ldd "$out/synthesize" > /tmp/tts-libs
if grep -q 'not found' /tmp/tts-libs; then cat /tmp/tts-libs; exit 1; fi
awk '/=> \// {print $3}' /tmp/tts-libs | while read -r lib; do cp -L "$lib" "$out/lib/"; done
cp -L /lib64/ld-linux-x86-64.so.2 "$out/loader"
curl -fsSL https://huggingface.co/Supertone/supertonic-3/resolve/724fb5abbf5502583fb520898d45929e62f02c0b/LICENSE -o "$out/model/LICENSE"
curl -fsSL https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v2.0.2/LICENSE -o "$out/LICENSE-sherpa"
rm -rf /tmp/tts-dist /tmp/tts-archive
