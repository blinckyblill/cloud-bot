import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const OWNER_ID = 8389205143; // PUNE ID-UL TAU AICI

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("Agent started...");

// ===== MEMORIE =====
const todos = [];

// ===== COMENZI =====

// start
bot.onText(/\/start/, (msg) => {
  if (msg.chat.id !== OWNER_ID) return;
  bot.sendMessage(msg.chat.id, "Salut căpitane 😎 Agentul tău e online.\nScrie /help");
});

// help
bot.onText(/\/help/, (msg) => {
  if (msg.chat.id !== OWNER_ID) return;

  bot.sendMessage(msg.chat.id,
`Comenzi:
 /todo add text
 /todo list
 /todo done nr
 /remind 10m text
 /brief`);
});

// TODO ADD
bot.onText(/\/todo add (.+)/, (msg, match) => {
  if (msg.chat.id !== OWNER_ID) return;

  todos.push(match[1]);
  bot.sendMessage(msg.chat.id, "✅ Adăugat");
});

// TODO LIST
bot.onText(/\/todo list/, (msg) => {
  if (msg.chat.id !== OWNER_ID) return;

  if (!todos.length) return bot.sendMessage(msg.chat.id, "Lista goală");

  const text = todos.map((t,i)=>`${i+1}. ${t}`).join("\n");
  bot.sendMessage(msg.chat.id, text);
});

// TODO DONE
bot.onText(/\/todo done (\d+)/, (msg, match) => {
  if (msg.chat.id !== OWNER_ID) return;

  const i = Number(match[1]) - 1;
  todos.splice(i,1);
  bot.sendMessage(msg.chat.id, "✅ Șters");
});

// REMINDER
bot.onText(/\/remind (\d+)m (.+)/, (msg, match) => {
  if (msg.chat.id !== OWNER_ID) return;

  const minutes = Number(match[1]);
  const text = match[2];

  setTimeout(()=>{
    bot.sendMessage(msg.chat.id, "⏰ Reminder: " + text);
  }, minutes*60000);

  bot.sendMessage(msg.chat.id, "⏳ Setat");
});

// BRIEF AI
bot.onText(/\/brief/, async (msg) => {
  if (msg.chat.id !== OWNER_ID) return;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role:"user",
      content:`Fă-mi un plan rapid pentru azi. Todo:\n${todos.join("\n")}`
    }]
  });

  bot.sendMessage(msg.chat.id, response.choices[0].message.content);
});

// CHAT NORMAL AI
bot.on("message", async (msg)=>{
  if (msg.chat.id !== OWNER_ID) return;

  if (msg.text.startsWith("/")) return;

  const r = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[{role:"user",content:msg.text}]
  });
  let silverInterval = null;

async function getSilverPrice(){
  const key = process.env.TWELVE_API_KEY;

  const r = await fetch(`https://api.twelvedata.com/price?symbol=XAG/USD&apikey=${key}`);
  const data = await r.json();

  return Number(data.price);
}

function startSilver(chatId){

  if(silverInterval) return;

  let lastPrice = null;

  silverInterval = setInterval(async ()=>{

    const price = await getSilverPrice();

    if(!lastPrice){
      lastPrice = price;
      return;
    }

    // STRATEGIE SIMPLA (exemplu)
    if(price > lastPrice + 0.05){
      bot.sendMessage(chatId, `🚀 SILVER UP\nPrice: ${price}`);
    }

    if(price < lastPrice - 0.05){
      bot.sendMessage(chatId, `🔻 SILVER DOWN\nPrice: ${price}`);
    }

    lastPrice = price;

  }, 60000); // 1 minut

  bot.sendMessage(chatId, "✅ Silver tracking ON");
}

function stopSilver(chatId){
  clearInterval(silverInterval);
  silverInterval = null;
  bot.sendMessage(chatId, "⛔ Silver tracking OFF");
}

bot.onText(/\/silver on/, (msg)=>{
  if(msg.chat.id !== OWNER_ID) return;
  startSilver(msg.chat.id);
});

bot.onText(/\/silver off/, (msg)=>{
  if(msg.chat.id !== OWNER_ID) return;
  stopSilver(msg.chat.id);
});


  bot.sendMessage(msg.chat.id, r.choices[0].message.content);
});

