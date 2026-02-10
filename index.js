// index.js (CommonJS) - Railway friendly
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");
if (!TWELVE_API_KEY) throw new Error("Missing TWELVE_API_KEY");

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Bot started (silver tracker ready).");

// --- State (in-memory). On restart it resets.
// If you want persistence, we can store in a DB or Railway volume.
const state = {
  silver: {
    enabled: false,
    mode: "above", // "above" | "below"
    threshold: null, // number
    lastPrice: null,
    lastAlertAt: 0,
    lastCross: null, // "above"|"below"|null
  },
};

function isOwner(msg) {
  const chatId = String(msg.chat.id);
  return chatId === OWNER_ID;
}

async function getXagUsd() {
  // Twelve Data quote endpoint
  const url = `https://api.twelvedata.com/quote?symbol=XAG/USD&apikey=${encodeURIComponent(
    TWELVE_API_KEY
  )}`;

  const res = await fetch(url, { timeout: 15000 });
  const data = await res.json();

  // If API returns error
  if (!res.ok || data.status === "error") {
    const msg = data?.message || `HTTP ${res.status}`;
    throw new Error(`TwelveData error: ${msg}`);
  }

  // quote format: { symbol, name, close, ... } or { price }
  const priceRaw = data?.close ?? data?.price;
  const price = Number(priceRaw);

  if (!Number.isFinite(price)) {
    throw new Error("Invalid price from TwelveData");
  }
  return price;
}

function formatPrice(p) {
  return p.toFixed(3);
}

async function sendOwner(text) {
  try {
    await bot.sendMessage(Number(OWNER_ID), text);
  } catch (e) {
    console.error("sendMessage failed:", e.message);
  }
}

function parseNumberArg(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const n = Number(parts[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function checkSilverOnce() {
  if (!state.silver.enabled) return;
  if (!state.silver.threshold || !Number.isFinite(state.silver.threshold)) return;

  const price = await getXagUsd();
  state.silver.lastPrice = price;

  const mode = state.silver.mode; // above/below
  const thr = state.silver.threshold;

  // Determine current side
  const nowSide = price >= thr ? "above" : "below";

  // Only alert on crossing into target side
  // Example: mode=below => alert when crosses from above -> below
  const targetSide = mode === "above" ? "above" : "below";

  const crossed =
    state.silver.lastCross !== null &&
    state.silver.lastCross !== nowSide &&
    nowSide === targetSide;

  // Initialize lastCross on first run without alert
  if (state.silver.lastCross === null) {
    state.silver.lastCross = nowSide;
    return;
  }

  // Anti-spam: at most one alert per 60s
  const now = Date.now();
  const canAlert = now - state.silver.lastAlertAt > 60_000;

  if (crossed && canAlert) {
    state.silver.lastAlertAt = now;

    const arrow = targetSide === "above" ? "📈" : "📉";
    const dir = targetSide === "above" ? "peste" : "sub";
    await sendOwner(
      `${arrow} XAG/USD a trecut ${dir} prag!\n` +
        `Preț: ${formatPrice(price)}\n` +
        `Prag: ${formatPrice(thr)}\n` +
        `Mod: ${mode.toUpperCase()}`
    );
  }

  state.silver.lastCross = nowSide;
}

// interval loop
setInterval(async () => {
  try {
    await checkSilverOnce();
  } catch (e) {
    console.error("Silver check error:", e.message);
  }
}, Math.max(10, CHECK_INTERVAL_SEC) * 1000);

// --- Commands ---
bot.on("message", async (msg) => {
  if (!isOwner(msg)) return;

  const text = (msg.text || "").trim();
  if (!text) return;

  try {
    if (text === "/start" || text === "start") {
      return bot.sendMessage(
        msg.chat.id,
        "✅ Blinckybot online.\n\nComenzi:\n" +
          "/silver_on\n/silver_off\n/silver_set 22.50\n/silver_above 22.50\n/silver_below 22.50\n/silver_status\n/silver_now"
      );
    }

    if (text.startsWith("/silver_on")) {
      state.silver.enabled = true;
      return bot.sendMessage(msg.chat.id, "✅ Silver tracking ON");
    }

    if (text.startsWith("/silver_off")) {
      state.silver.enabled = false;
      return bot.sendMessage(msg.chat.id, "⛔ Silver tracking OFF");
    }

    if (text.startsWith("/silver_set")) {
      const n = parseNumberArg(text);
      if (n === null) return bot.sendMessage(msg.chat.id, "Ex: /silver_set 22.50");
      state.silver.threshold = n;
      state.silver.lastCross = null; // reset cross detection
      return bot.sendMessage(msg.chat.id, `✅ Prag setat: ${formatPrice(n)} USD`);
    }

    if (text.startsWith("/silver_above")) {
      const n = parseNumberArg(text);
      if (n === null) return bot.sendMessage(msg.chat.id, "Ex: /silver_above 22.50");
      state.silver.mode = "above";
      state.silver.threshold = n;
      state.silver.lastCross = null;
      return bot.sendMessage(
        msg.chat.id,
        `✅ Alert când XAG/USD urcă peste ${formatPrice(n)}`
      );
    }

    if (text.startsWith("/silver_below")) {
      const n = parseNumberArg(text);
      if (n === null) return bot.sendMessage(msg.chat.id, "Ex: /silver_below 22.50");
      state.silver.mode = "below";
      state.silver.threshold = n;
      state.silver.lastCross = null;
      return bot.sendMessage(
        msg.chat.id,
        `✅ Alert când XAG/USD coboară sub ${formatPrice(n)}`
      );
    }

    if (text.startsWith("/silver_now")) {
      const price = await getXagUsd();
      state.silver.lastPrice = price;
      return bot.sendMessage(msg.chat.id, `🪙 XAG/USD acum: ${formatPrice(price)}`);
    }

    if (text.startsWith("/silver_status")) {
      return bot.sendMessage(
        msg.chat.id,
        "📊 Silver status:\n" +
          `• Tracking: ${state.silver.enabled ? "ON ✅" : "OFF ⛔"}\n` +
          `• Mod: ${state.silver.mode.toUpperCase()}\n` +
          `• Prag: ${state.silver.threshold ? formatPrice(state.silver.threshold) : "—"}\n` +
          `• Ultim preț: ${state.silver.lastPrice ? formatPrice(state.silver.lastPrice) : "—"}\n` +
          `• Interval: ${Math.max(10, CHECK_INTERVAL_SEC)}s`
      );
    }

    // fallback: ignore or help
    if (text === "/help") {
      return bot.sendMessage(
        msg.chat.id,
        "Comenzi:\n/silver_on\n/silver_off\n/silver_set 22.50\n/silver_above 22.50\n/silver_below 22.50\n/silver_status\n/silver_now"
      );
    }
  } catch (err) {
    console.error("Message handler error:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Eroare. Verifică Logs pe Railway.");
  }
});

// If you ever see TELEGRAM 409 conflict in logs:
// It means another instance is polling too.
// Fix: stop other deployments/instances or use webhook mode.
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
