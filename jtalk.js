const Docker = require("dockerode");
const es = require("event-stream");
const fs = require("fs");
const util = require("util");
const docker = new Docker();
const WaveFile = require("wavefile").WaveFile;
const intoStream = require("into-stream");
const prism = require("prism-media");

class JTalk {
  constructor() {
    this.container = null;
    const jtalk = this;
    process.on("SIGINT", async function (code) {
      await jtalk.onExit();
      console.log("all container was removed.");
    });
    process.on("exit", async function (code) {
      await jtalk.onExit();
      console.log("all container was removed.");
    });
  }
  async onExit() {
    this.container.stop();
    this.container.remove();
  }
  async start() {
    console.log("pull images...");
    await docker.pull("yamamotofebc/open_jtalk");
    console.log("complete");
  }
  async test() {
    await this.speak("あいうえお晴天なり");
  }
  async speak(str) {
    this.container = await docker.createContainer({
      Image: "yamamotofebc/open_jtalk",
      Binds: [__dirname + ":/host"],
      Env: [
        "JTALK_OUTPUT=/host/jtalk.wav",
        "JTALK_VOICE_TYPE=normal",
        "JTALK_OPTIONS=-s 48000 -s 48000 -p 300 -u 0.5 -jm 0.5 -jf 0.5",
      ],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      StdinOnce: true,
      Cmd: [str],
    });

    await this.container.start();
    await this.container.wait();

    const input = fs.createReadStream(__dirname + "/jtalk.wav");
    const transcoder = new prism.FFmpeg({
      args: [
        "-analyzeduration",
        "0",
        "-loglevel",
        "0",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
      ],
    });
    return input.pipe(transcoder);
  }
}

const jtalk = new JTalk();

// jtalk.start().then(() => {
//   return jtalk.test();
// });

module.exports = jtalk;
