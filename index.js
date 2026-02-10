// ===============================
// Cloud Bot – Railway Ready (Node 22+)
// Telegram private (OWNER only) + OpenAI
// ===============================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// ---------- ENV ----------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");
if (!TWELVE_API_KEY) throw new Error("Missing TWELVE_API_KEY");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

// ---------- BOT INIT ----------
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ---------- SECURITY: OWNER ONLY ----------
function isOwner(msg) {
  return String(msg.chat?.id) === OWNER_ID || String(msg.from?.id) === OWNER_ID;
}

async function guard(msg) {
  if (isOwner(msg)) return true;

  // Optional: răspunde scurt sau ignoră complet
  try {
    await bot.sendMessage(msg.chat.id, "⛔ Acces interzis. Bot privat.");
  } catch (_) {}
  return false;
}

// ---------- OpenAI Client (dynamic import works in CommonJS) ----------
let openaiClient = null;
async function getOpenAI() {
  if (openaiClient) return openaiClient;

  const OpenAI = (await import("openai")).default;
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  return openaiClient;
}

// ---------- TwelveData price ----------
async function getSilverPrice() {
  const url = `https://api.twelvedata.com/price?symbol=XAG/USD&apikey=${TWELVE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  // TwelveData poate întoarce error message; protecție simplă:
  if (!data || data.status === "error") {
    throw new Error(data?.message || "TwelveData error");
  }
  return Number(data.price);
}

// ---------- Commands ----------
bot.onText(/\/start/, async (msg) => {
  if (!(await guard(msg))) return;
  bot.sendMessage(
    msg.chat.id,
    "🤖 Online, căpitane!\nComenzi:\n/price — preț silver\n/ai <text> — întreabă OpenAI"
  );
});

bot.onText(/\/price/, async (msg) => {
  if (!(await guard(msg))) return;

  try {
    const price = await getSilverPrice();
    bot.sendMessage(msg.chat.id, `🥈 Silver (XAG/USD): ${price}`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `⚠️ Eroare price: ${e.message}`);
  }
});

// /ai Hello
bot.onText(/\/ai(?:\s+([\s\S]+))?/, async (msg, match) => {
  if (!(await guard(msg))) return;

  const prompt = (match && match[1] ? String(match[1]).trim() : "");
  if (!prompt) {
    return bot.sendMessage(msg.chat.id, "Scrie: /ai <întrebare>");
  }

  try {
    const client = await getOpenAI();

    // Responses API (recomandat pentru proiecte noi) :contentReference[oaicite:1]{index=1}
    const resp = await client.responses.create({
      model: OPENAI_MODEL,
      instructions:
        "Răspunde scurt, clar și practic. Dacă lipsește info, întreabă 1 întrebare.",
      input: prompt,
    });

    const text = resp.output_text || "(gol)";
    // Telegram limit ~4096 chars
    const chunk = text.length > 3800 ? text.slice(0, 3800) + "…" : text;

    bot.sendMessage(msg.chat.id, `🧠 OpenAI:\n${chunk}`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `⚠️ Eroare OpenAI: ${e.message}`);
  }
});

// ---------- Optional: simple heartbeat log ----------
console.log("✅ Bot started (OWNER-only + OpenAI ready).");
