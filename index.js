// index.js (CommonJS) - Railway friendly
// Required env vars: TELEGRAM_BOT_TOKEN, OWNER_ID (optional but recommended)
// Optional: OPENAI_API_KEY, OPENAI_MODEL

const { Telegraf } = require("telegraf");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID).trim() : null;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const bot = new Telegraf(BOT_TOKEN);

// -------------------- helpers --------------------
function isOwner(ctx) {
  if (!OWNER_ID) return true; // if not set, allow everyone (not recommended)
  const fromId = ctx.from?.id ? String(ctx.from.id) : "";
  return fromId === OWNER_ID;
}

function formatPrice(p) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(p);
}

async function getXagUsd() {
  // Yahoo Finance - stable, no API key
  const url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=XAGUSD=X";
  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yahoo fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const price = data?.quoteResponse?.result?.[0]?.regularMarketPrice;

  if (typeof price !== "number") throw new Error("Silver price unavailable from Yahoo");
  return price;
}

async function askOpenAI(userText) {
  if (!OPENAI_API_KEY) return null;

  const body = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Ești un asistent util pentru viața de zi cu zi. Răspunde scurt, clar, în română. Dacă utilizatorul cere sfaturi financiare/trading, dă doar informații generale și amintește să folosească management de risc.",
      },
      { role: "user", content: userText },
    ],
    temperature: 0.4,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return answer || "Nu am un răspuns acum.";
}

// -------------------- state (RAM) --------------------
// NOTE: Railway container can restart; these settings reset if service restarts.
// If you want persistence, we can add a DB later.
const watch = {
  enabled: false,
  chatId: null,
  below: null,
  above: null,
  lastPrice: null,
  lastAlertAt: 0,
};

// spam protection
const ALERT_COOLDOWN_MS = 60 * 1000; // 1 min between alerts

async function sendWatchStatus(chatId) {
  const parts = [];
  parts.push(`📌 Silver tracking: ${watch.enabled ? "ON ✅" : "OFF ❌"}`);
  parts.push(`⬇️ watch_below: ${watch.below ?? "-"}`);
  parts.push(`⬆️ watch_above: ${watch.above ?? "-"}`);
  parts.push(`🪙 lastPrice: ${watch.lastPrice ? formatPrice(watch.lastPrice) : "-"}`);
  await bot.telegram.sendMessage(chatId, parts.join("\n"));
}

async function tickWatch() {
  if (!watch.enabled || !watch.chatId) return;

  try {
    const price = await getXagUsd();
    watch.lastPrice = price;

    const now = Date.now();
    const canAlert = now - watch.lastAlertAt > ALERT_COOLDOWN_MS;

    if (canAlert && typeof watch.below === "number" && price <= watch.below) {
      watch.lastAlertAt = now;
      await bot.telegram.sendMessage(
        watch.chatId,
        `🔔 Silver a scăzut sub prag!\n🪙 XAG/USD: ${formatPrice(price)}\n⬇️ Prag: ${watch.below}`
      );
    }

    if (canAlert && typeof watch.above === "number" && price >= watch.above) {
      watch.lastAlertAt = now;
      await bot.telegram.sendMessage(
        watch.chatId,
        `🔔 Silver a trecut peste prag!\n🪙 XAG/USD: ${formatPrice(price)}\n⬆️ Prag: ${watch.above}`
      );
    }
  } catch (e) {
    // don’t crash bot on price errors
    // You can check logs in Railway
    console.error("Watch tick error:", e?.message || e);
  }
}

// run every 60s
setInterval(tickWatch, 60 * 1000);

// -------------------- commands --------------------
bot.start(async (ctx) => {
  await ctx.reply(
    "Salut! ✅ Sunt Blinckybot.\n\nComenzi:\n/silver_now\n/watch_below 28.50\n/watch_above 30\n/watch_status\n/watch_off\n\nTrimite și un mesaj normal și îți răspund (dacă ai OPENAI_API_KEY)."
  );
});

bot.command("silver_now", async (ctx) => {
  try {
    const price = await getXagUsd();
    await ctx.reply(`🪙 XAG/USD acum: ${formatPrice(price)}`);
  } catch (e) {
    await ctx.reply(`❌ Nu pot lua prețul acum. (${e?.message || "error"})`);
  }
});

bot.command("watch_below", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Doar owner-ul poate seta tracking-ul.");
  const parts = ctx.message.text.split(" ").map((s) => s.trim()).filter(Boolean);
  const val = Number(parts[1]);
  if (!Number.isFinite(val)) return ctx.reply("Exemplu: /watch_below 28.50");

  watch.enabled = true;
  watch.chatId = ctx.chat.id;
  watch.below = val;

  await ctx.reply(`✅ OK. Te anunț când XAG/USD <= ${val}`);
  await sendWatchStatus(ctx.chat.id);
});

bot.command("watch_above", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Doar owner-ul poate seta tracking-ul.");
  const parts = ctx.message.text.split(" ").map((s) => s.trim()).filter(Boolean);
  const val = Number(parts[1]);
  if (!Number.isFinite(val)) return ctx.reply("Exemplu: /watch_above 30");

  watch.enabled = true;
  watch.chatId = ctx.chat.id;
  watch.above = val;

  await ctx.reply(`✅ OK. Te anunț când XAG/USD >= ${val}`);
  await sendWatchStatus(ctx.chat.id);
});

bot.command("watch_status", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Doar owner-ul poate vedea status-ul.");
  watch.chatId = watch.chatId || ctx.chat.id;
  await sendWatchStatus(ctx.chat.id);
});

bot.command("watch_off", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Doar owner-ul poate opri tracking-ul.");
  watch.enabled = false;
  watch.below = null;
  watch.above = null;
  await ctx.reply("🛑 Silver tracking OFF.");
});

// fallback chat (OpenAI)
bot.on("text", async (ctx) => {
  const text = (ctx.message.text || "").trim();
  if (!text) return;

  // ignore commands
  if (text.startsWith("/")) return;

  try {
    const answer = await askOpenAI(text);
    if (!answer) {
      return ctx.reply("ℹ️ OPENAI_API_KEY nu e setat. Pot doar tracking /silver_now etc.");
    }
    await ctx.reply(answer);
  } catch (e) {
    console.error("Chat error:", e?.message || e);
    await ctx.reply("❌ Eroare la răspuns. Verifică OPENAI_API_KEY / logs.");
  }
});

// -------------------- launch --------------------
bot.launch().then(() => console.log("Bot started (polling)."));

// graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
