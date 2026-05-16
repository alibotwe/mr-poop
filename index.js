/* =========================================================
   CHODU YADAV MULTI SESSION WHATSAPP HOSTING PANEL
   FINAL RENDER SAFE VERSION
   ========================================================= */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import os from "os";
import pino from "pino";

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} from "@whiskeysockets/baileys";

/* ================= SAFETY ================= */

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* ================= SERVER ================= */

const app = express();
app.use(express.static("public"));

const server = createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

/* ================= PATHS ================= */

const BASE_SESSION_PATH = "./sessions";

if (!fs.existsSync(BASE_SESSION_PATH)) {
  fs.mkdirSync(BASE_SESSION_PATH, {
    recursive: true
  });
}

/* ================= GLOBAL ================= */

const sessions = new Map();

let globalLogs = [];
let totalMessagesSent = 0;
const startTime = Date.now();

/* ================= HELPERS ================= */

function generateSessionId(phone) {
  return `${phone}_${Date.now()}`;
}

function getSessionPath(sessionId) {
  return path.join(BASE_SESSION_PATH, sessionId);
}

function pushGlobalLog(text) {
  console.log(text);

  globalLogs.push(text);

  if (globalLogs.length > 500) {
    globalLogs.shift();
  }

  io.emit("globalLog", text);
}

function pushSessionLog(sessionId, text) {
  const session = sessions.get(sessionId);

  if (!session) return;

  session.logs.push(text);

  if (session.logs.length > 300) {
    session.logs.shift();
  }

  io.emit("sessionLog", {
    sessionId,
    text
  });
}

function getDashboardStats() {
  const totalSessions = sessions.size;

  const activeSessions = [...sessions.values()].filter(
    s => s.connected
  ).length;

  const runningTasks = [...sessions.values()].filter(
    s => s.activeTask
  ).length;

  return {
    totalSessions,
    activeSessions,
    runningTasks,
    totalMessagesSent,
    uptime:
      Math.floor((Date.now() - startTime) / 1000),
    ram:
      (
        (os.totalmem() - os.freemem()) /
        1024 /
        1024
      ).toFixed(0) + " MB",
    cpu: os.loadavg()[0].toFixed(2)
  };
}

function emitDashboard() {
  io.emit("dashboard", {
    stats: getDashboardStats(),
    sessions: [...sessions.values()].map(s => ({
      sessionId: s.sessionId,
      phone: s.phone,
      connected: s.connected,
      reconnecting: s.reconnecting,
      activeTask: s.activeTask,
      totalSent: s.totalSent
    }))
  });
}

/* ================= SESSION START ================= */

async function startSession(sessionId, phone) {
  try {
    const sessionPath = getSessionPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, {
        recursive: true
      });
    }

    const { state, saveCreds } =
      await useMultiFileAuthState(
        sessionPath
      );

    const { version } =
      await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      browser:
        Browsers.ubuntu("Chrome"),
      logger: pino({
        level: "silent"
      })
    });

    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        phone,
        sock,
        connected: false,
        reconnecting: false,
        logs: [],
        groups: [],
        stopSending: false,
        activeTask: null,
        totalSent: 0
      };

      sessions.set(sessionId, session);
    }

    session.sock = sock;

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    sock.ev.on(
      "connection.update",
      async update => {
        const {
          connection,
          lastDisconnect
        } = update;

        if (connection === "open") {
          session.connected = true;
          session.reconnecting = false;

          pushSessionLog(
            sessionId,
            `Connected: ${phone}`
          );

          try {
            const groups =
              await sock.groupFetchAllParticipating();

            session.groups =
              Object.entries(groups).map(
                ([id, g]) => ({
                  id,
                  subject:
                    g.subject ||
                    "Unnamed"
                })
              );

          } catch (e) {
            pushSessionLog(
              sessionId,
              "Group fetch failed"
            );
          }

          emitDashboard();
        }

        if (connection === "close") {
          session.connected = false;

          const code =
            lastDisconnect?.error
              ?.output?.statusCode;

          const shouldReconnect =
            code !== DisconnectReason.loggedOut;

          pushSessionLog(
            sessionId,
            "Disconnected"
          );

          if (shouldReconnect) {
            session.reconnecting = true;

            setTimeout(() => {
              startSession(
                sessionId,
                phone
              );
            }, 5000);
          }

          emitDashboard();
        }
      }
    );

    return sock;

  } catch (err) {
    pushGlobalLog(
      `Session start failed: ${phone} | ${err.message}`
    );
  }
}

