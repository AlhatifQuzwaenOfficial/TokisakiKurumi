require("./settings.js")
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require("readline");
const chalk = require("chalk");

const pairing = process.argv.includes("--pairing");

const askQuestion = (query) => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

async function connectToWhatsApp() {
    try {
        const auth = await useMultiFileAuthState("./sessions");
        const socket = makeWASocket({
            printQRInTerminal: !pairing,
            browser: ["Mac OS", "Safari", "10.15.7"],
            auth: auth.state,
            logger: pino({ level: "silent" }),
        });

        if (pairing && !socket.authState.creds.registered) {
            const nomorWhatsApp = await askQuestion("Masukkan nomor WhatsApp Anda: ");
            setTimeout(async () => {
                const pairingCode = await socket.requestPairingCode(nomorWhatsApp);
                console.log(`Kode pairing Anda: ${pairingCode}`);
            }, 3000);
        }

        socket.ev.on("creds.update", auth.saveCreds);

        socket.ev.on("connection.update", ({ connection }) => {
            if (connection === "close") {
                console.log(chalk.red("Koneksi terputus. Menghubungkan ulang..."));
                connectToWhatsApp();
            }
            if (connection === "open") {
                console.log(chalk.green(`Terhubung ke WhatsApp: ${socket.user.id.split(":")[0]}`));
            }
        });

        socket.ev.process(async (events) => {
            if (events["messages.upsert"]) {
                const upsert = events["messages.upsert"];
                for (let msg of upsert.messages) {
                    if (!msg.message) continue;

                    if (msg.key.remoteJid === "status@broadcast") {
                        if (msg.message?.protocolMessage) continue;
                        console.log(`Melihat status dari ${msg.pushName} (${msg.key.participant.split("@")[0]})`);
                        await socket.readMessages([msg.key]);
                        continue;
                    }

                    handleIncomingMessage(socket, msg);
                }
            }
        });
    } catch (error) {
        console.error(chalk.red("Terjadi kesalahan saat menghubungkan:"), error);
    }
}

async function handleIncomingMessage(socket, msg) {
    try {
        const type = Object.keys(msg.message)[0];
        const body =
            type === "conversation"
                ? msg.message.conversation
                : type === "extendedTextMessage"
                ? msg.message.extendedTextMessage.text
                : type === "imageMessage"
                ? msg.message.imageMessage.caption
                : type === "videoMessage"
                ? msg.message.videoMessage.caption
                : "";
        const prefix = /^[°•π÷×¶∆£¢€¥®™✓_=|~!?#$%^&.+-,\/\\©^]/.test(body)
            ? body.match(/^[°•π÷×¶∆£¢€¥®™✓_=|~!?#$%^&.+-,\/\\©^]/gi)[0]
            : ".";
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(" ").shift().toLowerCase() : "";
        const from = msg.key.remoteJid;

        if (isCmd) {
            console.log(chalk.black(chalk.bgGreen(`Command: ${prefix + command}`)), chalk.black(chalk.bgWhite(`Dari: ${msg.pushName}`)));
        }

        const reply = async (text) => {
            await socket.sendMessage(from, { text }, { quoted: msg });
        };

        switch (command) {
            case "tes":
                reply("On Kak!!!");
                break;

            default:
                if (isCmd) reply("Perintah tidak dikenal.");
        }
    } catch (error) {
        console.error(chalk.red("Error handling message:"), error);
    }
}

connectToWhatsApp();
