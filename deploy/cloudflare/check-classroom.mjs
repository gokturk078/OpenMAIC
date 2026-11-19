import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = JSON.parse(fs.readFileSync(new URL('wrangler.jsonc', import.meta.url))).vars
  .PUBLIC_ORIGIN;
const { cookie } = JSON.parse(fs.readFileSync(new URL('.secrets.session-0.json', import.meta.url)));
function call(path, body) {
  return fetch(base + path, {
    method: 'POST',
    headers: {
      origin: base,
      cookie,
      ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}
const checks = {
  async speech() {
    const r = await call('/api/generate/tts', {
      text: 'Bir üçgenin iç açılarının toplamı yüz seksen derecedir.',
      audioId: crypto.randomUUID(),
    });
    const j = await r.json();
    assert.ok(r.ok && j.base64, 'TTS ' + r.status + ' ' + j.error);
    const f = new FormData();
    f.set(
      'audio',
      new Blob([Buffer.from(j.base64, 'base64')], { type: 'audio/wav' }),
      'angles.wav',
    );
    f.set('language', 'tr');
    const asr = await call('/api/transcription', f);
    const a = await asr.json();
    assert.ok(asr.ok && /üçgen/i.test(a.text), 'ASR ' + asr.status + ' ' + a.error);
    console.log('PASS deployed TTS → ASR', a.text);
  },
  async quiz() {
    const r = await call('/api/quiz-grade', {
      question: 'What is the sum of the interior angles of a Euclidean triangle?',
      userAnswer: '180 degrees',
      points: 5,
      language: 'en',
    });
    const j = await r.json();
    console.log('grade', r.status, JSON.stringify(j).slice(0, 210));
    assert.ok(r.ok && (j.score === 5 || j.result?.score === 5 || j.data?.score === 5));
  },
  async teacher() {
    const r = await call('/api/chat/pi', {
      messages: [
        {
          id: 'question',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'The angles are 50 and 60 degrees. What is the third angle of this triangle? Explain briefly.',
            },
          ],
        },
      ],
      storeState: { stage: null, scenes: [], currentSceneId: null, mode: 'playback' },
      config: {
        agentIds: ['teacher'],
        agentConfigs: [
          {
            id: 'teacher',
            name: 'Teacher',
            role: 'teacher',
            persona: 'Teach elementary geometry in English.',
            allowedActions: [],
          },
        ],
      },
    });
    const text = await r.text();
    console.log(
      'teacher',
      r.status,
      text.length,
      /70|seventy/i.test(text),
      'events',
      text.slice(0, 120),
    );
    assert.ok(r.ok && /70|seventy/i.test(text));
  },
};
const results = await Promise.allSettled(
  Object.entries(checks).map(async ([name, fn]) => {
    await fn();
    console.log('PASS', name);
  }),
);
for (const r of results)
  if (r.status === 'rejected') {
    console.log('FAIL', r.reason.message);
    process.exitCode = 1;
  }
