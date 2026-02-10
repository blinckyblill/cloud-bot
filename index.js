require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "").trim();
const CHECK_INTERVAL_SEC = 60;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Bot started (silver tracker FREE API).");

let silverEnabled = false;
let threshold = null;
let mode = "above";

function isOwner(msg) {
  return String(msg.chat.id) === OWNER_ID;
}

async function getSilverPrice() {
  const res = await fetch("https://api.metals.live/v1/spot/silver");
  const data = await res.json();

  // format: [[timestamp, price]]
  return Number(data[0][1]);
}

async function send(text) {
  await bot.sendMessage(OWNER_ID, text);
}

async function checkSilver() {
  if (!silverEnabled || !threshold) return;

  const price = await getSilverPrice();

  if (mode === "above" && price >= threshold)
    await send(`📈 Silver peste ${threshold}\nPreț: ${price}`);

  if (mode === "below" && price <= threshold)
    await send(`📉 Silver sub ${threshold}\nPreț: ${price}`);
}

setInterval(checkSilver, CHECK_INTERVAL_SEC * 1000);

bot.on("message", async (msg) => {
  if (!isOwner(msg)) return;

  const t = msg.text;

  if (t === "/silver_on") {
    silverEnabled = true;
    return send("✅ Silver tracking ON");
  }

  if (t === "/silver_off") {
    silverEnabled = false;
    return send("⛔ Silver tracking OFF");
  }

  if (t.startsWith("/silver_above")) {
    threshold = Number(t.split(" ")[1]);
    mode = "above";
    return send(`Alert peste ${threshold}`);
  }

  if (t.startsWith("/silver_below")) {
    threshold = Number(t.split(" ")[1]);
    mode = "below";
    return send(`Alert sub ${threshold}`);
  }

  if (t === "/silver_now") {
    const p = await getSilverPrice();
    return send(`🪙 Silver: ${p}`);
  }
});
