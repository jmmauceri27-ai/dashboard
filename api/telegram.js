export const config = { api: { bodyParser: true } };

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

function answerCallback(callbackQueryId, text = '') {
  return tgPost('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
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

async function savePending(messageId, chatId, transcription) {
  await fetch(`${SB}/rest/v1/voice_pending`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ message_id: messageId, chat_id: chatId, transcription }),
  });
}

async function getPending(messageId, chatId) {
  const r = await fetch(
    `${SB}/rest/v1/voice_pending?message_id=eq.${messageId}&chat_id=eq.${chatId}&select=transcription`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
  );
  const rows = await r.json();
  return rows?.[0]?.transcription ?? null;
}

async function deletePending(messageId, chatId) {
  await fetch(`${SB}/rest/v1/voice_pending?message_id=eq.${messageId}&chat_id=eq.${chatId}`, {
    method: 'DELETE',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });
}

// ── Whisper transcription ─────────────────────────────────────────────────────

async function transcribe(fileId) {
  // Get file path from Telegram
  const fileRes = await fetch(`${TG}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  const audioRes = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
  );
  const audioBuffer = await audioRes.arrayBuffer();

  // Send to Whisper
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OKEY}` },
    body: form,
  });
  const whisperData = await whisperRes.json();
  return whisperData.text;
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function routeEntry(type, transcription) {
  const today = new Date().toISOString().split('T')[0];

  if (type === 'task') {
    const tasks = (await sbGet('meridian_tasks')) || [];
    const maxId = tasks.length ? Math.max(...tasks.map(t => t.id || 0)) : 0;
    tasks.push({
      id: maxId + 1,
      text: transcription,
      tag: 'PERSONAL',
      due: 'someday',
      done: false,
      starred: false,
      time: '',
    });
    await sbSet('meridian_tasks', tasks);
    return 'Added to your task list.';
  }

  if (type === 'journal') {
    const journal = (await sbGet('meridian_journal')) || {};
    const existing = journal[today] || '';
    journal[today] = existing ? `${existing}\n\n${transcription}` : transcription;
    await sbSet('meridian_journal', journal);
    return `Added to your journal for ${today}.`;
  }

  if (type === 'note') {
    const notes = (await sbGet('meridian_voice_notes')) || [];
    notes.unshift({ text: transcription, date: today, ts: Date.now() });
    await sbSet('meridian_voice_notes', notes.slice(0, 50)); // keep last 50
    return 'Saved as a voice note.';
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;

  // Button press — route the transcription
  if (update.callback_query) {
    const cq     = update.callback_query;
    const [type, msgId] = cq.data.split(':');
    const chatId = cq.message.chat.id;

    await answerCallback(cq.id, 'Saving…');

    const transcription = await getPending(parseInt(msgId), chatId);
    if (!transcription) {
      await tgPost('editMessageText', {
        chat_id: chatId, message_id: cq.message.message_id,
        text: '⚠️ Could not find the transcription. Please try again.',
      });
      return res.status(200).json({ ok: true });
    }

    const confirmation = await routeEntry(type, transcription);
    await deletePending(parseInt(msgId), chatId);

    await tgPost('editMessageText', {
      chat_id: chatId, message_id: cq.message.message_id,
      text: `✅ ${confirmation}\n\n_"${transcription}"_`,
      parse_mode: 'Markdown',
    });

    return res.status(200).json({ ok: true });
  }

  // Voice message
  const msg = update.message;
  if (!msg) return res.status(200).json({ ok: true });

  if (msg.voice || msg.audio) {
    const chatId = msg.chat.id;
    const fileId = (msg.voice || msg.audio).file_id;

    const thinking = await sendMessage(chatId, '🎙 Transcribing…');

    let transcription;
    try {
      transcription = await transcribe(fileId);
    } catch (e) {
      await sendMessage(chatId, `❌ Transcription failed: ${e.message}`);
      return res.status(200).json({ ok: true });
    }

    // Store pending transcription
    await savePending(msg.message_id, chatId, transcription);

    // Send transcription with routing buttons
    await tgPost('editMessageText', {
      chat_id: chatId,
      message_id: thinking.result.message_id,
      text: `📝 *Transcription:*\n_"${transcription}"_\n\nWhere should I save this?`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📋 Task',    callback_data: `task:${msg.message_id}` },
          { text: '📓 Journal', callback_data: `journal:${msg.message_id}` },
          { text: '🗒 Note',   callback_data: `note:${msg.message_id}` },
        ]],
      },
    });

    return res.status(200).json({ ok: true });
  }

  // Any other message
  await sendMessage(msg.chat.id, '🎙 Send me a voice message and I\'ll transcribe it to your dashboard.');
  return res.status(200).json({ ok: true });
}
