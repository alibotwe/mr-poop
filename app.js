const socket = io();

let uploadedText = "";
let selectedSession = "";

const pairPhone = document.getElementById("pairPhone");
const pairCodeBox = document.getElementById("pairCode");
const sessionSelect = document.getElementById("sessionSelect");
const target = document.getElementById("target");
const prefix = document.getElementById("prefix");
const delay = document.getElementById("delay");
const logs = document.getElementById("logs");
const sessionsDiv = document.getElementById("sessions");

/* ================= LOG ================= */

function addLog(text){
  logs.innerHTML += `<div>> ${text}</div>`;
  logs.scrollTop = logs.scrollHeight;
}

/* ================= FILE ================= */

document
  .getElementById("file")
  .addEventListener("change", e => {
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      uploadedText = reader.result || "";
      addLog("TXT Loaded Successfully");
    };

    reader.readAsText(file);
  });

/* ================= PAIR ================= */

function pairNumber(){
  const phone = pairPhone.value.trim();

  if(!phone){
    alert("Enter phone number");
    return;
  }

  socket.emit("pair", phone);
}

/* ================= START ================= */

function startSend(){
  selectedSession = sessionSelect.value;

  if(!selectedSession){
    alert("Select session");
    return;
  }

  socket.emit("start", {
    sessionId: selectedSession,
    target: target.value.trim(),
    prefix: prefix.value.trim(),
    delay: delay.value.trim(),
    msgs: uploadedText
  });
}

/* ================= STOP ================= */

function stopSend(){
  selectedSession = sessionSelect.value;

  if(!selectedSession) return;

  socket.emit("stop", selectedSession);
}

/* ================= DISCONNECT ================= */

function disconnectSession(){
  selectedSession = sessionSelect.value;

  if(!selectedSession) return;

  socket.emit(
    "disconnectSession",
    selectedSession
  );
}

/* ================= DELETE ================= */

function deleteSession(){
  selectedSession = sessionSelect.value;

  if(!selectedSession) return;

  socket.emit(
    "deleteSession",
    selectedSession
  );
}

/* ================= DASHBOARD ================= */

socket.on("dashboard", data => {

  document.getElementById(
    "totalSessions"
  ).innerText = data.stats.totalSessions;

  document.getElementById(
    "activeSessions"
  ).innerText = data.stats.activeSessions;

  document.getElementById(
    "runningTasks"
  ).innerText = data.stats.runningTasks;

  document.getElementById(
    "totalMessages"
  ).innerText = data.stats.totalMessagesSent;

  sessionSelect.innerHTML =
    `<option value="">Select Session</option>`;

  sessionsDiv.innerHTML = "";

  data.sessions.forEach(session => {

    sessionSelect.innerHTML += `
      <option value="${session.sessionId}">
        ${session.phone}
      </option>
    `;

    sessionsDiv.innerHTML += `
      <div class="session-card">
        <b>${session.phone}</b><br>
        Status: ${
          session.connected
            ? "Connected"
            : "Disconnected"
        }<br>
        Sent: ${session.totalSent}
      </div>
    `;
  });

});

/* ================= PAIR CODE ================= */

socket.on("pairCode", data => {
  pairCodeBox.innerText =
    `Session: ${data.sessionId}\nCode: ${data.code}`;
});

/* ================= LOG EVENTS ================= */

socket.on("globalLog", msg => {
  addLog("[GLOBAL] " + msg);
});

socket.on("sessionLog", data => {
  addLog(
    `[${data.sessionId}] ${data.text}`
  );
});

socket.on("errorLog", msg => {
  addLog("[ERROR] " + msg);
});
