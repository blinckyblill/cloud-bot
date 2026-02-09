const OWNER_ID = 8389205143;

import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(telegramToken, { polling: true });
const openai = new OpenAI({ apiKey: openaiKey });

console.log("Bot started...");

// memorie chat
const chats = {};

// mesaj sistem (personalitate)
const SYSTEM_PROMPT = `
You are BlinckyBot.
You speak Romanian.
You are friendly, funny, relaxed, sometimes make jokes.
You help with life, work, crypto, cars, anything.
Keep answers short and natural like Telegram chat.
`;


// /start
bot.onText(/\/start/, (msg) => {
  if (msg.chat.id !== OWNER_ID) return;

  bot.sendMessage(msg.chat.id, "Salut căpitane 😎 Sunt BlinckyBot gata de treabă!");
});

// /reset
bot.onText(/\/reset/, (msg) => {
  if (msg.chat.id !== OWNER_ID) return;

  chats[msg.chat.id] = [];
  bot.sendMessage(msg.chat.id, "Memoria a fost ștearsă 🧠");
});

// mesaje normale
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // doar owner
  if (chatId !== OWNER_ID) return;

  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  try {
    // creează memorie
    if (!chats[chatId]) chats[chatId] = [];

    chats[chatId].push({ role: "user", content: text });

    // limită memorie (ultimele 10 mesaje)
    chats[chatId] = chats[chatId].slice(-10);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...chats[chatId]
      ],
    });

    const reply = response.choices[0].message.content;

    chats[chatId].push({ role: "assistant", content: reply });

    bot.sendMessage(chatId, reply);

  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "Eroare la AI 🤖");
  }
});
