const TG   = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const SB   = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_ANON_KEY;
const OKEY = process.env.OPENAI_API_KEY;

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function tgPost(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

function sendMessage(chatId, text, extra = {}) {
  return tgPost('sendMessage', { chat_id: chatId, text, ...extra });
}

function answerCallback(id, text = '') {
  return tgPost('answerCallbackQuery', { callback_query_id: id, text });
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sbHeaders() {
  return {
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };
}

async function sbGet(key) {
  const r = await fetch(`${SB}/rest/v1/dashboard_data?key=eq.${key}&select=value`, {
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });
  const rows = await r.json();
  return rows?.[0]?.value ?? null;
}

async function sbSet(key, value) {
  await fetch(`${SB}/rest/v1/dashboard_data`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
}

// ── Whisper transcription ─────────────────────────────────────────────────────

async function transcribe(fileId) {
  const fileRes  = await fetch(`${TG}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.result?.file_path) throw new Error('Could not get file from Telegram');

  const audioRes    = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
  const audioBuffer = await audioRes.arrayBuffer();

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');

  const whisperRes  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OKEY}` },
    body: form,
  });
  const whisperData = await whisperRes.json();
  if (!whisperData.text) {
    throw new Error(whisperData.error?.message || `Whisper error (HTTP ${whisperRes.status})`);
  }
  return whisperData.text;
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function routeEntry(type, transcription) {
  const today = new Date().toISOString().split('T')[0];

  if (type === 'task') {
    const tasks = (await sbGet('meridian_tasks')) || [];
    const maxId = tasks.length ? Math.max(...tasks.map(t => t.id || 0)) : 0;
    tasks.push({ id: maxId + 1, text: transcription, tag: 'PERSONAL', due: 'someday', done: false, starred: false, time: '' });
    await sbSet('meridian_tasks', tasks);
    return 'Added to your task list.';
  }

  if (type === 'journal') {
    const journal  = (await sbGet('meridian_journal')) || {};
    const existing = journal[today] || '';
    journal[today] = existing ? `${existing}\n\n${transcription}` : transcription;
    await sbSet('meridian_journal', journal);
    return `Added to your journal for ${today}.`;
  }

  if (type === 'note') {
    const notes = (await sbGet('meridian_voice_notes')) || [];
    notes.unshift({ text: transcription, date: today, ts: Date.now() });
    await sbSet('meridian_voice_notes', notes.slice(0, 50));
    return 'Saved as a voice note.';
  }

  return 'Saved.';
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Always return 200 so Telegram doesn't retry endlessly
  res.status(200).json({ ok: true });

  if (req.method !== 'POST') return;

  let update = req.body;
  // Manually parse body if Vercel didn't do it
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch { return; }
  }
  if (!update) return;

  try {
    // ── Button press ──
    if (update.callback_query) {
      const cq      = update.callback_query;
      const type    = cq.data;
      const chatId  = cq.message.chat.id;
      const msgText = cq.message.text || '';

      await answerCallback(cq.id, 'Saving…');

      const match        = msgText.match(/"([^"]+)"/);
      const transcription = match ? match[1] : null;

      if (!transcription) {
        await sendMessage(chatId, '⚠️ Could not read the transcription. Please try again.');
        return;
      }

      const confirmation = await routeEntry(type, transcription);
      await tgPost('editMessageText', {
        chat_id: chatId, message_id: cq.message.message_id,
        text: `✅ ${confirmation}\n\n"${transcription}"`,
      });
      return;
    }

    // ── Voice message ──
    const msg = update.message;
    if (!msg) return;

    if (msg.voice || msg.audio) {
      const chatId = msg.chat.id;
      const fileId = (msg.voice || msg.audio).file_id;

      const sentMsg = await sendMessage(chatId, '🎙 Transcribing…');
      const botMsgId = sentMsg?.result?.message_id;

      let transcription;
      try {
        transcription = await transcribe(fileId);
      } catch (e) {
        await sendMessage(chatId, `❌ Transcription failed: ${e.message}`);
        return;
      }

      const replyBody = {
        chat_id: chatId,
        text: `📝 Transcription:\n"${transcription}"\n\nWhere should I save this?`,
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 Task',    callback_data: 'task' },
            { text: '📓 Journal', callback_data: 'journal' },
            { text: '🗒 Note',   callback_data: 'note' },
          ]],
        },
      };

      if (botMsgId) {
        await tgPost('editMessageText', { ...replyBody, message_id: botMsgId });
      } else {
        await tgPost('sendMessage', replyBody);
      }
      return;
    }

    // ── Any other message ──
    if (msg.chat?.id) {
      await sendMessage(msg.chat.id, '🎙 Send me a voice message and I\'ll transcribe it to your dashboard.');
    }

  } catch (e) {
    // Swallow errors — 200 already sent
    console.error('Telegram handler error:', e.message);
  }
}
