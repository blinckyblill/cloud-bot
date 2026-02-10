// ===============================
// Cloud Bot – Railway Ready (Node 18+ / 22+)
// ===============================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// ===============================
// ENV
// ===============================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");
if (!TWELVE_API_KEY) throw new Error("Missing TWELVE_API_KEY");

// ===============================
// BOT INIT
// ===============================
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("✅ Bot started successfully");

// ===============================
// STATE
// ===============================
let lastPrice = null;

// ===============================
// FETCH PRICE (Node 22 has fetch built-in)
// ===============================
async function getSilverPrice() {
  const url = `https://api.twelvedata.com/price?symbol=XAG/USD&apikey=${TWELVE_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return Number(data.price);
}

// ===============================
// CHECK LOOP
// ===============================
async function checkPrice() {
  try {
    const price = await getSilverPrice();

    if (!lastPrice) {
      lastPrice = price;
      return;
    }

    if (Math.abs(price - lastPrice) > 0.05) {
      await bot.sendMessage(
        OWNER_ID,
        `🥈 Silver update:\n${lastPrice} → ${price}`
      );

      lastPrice = price;
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

setInterval(checkPrice, CHECK_INTERVAL_SEC * 1000);

// ===============================
// COMMANDS
// ===============================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 Bot online, căpitane!");
});

bot.onText(/\/price/, async (msg) => {
  const price = await getSilverPrice();
  bot.sendMessage(msg.chat.id, `🥈 Silver price: ${price}`);
});
