#!/bin/sh
set -eu
cd /opt/narration/model
exec /opt/narration/loader --library-path /opt/narration/lib /opt/narration/synthesize \
  --supertonic-duration-predictor=duration_predictor.int8.onnx \
  --supertonic-text-encoder=text_encoder.int8.onnx \
  --supertonic-vector-estimator=vector_estimator.int8.onnx \
  --supertonic-vocoder=vocoder.int8.onnx --supertonic-tts-json=tts.json \
  --supertonic-unicode-indexer=unicode_indexer.bin --supertonic-voice-style=voice.bin \
  --num-threads=2 --num-steps=5 --lang="$1" --sid="$2" --speed="$3" --output-filename="$4" "$5"
