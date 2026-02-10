import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import fetch from "node-fetch";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OWNER_ID = Number(process.env.OWNER_ID);

let silverTracking = false;
let alertAbove = null;
let alertBelow = null;

console.log("Bot started...");


// =======================
// SILVER PRICE (FREE API)
// =======================
async function getSilverPrice() {
  const res = await fetch("https://api.metals.live/v1/spot/silver");
  const data = await res.json();

  return Number(data[0].silver);
}


// =======================
// COMMANDS
// =======================

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 BlinckyBot online.\nComenzi:\n/silver_now\n/silver_on\n/silver_off\n/silver_above 25\n/silver_below 23");
});

bot.onText(/\/silver_now/, async (msg) => {
  const p = await getSilverPrice();
  bot.sendMessage(msg.chat.id, `🪙 XAG/USD: ${p}`);
});

bot.onText(/\/silver_on/, (msg) => {
  silverTracking = true;
  bot.sendMessage(msg.chat.id, "✅ Silver tracking ON");
});

bot.onText(/\/silver_off/, (msg) => {
  silverTracking = false;
  bot.sendMessage(msg.chat.id, "❌ Silver tracking OFF");
});

bot.onText(/\/silver_above (.+)/, (msg, match) => {
  alertAbove = Number(match[1]);
  bot.sendMessage(msg.chat.id, `🔔 Alert above ${alertAbove}`);
});

bot.onText(/\/silver_below (.+)/, (msg, match) => {
  alertBelow = Number(match[1]);
  bot.sendMessage(msg.chat.id, `🔔 Alert below ${alertBelow}`);
});


// =======================
// PRICE WATCHER
// =======================

setInterval(async () => {
  if (!silverTracking) return;

  const price = await getSilverPrice();

  if (alertAbove && price >= alertAbove) {
    bot.sendMessage(OWNER_ID, `🚀 SILVER ABOVE ${alertAbove}\nNow: ${price}`);
    alertAbove = null;
  }

  if (alertBelow && price <= alertBelow) {
    bot.sendMessage(OWNER_ID, `📉 SILVER BELOW ${alertBelow}\nNow: ${price}`);
    alertBelow = null;
  }
}, 15000);


// =======================
// AI CHAT
// =======================

bot.on("message", async (msg) => {
  if (msg.text.startsWith("/")) return;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: msg.text }]
  });

  bot.sendMessage(msg.chat.id, res.choices[0].message.content);
});
