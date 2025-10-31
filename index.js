const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");
const axios = require("axios");
require('dotenv').config();

const API_ID = process.env.API_ID;
const API_HASH = process.env.API_HASH;
const STRING_SESSION = process.env.STRING_SESSION;
const BOT_TOKEN = process.env.BOT_TOKEN;
const YOUR_USER_ID = process.env.YOUR_USER_ID;

const DEBUG = false;

const SELLING_KEYWORDS = [
  "بيع يورو",
  "بيع أورو",
  "بيع اورو",
  "euro للبيع",
  "euros للبيع",
  "أورو",
  "يورو",
  "اورو",
  "eur",
  "euro",
  "euros",
  "€",
];

function containsEuroSelling(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SELLING_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

function formatNotification(message, chat, sender) {
  let username = "Unknown";
  if (sender) {
    if (sender.username) {
      username = `@${sender.username}`;
    } else if (sender.firstName) {
      username = sender.firstName;
    } else if (sender.title) {
      username = sender.title;
    }
  }

  let chatName = "Unknown Chat";
  if (chat) {
    chatName = chat.title || chat.username || chat.firstName || "Private Chat";
  }

  const time = new Date().toLocaleString("fr-DZ", {
    timeZone: "Africa/Algiers",
    dateStyle: "short",
    timeStyle: "short",
  });

  let messageLink = "";
  if (chat && chat.username && message && message.id) {
    messageLink = `\nhttps://t.me/${chat.username}/${message.id}`;
  } else if (chat && chat.id && message && message.id) {
    const chatIdStr = String(chat.id).replace("-100", "");
    messageLink = `\nhttps://t.me/c/${chatIdStr}/${message.id}`;
  }

  const messageText = message?.message || message?.text || "No text content";

  return `🚨 EURO SALE DETECTED

👤 From: ${username}
💬 Chat: ${chatName}
🕒 Time: ${time}${messageLink}

📝 Message:
${messageText}`;
}

async function sendBotNotification(text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: YOUR_USER_ID,
        text: text,
        disable_web_page_preview: true,
      },
      {
        timeout: 5000,
      }
    );
    return true;
  } catch (error) {
    console.error("Failed to send notification:", error.message);
    return false;
  }
}

async function main() {
  console.log("Starting Euro Monitor...\n");

  const client = new TelegramClient(
    new StringSession(STRING_SESSION),
    API_ID,
    API_HASH,
    { connectionRetries: 5 }
  );

  console.log("Connecting to Telegram...");

  await client.start({
    phoneNumber: async () => await input.text("Phone number: "),
    password: async () => await input.text("2FA password (if any): "),
    phoneCode: async () => await input.text("Code: "),
    onError: (err) => console.error("Error:", err),
  });

  console.log("Connected successfully!\n");

  const me = await client.getMe();
  console.log(`Logged in as: ${me.firstName} (ID: ${me.id})\n`);

  let botUsername = "";
  try {
    const botInfo = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMe`
    );
    botUsername = botInfo.data.result.username.toLowerCase();
    console.log(`Bot username: @${botInfo.data.result.username}`);
  } catch (e) {
    console.log("Could not get bot info");
  }

  console.log("Push notifications: ENABLED\n");

  let messageCount = 0;
  let matchCount = 0;

  console.log("Monitoring all messages for euro sales...");
  console.log("Press Ctrl+C to stop.\n");
  console.log("-".repeat(60));

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;

      if (!msg) return;

      messageCount++;

      const text = msg.message || msg.text || "";
      if (!text) return;

      let sender, chat;
      try {
        sender = await msg.getSender();
        chat = await msg.getChat();
      } catch (e) {
        if (DEBUG) console.log(`Could not get sender/chat info`);
        return;
      }

      if (sender && sender.username && sender.username.toLowerCase() === botUsername) {
        if (DEBUG) console.log(`Skipped: Message from our bot`);
        return;
      }

      if (text.includes("🚨 EURO SALE DETECTED")) {
        if (DEBUG) console.log(`Skipped: Our notification message`);
        return;
      }

      const chatName = chat?.title || chat?.username || chat?.firstName || "Private";
      const senderName = sender?.username || sender?.firstName || "Unknown";

      if (DEBUG) {
        console.log(`\nMessage #${messageCount}`);
        console.log(`   From: ${senderName}`);
        console.log(`   Chat: ${chatName}`);
        console.log(`   Text: ${text.substring(0, 60)}...`);
      }

      if (containsEuroSelling(text)) {
        matchCount++;
        console.log(`\n${"=".repeat(60)}`);
        console.log(`MATCH #${matchCount} - EURO SALE DETECTED!`);
        console.log(`${"=".repeat(60)}`);
        console.log(`From: ${senderName}`);
        console.log(`Chat: ${chatName}`);
        console.log(`Text: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`);
        console.log(`\nSending notification...`);

        const notif = formatNotification(msg, chat, sender);
        const success = await sendBotNotification(notif);

        if (success) {
          console.log("Notification sent!\n");
        } else {
          console.log("Failed to send notification\n");
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
    }
  }, new NewMessage({}));

  console.log("Sending startup notification...");
  const startupSuccess = await sendBotNotification(
    "Euro Monitor Started\n\nBot is active and monitoring all messages.\nYou will receive push notifications for euro sales."
  );

  if (startupSuccess) {
    console.log("Startup notification sent! Check your phone!\n");
  } else {
    console.log("Could not send startup notification\n");
  }

  await new Promise(() => {});
}

process.on("SIGINT", async () => {
  console.log("\n\nShutting down...");
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});