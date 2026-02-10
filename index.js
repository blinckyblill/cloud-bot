import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const OWNER_ID = 8389205143; // <-- pune ID-ul tau aici (numar)

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(telegramToken, { polling: true });
const openai = new OpenAI({ apiKey: openaiKey });

console.log("Bot started...");

// ====== STORAGE (in-memory) ======
const todos = new Map();      // chatId -> [{text, done, createdAt}]
const reminders = new Map();  // chatId -> [timeoutIds]

// ====== HELPERS ======
function onlyOwner(msg) {
  return msg.chat?.id === OWNER_ID;
}

function getTodoList(chatId) {
  if (!todos.has(chatId)) todos.set(chatId, []);
  return todos.get(chatId);
}

function parseDuration(str) {
  // accepts: 10m, 2h, 1d
  const m = /^(\d+)\s*([mhd])$/i.exec(str.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

function formatTodos(list) {
  if (!list.length) return "Nu ai nimic în listă ✅";
  return list
    .map((t, i) => `${i + 1}. ${t.done ? "✅" : "⬜"} ${t.text}`)
    .join("\n");
}

// ====== COMMANDS ======
bot.onText(/^\/start$/, (msg) => {
  if (!onlyOwner(msg)) return;
  bot.sendMessage(msg.chat.id, "Salut, căpitane 😎\nScrie /help ca să vezi comenzile.");
});

bot.onText(/^\/help$/, (msg) => {
  if (!onlyOwner(msg)) return;
  bot.sendMessage(
    msg.chat.id,
    [
      "Comenzi disponibile:",
      "/todo add <text>  – adaugă task",
      "/todo list        – arată lista",
      "/todo done <nr>   – marchează ca făcut",
      "/remind <10m|2h|1d> <text> – reminder",
      "/brief            – rezumat rapid",
    ].join("\n")
  );
});

bot.onText(/^\/todo\s+add\s+(.+)$/i, (msg, match) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const text = match[1].trim();
  const list = getTodoList(chatId);
  list.push({ text, done: false, createdAt: Date.now() });
  bot.sendMessage(chatId, `✅ Adăugat (#${list.length}): ${text}`);
});

bot.onText(/^\/todo\s+list$/i, (msg) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const list = getTodoList(chatId);
  bot.sendMessage(chatId, formatTodos(list));
});

bot.onText(/^\/todo\s+done\s+(\d+)$/i, (msg, match) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const n = Number(match[1]);
  const list = getTodoList(chatId);
  if (n < 1 || n > list.length) {
    return bot.sendMessage(chatId, "❌ Număr invalid. Vezi /todo list");
  }
  list[n - 1].done = true;
  bot.sendMessage(chatId, `✅ Gata: ${list[n - 1].text}`);
});

bot.onText(/^\/remind\s+(\S+)\s+(.+)$/i, (msg, match) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const duration = parseDuration(match[1]);
  const text = match[2].trim();

  if (!duration) {
    return bot.sendMessage(chatId, "❌ Format: /remind 10m text  (sau 2h / 1d)");
  }

  const id = setTimeout(() => {
    bot.sendMessage(chatId, `⏰ Reminder: ${text}`);
  }, duration);

  if (!reminders.has(chatId)) reminders.set(chatId, []);
  reminders.get(chatId).push(id);

  bot.sendMessage(chatId, `✅ Ok. Îți amintesc peste ${match[1]}: ${text}`);
});

bot.onText(/^\/brief$/i, async (msg) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const list = getTodoList(chatId);

  const todoText = formatTodos(list);
  const prompt = `Fă un brief scurt în română pentru azi:
- Listează 3 priorități din to-do (dacă există)
- Dă un plan pe 3 pași pentru următoarea oră
To-do:
${todoText}`;

  try {
    bot.sendChatAction(chatId, "typing");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || "N-am primit răspuns.";
    bot.sendMessage(chatId, reply);
  } catch (e) {
    console.log(e);
    bot.sendMessage(chatId, "Eroare la brief 🤖");
  }
});

// ====== FALLBACK AI (mesaje normale) ======
bot.on("message", async (msg) => {
  if (!onlyOwner(msg)) return;
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  // dacă e comandă și n-a fost prinsă mai sus, nu o trimitem la AI
  if (text.startsWith("/")) return;

  try {
    bot.sendChatAction(chatId, "typing");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ești asistent personal. Răspunzi scurt și practic, în română." },
        { role: "user", content: text },
      ],
      temperature: 0.6,
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || "Nu am un răspuns.";
    bot.sendMessage(chatId, reply);
  } catch (e) {
    console.log(e);
    bot.sendMessage(chatId, "Eroare la AI 🤖");
  }
});
