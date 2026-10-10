// Temporary helper used once to make the reel's voiceover. Removed afterwards.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.k !== 'reel-vo-7f3k') return res.status(404).end();
  const text = String(req.query.q || '').slice(0, 300);
  const engine = req.query.e || 'edge';
  const voice = req.query.v || 'he-IL-AvriNeural';
  const rate = req.query.r || '+0%';
  try {
    let buf;
    if (engine === 'edge') {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const out = tts.toStream(text, { rate });
      const stream = out.audioStream || out;
      const chunks = [];
      await new Promise((ok, bad) => { stream.on('data', c => chunks.push(c)); stream.on('end', ok); stream.on('close', ok); stream.on('error', bad); });
      buf = Buffer.concat(chunks);
      try { tts.close(); } catch {}
    } else {
      const r = await fetch('https://translate.google.com/translate_tts?ie=UTF-8&tl=iw&client=tw-ob&q=' + encodeURIComponent(text), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('google ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    }
    return res.status(200).json({ ok: true, bytes: buf.length, b64: buf.toString('base64') });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
