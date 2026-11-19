import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const supported =
  'en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi'.split(
    ' ',
  );
const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** Directives may be written either in English or in the requested teaching language. */
export function localSpeechLanguage(directive = '') {
  const normalized = directive.toLowerCase();
  if (supported.includes(normalized)) return normalized;
  let first = Infinity;
  let language = 'na';
  for (const code of supported) {
    const native = new Intl.DisplayNames([code], { type: 'language' });
    for (const name of [native.of(code), englishNames.of(code)]) {
      if (!name) continue;
      const index = normalized.indexOf(name.toLowerCase());
      if (index >= 0 && index < first) {
        first = index;
        language = code;
      }
    }
  }
  return language;
}

/** Only explicit provider reservation refusals qualify. Application quotas still apply. */
export function providerReservationRefused(error: unknown): boolean {
  const data = (
    error as { cause?: { data?: { error?: { metadata?: { reason?: string } } } } } | null
  )?.cause?.data?.error?.metadata;
  return data?.reason === 'weight_exceeds_budget' || data?.reason === 'in_flight_budget_exhausted';
}

export async function synthesizeLocally(
  text: string,
  voice: string,
  speed: number,
  language: string | undefined,
  signal?: AbortSignal,
) {
  if (!text.trim() || text.length > 8000) throw new Error('Unsupported narration length');
  const dir = await mkdtemp(join(tmpdir(), 'openmaic-speech-'));
  const path = join(dir, 'clip.wav');
  try {
    await execute(
      '/opt/narration/speak',
      [
        localSpeechLanguage(language),
        voice.toLowerCase() === 'puck' ? '5' : '0',
        String(Math.min(2, Math.max(0.5, speed || 1))),
        path,
        ' ' + text,
      ],
      { signal, timeout: 60_000, maxBuffer: 256 * 1024 },
    );
    const audio = await readFile(path);
    if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Empty WAV');
    return {
      audio: new Uint8Array(audio),
      format: 'wav',
      providerId: 'local',
      modelId: 'supertonic-3',
    };
  } catch {
    signal?.throwIfAborted();
    // Native process errors include the command line, which contains private course text.
    throw new Error('Local narration is unavailable');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
