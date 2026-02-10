// ===============================
// BLINCKYBOT – SILVER TRACKER FREE
// Railway safe • Telegram private
// ===============================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ===== ENV =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_SEC || 60);

if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!OWNER_ID) throw new Error("Missing OWNER_ID");

// ===== TELEGRAM =====
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("✅ BlinckyBot started. Owner:", OWNER_ID);

// ===== STATE =====
let tracking = false;
let threshold = null;
let mode = "below"; // below | above
let lastSide = null;

// ===== PRICE (FREE API) =====
async function getSilverPrice() {
  const res = await fetch("https://api.metals.live/v1/spot/silver");
  const data = await res.json();

  // format: [ { silver: 24.33 } ]
  return Number(data[0].silver);
}

// ===== SECURITY =====
function isOwner(msg) {
  return String(msg.chat.id) === OWNER_ID;
}

// ===== ALERT LOOP =====
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
        `${arrow} SILVER ALERT\nPret: ${price}\nPrag: ${threshold}`
      );
    }

    lastSide = side;
  } catch (e) {
    console.log("Price error:", e.message);
  }
}, CHECK_INTERVAL * 1000);

// ===== COMMANDS =====
bot.on("message", async (msg) => {
  if (!isOwner(msg)) return;

  const text = msg.text || "";

  // start
  if (text === "/start") {
    return bot.sendMessage(
      OWNER_ID,
      `BlinckyBot online 🤖

Comenzi:
/silver_on
/silver_off
/silver_now
/silver_above 25
/silver_below 23
/status`
    );
  }

  // ON
  if (text === "/silver_on") {
    tracking = true;
    return bot.sendMessage(OWNER_ID, "✅ Tracking ON");
  }

  // OFF
  if (text === "/silver_off") {
    tracking = false;
    return bot.sendMessage(OWNER_ID, "⛔ Tracking OFF");
  }

  // NOW
  if (text === "/silver_now") {
    const p = await getSilverPrice();
    return bot.sendMessage(OWNER_ID, `🪙 Silver: ${p}`);
  }

  // ABOVE
  if (text.startsWith("/silver_above")) {
    threshold = Number(text.split(" ")[1]);
    mode = "above";
    lastSide = null;
    return bot.sendMessage(OWNER_ID, `Alert peste ${threshold}`);
  }

  // BELOW
  if (text.startsWith("/silver_below")) {
    threshold = Number(text.split(" ")[1]);
    mode = "below";
    lastSide = null;
    return bot.sendMessage(OWNER_ID, `Alert sub ${threshold}`);
  }

  // STATUS
  if (text === "/status") {
    return bot.sendMessage(
      OWNER_ID,
      `Status:
Tracking: ${tracking}
Mode: ${mode}
Prag: ${threshold || "-"}`
    );
  }
});
