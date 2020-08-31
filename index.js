require('dotenv').config();
const Discord = require("discord.js");
const client = new Discord.Client();
const token = process.env.TOKEN;
const path = require("path");
const fs = require("fs");
const jtalk = require("./jtalk");
const julius = require("./julius");

client.on("ready", async () => {
  console.log("ready");
});
//client.on("debug", console.log);
let count = 1;
function generateOutputFile(channel, member) {
  // use IDs instead of username cause some people have stupid emojis in their name
  const fileName = `./recordings/test${count}.pcm`;
  count++;
  return fs.createWriteStream(fileName);
}

function record(channel) {}

let conn = null;
client.on("message", async (message) => {
  if (message.author.bot) {
    return;
  } else {
    let msg = message.content;
    let channel = message.channel;
    let author = message.author.username;
    if (msg == "!o ochi") {
      if (message.member.voice.channel) {
        const connection = await message.member.voice.channel.join();
        const dispatcher = connection.play(
          path.join(__dirname, "sounds", "02.mp3")
        );
        dispatcher.on("finish", () => {
          connection.disconnect();
        });
      }
    }
    if (msg == "!o come") {
      const voiceChannel = message.member.voice.channel;
      if (!voiceChannel) {
        message.reply("ボイスチャットに入ってください");
        return;
      }
      while (!conn) {
        try {
          conn = await voiceChannel.join();
        } catch (e) {
          console.error(e);
        }
      }

      console.log("join");

      const st = await jtalk.speak("接続しました");
      conn.play(st, { type: "converted" });

      // create our voice receiver
      const receiver = conn.receiver;

      console.log("bind speaking");
      conn.on("speaking", async (user, speaking) => {
        console.log("on speaking.", ++count);
        if (speaking) {
          // this creates a 16-bit signed PCM, stereo 48KHz PCM stream.
          const audioStream = receiver.createStream(user, {
            mode: "opus",
            end: "silence",
          });
          const sentense = await julius.recognize(audioStream, count);
          if (sentense) {
            console.log("say:", sentense);
            const st = await jtalk.speak(sentense);
            conn.play(st, { type: "converted" });
          }
          // // create an output stream so we can dump our data in a file
          // const outputStream = generateOutputFile(voiceChannel, user);
          // // pipe our audio data into the file stream
          // audioStream.pipe(outputStream);
          // outputStream.on("data", console.log);
          // // when the stream ends (the user stopped talking) tell the user
          audioStream.on("end", () => {
            console.log("end");
          });
        }
      });

      conn.on("speaking", (user, speaking) => {
        //        console.log("speaking start", user, speaking);
      });
    }
    if (msg == "!o leave") {
      conn.disconnect();
    }
    return;
  }
});

process.on("SIGINT", async function (code) {
  await julius.onExit();
  await jtalk.onExit();
  process.exit();
});
process.on("exit", async function (code) {
  if (conn) conn.disconnect();
});

async function start() {
  try {
    await jtalk.start();
    await julius.start();
    client.login(token);
  } catch (e) {
    console.error(e);
  }
}

start();
