const Docker = require("dockerode");
const fs = require("fs");
const docker = new Docker();
const EventEmitter = require("events");
const prism = require("prism-media");
const tee = require("tee-stream");
const { pipeline, finished } = require("stream");
const es = require("event-stream");
const convert = require("pcm-convert");
const stream = require("stream");

// avconv -f s16le -ar 48k -ac 2 -i recordings/test10.pcm -f s16le -ac 1 -ar 16k -  | docker exec -i adoring_leavitt /usr/local/bin/adintool -in stdin -out aidinnet -server localhost
// /usr/local/bin/julius -C /opt/julius/dictation-kit-v4.3.1-linux/main.jconf -C /opt/julius/dictation-kit-v4.3.1-linux/am-gmm.jconf -input adinnet -nostrip
class Julius {
  constructor() {
    this.container = null;
    this.emitter = new EventEmitter();
    this.queue = [];
    this.queue_run = false;
  }
  async onExit() {
    await this.container.stop();
    await this.container.remove();
  }
  async start() {
    console.log("pull images...");
    await docker.pull("motemen/julius");
    console.log("complete");
    this.container = await this.start_julius_server();
    console.log("start julius server");
  }
  async test() {
    const is = fs.createReadStream("./recordings/test_seiten.pcm");
    const sentence = await this.recognize(is);
    console.log("get sentence", sentence);
    process.exit();
  }
  async start_julius_server() {
    const container = await docker.createContainer({
      Image: "motemen/julius",
      Tty: true,
    });
    await container.start();
    const julius = await container.exec({
      Cmd: [
        "/usr/local/bin/julius",
        "-C",
        "/opt/julius/dictation-kit-v4.3.1-linux/main.jconf",
        "-C",
        "/opt/julius/dictation-kit-v4.3.1-linux/am-gmm.jconf",
        "-input",
        "adinnet",
        "-nostrip",
        "-1pass",
      ],
      AttachStdin: false,
      AttachStdout: true,
    });
    const julius_output = await julius.start({
      hijack: true,
      stdout: true,
      stderr: false,
    });
    const p = new Promise((resolve) => {
      julius_output.pipe(es.split()).pipe(
        es.mapSync((line) => {
          //          console.log(line);
          if (line.match(/System Information end/)) {
            resolve(container);
          }
          let result = line.match(/sentence1:\s*(.+)/);
          if (result) {
            this.emitter.emit("recognition", result[1]);
          }
          if (line.match(/no input frame/)) {
            this.emitter.emit("recognition", "");
          }
        })
      );
    });
    return p;
  }
  async recognize(input, id) {
    const s = await this._recognize(input, id);
    return s ? s.replace(/\s+/g, "") : "";
  }
  async _recognize(input, id) {
    if (this.queue_run) {
      console.log("skip");
      return;
    }
    this.queue_run = true;
    //    ///usr/local/bin/adintool -in stdin -out adinnet -server localhost
    const adintool = await this.container.exec({
      Cmd: [
        "/usr/local/bin/adintool",
        "-in",
        "stdin",
        "-out",
        "aidinnet",
        "-server",
        "localhost",
        "-nostrip",
        "-lv",
        "2000",
      ],
      AttachStdin: true,
      AttachStdout: false,
    });
    const julius_input = await adintool.start({ hijack: true, stdin: true });
    /* const debug = fs.createWriteStream(
     *   __dirname + `/recordings/debug${id}.pcm`
     * ); */

    return new Promise((resolve) => {
      const ret = (s) => {
        resolve(s);
      };
      this.emitter.once("recognition", ret);
      const opus_decoder = new prism.opus.Decoder({
        rate: 16000,
        channels: 1,
        frameSize: 960,
      });
      /* const transcoder = new prism.FFmpeg({
       *   args: [
       *     "-analyzeduration",
       *     "0",
       *     "-loglevel",
       *     "0",
       *     "-f",
       *     "s16be",
       *     "-ar",
       *     "16000",
       *     "-ac",
       *     "1",
       *   ],
       * }); */
      const transcoder = new stream.Transform({
        transform(chunk, encoding, done) {
          const b = Buffer.from(chunk);
          for (let i = 0; i < b.length; i += 2) {
            const d = chunk.readInt16LE(i);
            b.writeInt16BE(d, i);
          }
          this.push(b); // データを下流のパイプに渡す処理
          done(); // 変形処理終了を伝えるために呼び出す
        },
      });
      pipeline(
        input,
        opus_decoder,
        transcoder,
        //        tee(debug),
        julius_input,
        (err) => {
          if (err) {
            console.error("Pipeline failed", err);
            this.queue_run = false;
            this.emitter.off("recognition", ret);
            resolve("");
          } else {
            //           console.log("Pipeline succeeded");
          }
        }
      );
      finished(input, (err) => {
        if (err) {
          console.error("Stream failed", err);
        } else {
          //          console.log("Stream is done reading");
          console.log("end", id);
          this.queue_run = false;
        }
      });
    });
  }
}

const julius = new Julius();

// julius.start().then(() => {
//   julius.test();
// });

module.exports = julius;
