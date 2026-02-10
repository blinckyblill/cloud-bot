// ========================================
// BLINCKYBOT PRO
// Silver Tracker + OpenAI AI Chat
// Railway safe • Telegram private
// ========================================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// ===== ENV =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_SEC || 60);
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");
if (!OPENAI_KEY) throw new Error("Missing OPENAI_API_KEY");

// ===== TELEGRAM =====
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== OPENAI =====
const openai = new OpenAI({
  apiKey: OPENAI_KEY,
});

console.log("✅ BlinckyBot PRO started");

// ===== STATE =====
let tracking = false;
let threshold = null;
let mode = "below";
let lastSide = null;

// =================================
// SILVER PRICE
// =================================
async function getSilverPrice() {
  const res = await fetch("https://api.metals.live/v1/spot/silver");
  const data = await res.json();
  return Number(data[0].silver);
}

// =================================
// OWNER CHECK
// =================================
function isOwner(msg) {
  return String(msg.from?.id) === OWNER_ID;
}

// =================================
// AI FUNCTION
// =================================
async function askAI(question) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a trading assistant. Keep answers short, clear and useful.",
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  return completion.choices[0].message.content;
}

// =================================
// ALERT LOOP
// =================================
setInterval(async () => {
  try {
    if (!tracking || !threshold) return;

    const price = await getSilverPrice();
    const side = price >= threshold ? "above" : "below";

    if (lastSide === null) {
      lastSide = side;
      return;
    }

    if (side !== lastSide && side === mode) {
      const arrow = mode === "above" ? "📈" : "📉";

      await bot.sendMessage(
        OWNER_ID,
        `${arrow} SILVER ALERT\nPreț: ${price}\nPrag: ${threshold}`
      );
    }

    lastSide = side;
  } catch (e) {
    console.log("Price error:", e.message);
  }
}, CHECK_INTERVAL * 1000);

// =================================
// COMMANDS
// =================================
bot.on("message", async (msg) => {
  try {
    if (!isOwner(msg)) return;

    const text = (msg.text || "").trim();

    // ===== START =====
    if (text === "/start" || text === "/help") {
      return bot.sendMessage(
        msg.chat.id,
        `🤖 BlinckyBot PRO

Silver:
/silver_on
/silver_off
/silver_now
/silver_above 25
/silver_below 23
/status

AI:
/ai intrebare ta aici`
      );
    }

    // ===== AI CHAT =====
    if (text.startsWith("/ai ")) {
      const question = text.replace("/ai ", "");

      bot.sendMessage(msg.chat.id, "🤖 Gândesc...");

      const answer = await askAI(question);

      return bot.sendMessage(msg.chat.id, answer);
    }

    // ===== SILVER ON =====
    if (text === "/silver_on") {
      tracking = true;
      return bot.sendMessage(msg.chat.id, "✅ Tracking ON");
    }

    // ===== SILVER OFF =====
    if (text === "/silver_off") {
      tracking = false;
      return bot.sendMessage(msg.chat.id, "⛔ Tracking OFF");
    }

    // ===== NOW =====
    if (text === "/silver_now") {
      const p = await getSilverPrice();
      return bot.sendMessage(msg.chat.id, `🪙 Silver: ${p}`);
    }

    // ===== ABOVE =====
    if (text.startsWith("/silver_above")) {
      threshold = Number(text.split(" ")[1]);
      mode = "above";
      lastSide = null;
      return bot.sendMessage(msg.chat.id, `Alert peste ${threshold}`);
    }

    // ===== BELOW =====
    if (text.startsWith("/silver_below")) {
      threshold = Number(text.split(" ")[1]);
      mode = "below";
      lastSide = null;
      return bot.sendMessage(msg.chat.id, `Alert sub ${threshold}`);
    }

    // ===== STATUS =====
    if (text === "/status") {
      return bot.sendMessage(
        msg.chat.id,
        `Status:
Tracking: ${tracking}
Mode: ${mode}
Prag: ${threshold || "-"}`
      );
    }
  } catch (e) {
    console.log("Message error:", e.message);
  }
});

