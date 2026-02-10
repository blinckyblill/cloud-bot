require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
console.log("✅ Bot started. Owner:", OWNER_ID);

function isOwner(msg) {
  return String(msg.chat?.id) === OWNER_ID;
}

async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.error("❌ sendMessage error:", e?.message || e);
  }
}

// ---- Silver (FREE API)
async function getSilverPrice() {
  const res = await fetch("https://api.metals.live/v1/spot/silver");
  if (!res.ok) throw new Error(`metals.live HTTP ${res.status}`);
  const data = await res.json(); // [[timestamp, price]]
  const price = data?.[0]?.[1];
  if (typeof price !== "number") throw new Error("Invalid metals.live response");
  return price;
}

// ---- OpenAI call (Responses API)
async function askOpenAI(userText) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Ești un asistent prietenos în română. Răspunde clar și scurt. Dacă userul cere trading, dă doar informații educaționale și management de risc, fără promisiuni.",
        },
        { role: "user", content: userText },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI error HTTP ${res.status}`;
    throw new Error(msg);
  }

  // Extract text from Responses API
  const text =
    data?.output_text ||
    data?.output?.[0]?.content?.map((c) => c.text).filter(Boolean).join("\n");

  if (!text) throw new Error("OpenAI: empty response");
  return text;
}

// ---- Commands
bot.onText(/\/start/i, async (msg) => {
  if (!isOwner(msg)) return;
  await safeSend(msg.chat.id, "🤖 Online, căpitane! Scrie /help sau vorbește cu mine direct.");
});

bot.onText(/\/help/i, async (msg) => {
  if (!isOwner(msg)) return;
  await safeSend(
    msg.chat.id,
    [
      "📌 Comenzi:",
      "/price  – preț silver (spot)",
      "/start  – confirmare online",
      "/help   – listă comenzi",
      "",
      "💬 Orice mesaj normal = răspuns de la OpenAI.",
    ].join("\n")
  );
});

bot.onText(/\/price/i, async (msg) => {
  if (!isOwner(msg)) return;
  try {
    const price = await getSilverPrice();
    await safeSend(msg.chat.id, `🥈 Silver spot: ${price}`);
  } catch (e) {
    console.error("❌ /price error:", e?.message || e);
    await safeSend(msg.chat.id, "❌ Nu pot lua prețul acum. Verifică Logs pe Railway.");
  }
});

// ---- Chat mode: reply to any non-command text with OpenAI
bot.on("message", async (msg) => {
  if (!isOwner(msg)) return;

  const text = (msg.text || "").trim();
  if (!text) return;

  // ignore commands handled above
  if (text.startsWith("/")) return;

  try {
    await bot.sendChatAction(msg.chat.id, "typing");
    const answer = await askOpenAI(text);

    // Telegram message limit ~4096 chars
    const chunks = answer.match(/[\s\S]{1,3500}/g) || [answer];
    for (const chunk of chunks) {
      await safeSend(msg.chat.id, chunk);
    }
  } catch (e) {
    console.error("❌ OpenAI chat error:", e?.message || e);
    await safeSend(msg.chat.id, "❌ Eroare la OpenAI. Verifică Logs pe Railway.");
  }
});

// small heartbeat in logs (optional)
setInterval(() => {
  console.log("⏱️ heartbeat", new Date().toISOString());
}, CHECK_INTERVAL_SEC * 1000);
