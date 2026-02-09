import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(telegramToken, { polling: true });
const openai = new OpenAI({ apiKey: openaiKey });

console.log("Bot started...");

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful Telegram assistant." },
        { role: "user", content: text }
      ]
    });

    const reply = response.choices[0].message.content;

    bot.sendMessage(chatId, reply);

  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "Eroare la AI 🤖");
  }
});
