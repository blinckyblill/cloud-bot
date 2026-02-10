// index.js (CommonJS) - Railway friendly
// Env vars required:
//   TELEGRAM_BOT_TOKEN
//   OPENAI_API_KEY (optional, for chat)
//   TWELVE_API_KEY (required for silver tracking)
// Optional:
//   OWNER_ID (Telegram chat id allowed, if you want private bot)

const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;
const twelveKey = process.env.TWELVE_API_KEY;
const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID) : null;

if (!telegramToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const bot = new TelegramBot(telegramToken, { polling: true });

// Prevent webhook vs polling conflicts (safe to call even if none set)
bot.deleteWebHook().catch(() => {});

const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// -------- Silver tracking state (in-memory) --------
// NOTE: Railway restart => state resets. For persistent storage you'd need DB/Redis.
let silverTrackingEnabled = false;

// Watchers: one-shot alerts. When hit, it notifies and removes.
let watchers = []; // { chatId, direction: "above"|"below", price: number }

// Throttle TwelveData calls
let lastPrice = null;
let lastFetchAt = 0;
const FETCH_INTERVAL_MS = 60_000; // 1 minute
const LOOP_TICK_MS = 15_000;      // check loop every 15s, fetch when needed

function isOwnerAllowed(chatId) {
  if (!OWNER_ID) return true;
  return String(chatId) === OWNER_ID;
}

function helpText() {
  return [
    "🤖 *Blinckybot – comenzi*",
    "",
    "📈 *Argint (XAG/USD)*",
    "• `/silver on`  – pornește monitorizarea",
    "• `/silver off` – oprește monitorizarea",
    "• `/silver status` – status + ultimul preț",
    "• `/watch_above 25.50` – anunță când trece PESTE",
    "• `/watch_below 25.00` – anunță când cade SUB",
    "",
    "🧠 *Chat AI*",
    "• scrie normal și îți răspunde (dacă ai OPENAI_API_KEY setat).",
    "",
    "⚠️ Notă: alertele sunt one-shot (după ce te anunță, se șterg).",
  ].join("\n");
}

async function fetchSilverPrice() {
  if (!twelveKey) return null;

  // TwelveData example:
  // https://api.twelvedata.com/price?symbol=XAG/USD&apikey=KEY
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(
    "XAG/USD"
  )}&apikey=${encodeURIComponent(twelveKey)}`;

  const res = await fetch(url);
  const data = await res.json();

  // Possible errors: { status:"error", message:"..." }
  if (!res.ok || data.status === "error") {
    throw new Error(data?.message || `TwelveData error (${res.status})`);
  }

  const p = Number(data.price);
  if (!Number.isFinite(p)) throw new Error("Invalid price from TwelveData");
  return p;
}

function addWatcher(chatId, direction, price) {
  // Replace existing same direction for same chat to keep it simple
  watchers = watchers.filter(
    (w) => !(w.chatId === chatId && w.direction === direction)
  );
  watchers.push({ chatId, direction, price });
}

function removeAllWatchers(chatId) {
  watchers = watchers.filter((w) => w.chatId !== chatId);
}

function formatPrice(p) {
  if (p == null) return "—";
  return p.toFixed(4);
}

async function checkWatchersAndNotify(currentPrice) {
  if (!Number.isFinite(currentPrice)) return;

  const toNotify = [];
  const remaining = [];

  for (const w of watchers) {
    if (w.direction === "above" && currentPrice >= w.price) {
      toNotify.push(w);
    } else if (w.direction === "below" && currentPrice <= w.price) {
      toNotify.push(w);
    } else {
      remaining.push(w);
    }
  }

  watchers = remaining;

  for (const w of toNotify) {
    const dirText = w.direction === "above" ? "a trecut PESTE" : "a coborât SUB";
    const msg =
      `🔔 *Alertă argint (XAG/USD)*\n` +
      `Prețul ${dirText} *${w.price}*\n` +
      `Acum: *${formatPrice(currentPrice)}*`;
    bot.sendMessage(w.chatId, msg, { parse_mode: "Markdown" }).catch(() => {});
  }
}

async function maybeFetchAndCheck() {
  const now = Date.now();
  const shouldCare = silverTrackingEnabled || watchers.length > 0;
  if (!shouldCare) return;

  // Fetch at most once per minute
  if (now - lastFetchAt < FETCH_INTERVAL_MS && lastPrice != null) {
    // still check watchers with cached price
    await checkWatchersAndNotify(lastPrice);
    return;
  }

  lastFetchAt = now;
  try {
    const p = await fetchSilverPrice();
    lastPrice = p;
    await checkWatchersAndNotify(p);
  } catch (e) {
    // Don’t spam. Log only.
    console.error("Price fetch error:", e.message || e);
  }
}

// Background loop
setInterval(() => {
  maybeFetchAndCheck().catch(() => {});
}, LOOP_TICK_MS);

bot.on("message", async (msg) => {
  const chatId = msg.chat?.id;
  const text = msg.text || "";

  if (!chatId) return;

  if (!isOwnerAllowed(chatId)) {
    // silent or notify
    return;
  }

  const t = text.trim();

  // ---- Commands ----
  // /start, /help
  if (/^\/start\b/i.test(t) || /^\/help\b/i.test(t)) {
    await bot.sendMessage(chatId, helpText(), { parse_mode: "Markdown" });
    return;
  }

  // /silver on|off|status  (also accepts: /silver_on etc.)
  if (/^\/silver\b/i.test(t) || /^\/silver_/i.test(t)) {
    const lower = t.toLowerCase();

    if (lower.includes("on")) {
      silverTrackingEnabled = true;
      await bot.sendMessage(
        chatId,
        `✅ Silver tracking ON\nUltimul preț: ${formatPrice(lastPrice)}`
      );
      return;
    }

    if (lower.includes("off")) {
      silverTrackingEnabled = false;
      await bot.sendMessage(chatId, `🛑 Silver tracking OFF`);
      return;
    }

    // status
    await bot.sendMessage(
      chatId,
      `📊 Silver tracking: ${silverTrackingEnabled ? "ON ✅" : "OFF 📴"}\n` +
        `Ultimul preț (XAG/USD): ${formatPrice(lastPrice)}\n` +
        `Alerte active: ${watchers.filter((w) => w.chatId === chatId).length}`
    );
    return;
  }

  // /watch_above 25.50
  let m = t.match(/^\/watch_above\s+([0-9]+(?:\.[0-9]+)?)\b/i);
  if (m) {
    const price = Number(m[1]);
    if (!Number.isFinite(price)) {
      await bot.sendMessage(chatId, "❌ Preț invalid. Ex: /watch_above 25.50");
      return;
    }
    addWatcher(chatId, "above", price);
    await bot.sendMessage(
      chatId,
      `✅ Setat: te anunț când XAG/USD trece PESTE ${price}\n` +
        `Ultimul preț: ${formatPrice(lastPrice)}`
    );
    return;
  }

  // /watch_below 25.00
  m = t.match(/^\/watch_below\s+([0-9]+(?:\.[0-9]+)?)\b/i);
  if (m) {
    const price = Number(m[1]);
    if (!Number.isFinite(price)) {
      await bot.sendMessage(chatId, "❌ Preț invalid. Ex: /watch_below 25.00");
      return;
    }
    addWatcher(chatId, "below", price);
    await bot.sendMessage(
      chatId,
      `✅ Setat: te anunț când XAG/USD cade SUB ${price}\n` +
        `Ultimul preț: ${formatPrice(lastPrice)}`
    );
    return;
  }

  // /watch_clear
  if (/^\/watch_clear\b/i.test(t)) {
    removeAllWatchers(chatId);
    await bot.sendMessage(chatId, "🧹 Am șters toate alertele tale.");
    return;
  }

  // Quick keyword (so it doesn't go to OpenAI and say "nu am capacitatea")
  if (/argint|silver|xag/i.test(t)) {
    await bot.sendMessage(
      chatId,
      `📌 Argint (XAG/USD)\n` +
        `Tracking: ${silverTrackingEnabled ? "ON ✅" : "OFF 📴"}\n` +
        `Ultimul preț: ${formatPrice(lastPrice)}\n\n` +
        `Comenzi: /silver on | /silver off | /watch_above 25.5 | /watch_below 25.0`
    );
    return;
  }

  // ---- Fallback to AI chat (optional) ----
  if (!openai) {
    await bot.sendMessage(chatId, "ℹ️ OPENAI_API_KEY lipsește. Scrie /help pentru comenzi.");
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful Telegram assistant. Keep replies concise." },
        { role: "user", content: t },
      ],
    });

    const reply = response?.choices?.[0]?.message?.content?.trim();
    await bot.sendMessage(chatId, reply || "Nu am găsit un răspuns.");
  } catch (err) {
    console.error("OpenAI error:", err?.message || err);
    await bot.sendMessage(chatId, "⚠️ Eroare la AI.");
  }
});

console.log("Bot started (polling).");
