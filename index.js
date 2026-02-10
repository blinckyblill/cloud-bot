// index.js — SILVER BOT (FREE, no API key, Yahoo Finance)

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Bot started (Yahoo silver tracker ready)");

// ============================
// PRICE FROM YAHOO (FREE)
// ============================
async function getSilverPrice() {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=XAGUSD=X";

  const res = await fetch(url);
  const data = await res.json();

  const price =
    data.quoteResponse.result[0].regularMarketPrice;

  return Number(price);
}

// ============================
// STATE
// ============================
const state = {
  enabled: false,
  threshold: null,
  mode: "above",
  lastSide: null
};

// ============================
// COMMANDS
// ============================

bot.on("message", async (msg) => {
  if (String(msg.chat.id) !== OWNER_ID) return;

  const text = msg.text || "";

  if (text === "/start") {
    return bot.sendMessage(
      msg.chat.id,
      "🪙 Silver Bot ready\n\n" +
      "/silver_on\n/silver_off\n/silver_now\n" +
      "/silver_above 25\n/silver_below 23"
    );
  }

  if (text === "/silver_on") {
    state.enabled = true;
    return bot.sendMessage(msg.chat.id, "✅ Tracking ON");
  }

  if (text === "/silver_off") {
    state.enabled = false;
    return bot.sendMessage(msg.chat.id, "⛔ Tracking OFF");
  }

  if (text === "/silver_now") {
    const p = await getSilverPrice();
    return bot.sendMessage(msg.chat.id, `🪙 XAG/USD = ${p}`);
  }

  if (text.startsWith("/silver_above")) {
    state.mode = "above";
    state.threshold = Number(text.split(" ")[1]);
    return bot.sendMessage(msg.chat.id, `📈 Alert peste ${state.threshold}`);
  }

  if (text.startsWith("/silver_below")) {
    state.mode = "below";
    state.threshold = Number(text.split(" ")[1]);
    return bot.sendMessage(msg.chat.id, `📉 Alert sub ${state.threshold}`);
  }
});

// ============================
// LOOP
// ============================

setInterval(async () => {
  if (!state.enabled || !state.threshold) return;

  try {
    const price = await getSilverPrice();

    const side = price >= state.threshold ? "above" : "below";

    if (state.lastSide && side !== state.lastSide && side === state.mode) {
      bot.sendMessage(
        OWNER_ID,
        `🚨 ALERT\nSilver ${side} ${state.threshold}\nPrice: ${price}`
      );
    }

    state.lastSide = side;

  } catch (e) {
    console.log("fetch error:", e.message);
  }
}, CHECK_INTERVAL_SEC * 1000);