/* ================= DASHBOARD ROUTE ================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CHODU YADAV PANEL</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>

<div class="sidebar">
  <h2>CHODU YADAV</h2>
</div>

<div class="main">

  <div class="topbar">
    <div class="card"><h3>Total Sessions</h3><p id="totalSessions">0</p></div>
    <div class="card"><h3>Active Sessions</h3><p id="activeSessions">0</p></div>
    <div class="card"><h3>Running Tasks</h3><p id="runningTasks">0</p></div>
    <div class="card"><h3>Total Messages</h3><p id="totalMessages">0</p></div>
  </div>

  <div class="panel">

    <div class="section">
      <h3>WhatsApp Pairing</h3>
      <input id="pairPhone" placeholder="91xxxxxxxxxx">
      <button class="action" onclick="pairNumber()">Generate Pair Code</button>
      <pre id="pairCode"></pre>
    </div>

    <div class="section">
      <h3>Send Messages</h3>
      <select id="sessionSelect"></select>
      <input id="target" placeholder="Target JID">
      <input type="file" id="file">
      <input id="prefix" placeholder="Prefix">
      <input id="delay" placeholder="Delay seconds">
      <button class="action" onclick="startSend()">Start</button>
      <button class="action stop" onclick="stopSend()">Stop</button>
    </div>

    <div class="section">
      <h3>Session Control</h3>
      <button class="action" onclick="disconnectSession()">Disconnect</button>
      <button class="action stop" onclick="deleteSession()">Delete Session</button>
    </div>

    <div class="section">
      <h3>Active Sessions</h3>
      <div id="sessions"></div>
    </div>

  </div>

  <div id="logs"></div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="/app.js"></script>

</body>
</html>
  `);
});

/* ================= SOCKET ================= */

io.on("connection", socket => {

  socket.emit("dashboard", {
    stats: getDashboardStats(),
    sessions: [...sessions.values()]
  });

  globalLogs.forEach(log => {
    socket.emit("globalLog", log);
  });

  socket.on("pair", async rawPhone => {
    try {
      const phone = String(
        rawPhone || ""
      ).replace(/\D/g, "");

      if (!phone) {
        socket.emit(
          "errorLog",
          "Invalid phone"
        );
        return;
      }

      const sessionId =
        generateSessionId(phone);

      await startSession(
        sessionId,
        phone
      );

      const session =
        sessions.get(sessionId);

      if (!session?.sock) {
        socket.emit(
          "errorLog",
          "Session failed"
        );
        return;
      }

      const code =
        await session.sock.requestPairingCode(
          phone
        );

      socket.emit("pairCode", {
        sessionId,
        code
      });

      pushSessionLog(
        sessionId,
        "Pair code generated"
      );

      emitDashboard();

    } catch (err) {
      socket.emit(
        "errorLog",
        err.message
      );
    }
  });

  socket.on("start", async cfg => {
    try {
      const session =
        sessions.get(cfg.sessionId);

      if (
        !session ||
        !session.sock ||
        !session.connected
      ) {
        return;
      }

      const lines = String(
        cfg.msgs || ""
      )
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);

      if (!lines.length) return;

      session.stopSending = false;

      const delayMs =
        Math.max(
          10,
          parseInt(cfg.delay) || 10
        ) * 1000;

      session.activeTask = {
        target: cfg.target,
        delay: delayMs
      };

      let index = 0;

      async function sendNext() {
        if (session.stopSending) {
          session.activeTask = null;

          pushSessionLog(
            session.sessionId,
            "Task stopped"
          );

          emitDashboard();

          return;
        }

        try {
          const line = lines[index];

          const text =
            cfg.prefix
              ? `*${cfg.prefix}* ${line}`
              : line;

          await session.sock.sendMessage(
            cfg.target,
            { text }
          );

          session.totalSent++;
          totalMessagesSent++;

          pushSessionLog(
            session.sessionId,
            `Sent ${index + 1}/${lines.length}`
          );

          index =
            (index + 1) %
            lines.length;

          emitDashboard();

        } catch (err) {
          pushSessionLog(
            session.sessionId,
            "Send failed: " +
              err.message
          );
        }

        setTimeout(
          sendNext,
          delayMs
        );
      }

      sendNext();

    } catch (err) {
      socket.emit(
        "errorLog",
        err.message
      );
    }
  });

  socket.on("stop", sessionId => {
    const session =
      sessions.get(sessionId);

    if (!session) return;

    session.stopSending = true;

    pushSessionLog(
      sessionId,
      "Stopping task..."
    );
  });

  socket.on(
    "disconnectSession",
    async sessionId => {
      const session =
        sessions.get(sessionId);

      if (!session) return;

      try {
        session.stopSending = true;

        await session.sock.logout();

        session.connected = false;

        pushSessionLog(
          sessionId,
          "Session logged out"
        );

        emitDashboard();

      } catch (err) {
        pushSessionLog(
          sessionId,
          err.message
        );
      }
    }
  );

  socket.on(
    "deleteSession",
    sessionId => {
      const sessionPath =
        getSessionPath(sessionId);

      try {
        if (
          fs.existsSync(sessionPath)
        ) {
          fs.rmSync(
            sessionPath,
            {
              recursive: true,
              force: true
            }
          );
        }

        sessions.delete(sessionId);

        pushGlobalLog(
          `Deleted session ${sessionId}`
        );

        emitDashboard();

      } catch (err) {
        pushGlobalLog(
          err.message
        );
      }
    }
  );

  socket.on(
    "getGroups",
    sessionId => {
      const session =
        sessions.get(sessionId);

      if (!session) return;

      socket.emit("groups", {
        sessionId,
        groups: session.groups
      });
    }
  );

});

/* ================= SERVER ================= */

server.listen(PORT, () => {
  console.log(
    "CHODU YADAV PANEL RUNNING ON PORT " +
      PORT
  );
});
