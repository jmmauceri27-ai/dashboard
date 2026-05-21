export default function handler(req, res) {
  res.json({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? `set (ends in ...${process.env.TELEGRAM_BOT_TOKEN.slice(-4)})` : 'MISSING',
    OPENAI_API_KEY:     process.env.OPENAI_API_KEY     ? `set (ends in ...${process.env.OPENAI_API_KEY.slice(-4)})`     : 'MISSING',
    SUPABASE_URL:       process.env.SUPABASE_URL       ? `set (${process.env.SUPABASE_URL})`                            : 'MISSING',
    SUPABASE_ANON_KEY:  process.env.SUPABASE_ANON_KEY  ? `set (ends in ...${process.env.SUPABASE_ANON_KEY.slice(-4)})`  : 'MISSING',
  });
}
