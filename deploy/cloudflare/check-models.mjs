import assert from 'node:assert/strict';
const headers = {
  Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY,
  'content-type': 'application/json',
};
for (const [language, input, expected] of [
  ['tr', 'Bir üçgenin iç açılarının toplamı yüz seksen derecedir.', 'üçgen'],
  [
    'en',
    'The sum of the interior angles of a triangle is one hundred and eighty degrees.',
    'triangle',
  ],
]) {
  const start = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'elevenlabs/eleven-multilingual-v2',
      voice: 'sarah',
      input,
      response_format: 'mp3',
    }),
  });
  if (!r.ok) throw Error('TTS ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const audio = Buffer.from(await r.arrayBuffer());
  console.log(language, 'TTS', r.status, audio.length, 'bytes', Date.now() - start, 'ms');
  assert.ok(audio.length > 1000);
  const asr = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'openai/gpt-4o-transcribe',
      input_audio: { data: audio.toString('base64'), format: 'mp3' },
      language,
    }),
  });
  const j = await asr.json();
  console.log(language, 'ASR', asr.status, j.text || j.error?.message);
  assert.ok(j.text?.toLocaleLowerCase(language).includes(expected));
}
