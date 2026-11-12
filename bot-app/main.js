// App de escritorio del bot de WhatsApp de la Liga El Desafío.
// La ventana es la interfaz; el bot (el mismo bot.js de la consola) corre aparte, dentro de la app,
// y se comunican por un canal interno. Si el bot se cae, la app lo vuelve a abrir sola.
const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker } = require("electron");
const path = require("path"), fs = require("fs"), os = require("os"), { fork } = require("child_process");
const QR = require("qrcode");

if (!app.requestSingleInstanceLock()) { app.quit(); }

const BOT_DIR = path.join(__dirname, "bot");
const AJUSTES = () => path.join(app.getPath("userData"), "ajustes.json");
const leerAjustes = () => { try { return JSON.parse(fs.readFileSync(AJUSTES(), "utf8")); } catch (e) { return {}; } };
const guardarAjustes = a => { fs.mkdirSync(path.dirname(AJUSTES()), { recursive: true }); fs.writeFileSync(AJUSTES(), JSON.stringify(a, null, 2)); };

let win = null, bot = null, saliendo = false, reinicio = null, carpeta = null, pend = new Map(), nPet = 0;
const ultimo = { estado: "apagado", code: null, qr: null, logs: [] };
const aVentana = (canal, dato) => { if (win && !win.isDestroyed()) win.webContents.send(canal, dato); };

// ---------- Carpeta del bot (config.json, sesión de WhatsApp, memoria, imágenes) ----------
// Busca la carpeta del bot de consola que ya se usaba (así no hay que volver a vincular WhatsApp)
function carpetasConocidas() {
  const h = os.homedir(), cands = [];
  for (const base of [path.join(h, "OneDrive", "Desktop"), path.join(h, "OneDrive", "Escritorio"), path.join(h, "Desktop"), path.join(h, "Escritorio"), path.join(h, "Documents"), path.join(h, "Documentos"), h])
    for (const n of ["bot", "Bot", "bot-liga", "bot liga"]) cands.push(path.join(base, n));
  return cands.filter(d => fs.existsSync(path.join(d, "config.json")));
}
function crearCarpetaNueva() {
  const d = path.join(app.getPath("documents"), "Bot Liga El Desafio");
  fs.mkdirSync(path.join(d, "imagenes-para-enviar"), { recursive: true });
  if (!fs.existsSync(path.join(d, "config.json"))) fs.copyFileSync(path.join(BOT_DIR, "config.ejemplo.json"), path.join(d, "config.json"));
  return d;
}
async function elegirCarpeta(forzar) {
  const a = leerAjustes();
  if (!forzar && a.carpeta && fs.existsSync(path.join(a.carpeta, "config.json"))) return a.carpeta;
  const conocidas = carpetasConocidas();
  const botones = [];
  if (conocidas[0]) botones.push(`Usar mi bot actual (${conocidas[0]})`);
  botones.push("Buscar la carpeta del bot…", "Empezar de cero");
  const r = await dialog.showMessageBox(win, {
    type: "question", title: "Carpeta del bot", buttons: botones, defaultId: 0, cancelId: botones.length - 1, noLink: true,
    message: "¿Dónde están los datos del bot?",
    detail: "Si ya usabas el bot en la ventana negra, elige esa carpeta: así se mantienen la vinculación de WhatsApp, los grupos y las imágenes (como el GIF de buen día)."
  });
  let d = null;
  const op = botones[r.response] || "";
  if (op.startsWith("Usar mi bot")) d = conocidas[0];
  else if (op.startsWith("Buscar")) {
    const s = await dialog.showOpenDialog(win, { title: "Elige la carpeta del bot (la que tiene config.json)", properties: ["openDirectory"] });
    if (!s.canceled && s.filePaths[0]) {
      d = s.filePaths[0];
      if (!fs.existsSync(path.join(d, "config.json"))) fs.copyFileSync(path.join(BOT_DIR, "config.ejemplo.json"), path.join(d, "config.json"));
    }
  }
  if (!d) d = (!forzar && a.carpeta) || crearCarpetaNueva();
  guardarAjustes(Object.assign(a, { carpeta: d }));
  return d;
}

// ---------- El bot ----------
function iniciarBot() {
  clearTimeout(reinicio);
  if (bot) return;
  ultimo.estado = "conectando"; ultimo.code = null; ultimo.qr = null;
  aVentana("estado", { s: "conectando" });
  const liga = leerAjustes().liga || "ambas";
  bot = fork(path.join(BOT_DIR, "bot.js"), ["--app", "--liga", liga].concat(process.env.BOT_SIMULAR ? ["--simular"] : [], process.env.BOT_ESTADO ? ["--estado", process.env.BOT_ESTADO] : []), {
    cwd: carpeta, execPath: process.execPath, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", BOT_DATOS: carpeta, NODE_NO_WARNINGS: "1" })
  });
  bot.stdout.on("data", () => {}); bot.stderr.on("data", d => { const t = String(d).trim(); if (t && !/DeprecationWarning|--trace-deprecation/.test(t)) registro(t, true); });
  bot.on("message", async m => {
    if (!m) return;
    if (m.ev === "resp") { const p = pend.get(m.id); if (p) { pend.delete(m.id); clearTimeout(p.t); p.ok(m.data); } return; }
    if (m.ev === "log") return registro(m.t, m.err);
    if (m.ev === "code") { ultimo.estado = "vincular"; ultimo.code = m.code; return aVentana("estado", { s: "vincular", code: m.code }); }
    if (m.ev === "qr") { ultimo.estado = "vincular"; try { ultimo.qr = await QR.toDataURL(m.qr, { margin: 1, width: 300 }); } catch (e) {} return aVentana("estado", { s: "vincular", qr: ultimo.qr, code: ultimo.code }); }
    if (m.ev === "estado") { ultimo.estado = m.s; return aVentana("estado", { s: m.s, t: m.t }); }
    if (m.ev === "listo") { ultimo.estado = "listo"; return aVentana("estado", { s: "listo", destinos: m.destinos, pausado: m.pausado }); }
    if (m.ev === "cola") return aVentana("cola", m);
    if (m.ev === "error") { registro(m.t, true); return aVentana("estado", { s: "error", t: m.t }); }
  });
  bot.on("exit", code => {
    bot = null;
    pend.forEach(p => { clearTimeout(p.t); p.ok({ error: "El bot se reinició." }); }); pend.clear();
    if (saliendo) return;
    ultimo.estado = "reiniciando";
    aVentana("estado", { s: "reiniciando", t: code ? `El bot se detuvo (código ${code}). Se vuelve a abrir en 10 segundos.` : "El bot se reinicia en 10 segundos." });
    reinicio = setTimeout(iniciarBot, 10000);
  });
}
function detenerBot() {
  return new Promise(res => {
    clearTimeout(reinicio);
    if (!bot) return res();
    const b = bot; bot = null;
    b.removeAllListeners("exit");
    b.once("exit", () => res());
    try { b.kill(); } catch (e) {}
    setTimeout(() => { try { b.kill("SIGKILL"); } catch (e) {} res(); }, 6000);
  });
}
function registro(t, err) {
  const l = { h: new Date().toLocaleTimeString("es-CL"), t: String(t).replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?\s?m\.?)?\s*/i, ""), err: !!err };
  ultimo.logs.push(l); if (ultimo.logs.length > 300) ultimo.logs.shift();
  aVentana("log", l);
}
function pedir(cmd, a, ms = 120000) {
  return new Promise(ok => {
    if (!bot || !bot.connected) return ok({ error: ultimo.estado === "listo" ? "El bot no responde." : "El bot todavía se está conectando a WhatsApp." });
    const id = ++nPet;
    pend.set(id, { ok, t: setTimeout(() => { pend.delete(id); ok({ error: "El bot tardó demasiado en responder." }); }, ms) });
    try { bot.send({ id, cmd, a }); } catch (e) { pend.delete(id); ok({ error: "No se pudo hablar con el bot." }); }
  });
}

// ---------- Ventana ----------
function crearVentana() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640, backgroundColor: "#0e0908", title: "Bot Liga El Desafío",
    icon: path.join(__dirname, "ui", "logo.png"), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  win.on("close", async e => {
    if (saliendo) return;
    e.preventDefault();
    const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["Cerrar el bot", "Cancelar"], defaultId: 1, cancelId: 1, noLink: true,
      title: "Cerrar el bot", message: "¿Cerrar el bot?", detail: "Mientras esté cerrado no se publican las mesas ni los resultados en los grupos." });
    if (r.response !== 0) return;
    saliendo = true; await detenerBot(); app.quit();
  });
}

ipcMain.handle("bot", (e, cmd, a) => pedir(cmd, a));
ipcMain.handle("inicio", () => ({ estado: ultimo.estado, code: ultimo.code, qr: ultimo.qr, logs: ultimo.logs, carpeta, liga: leerAjustes().liga || "ambas", version: app.getVersion() }));
ipcMain.handle("config:leer", () => { try { return JSON.parse(fs.readFileSync(path.join(carpeta, "config.json"), "utf8")); } catch (e) { return {}; } });
ipcMain.handle("config:guardar", async (e, cambios) => {
  const f = path.join(carpeta, "config.json");
  let c = {}; try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e2) {}
  const nuevo = Object.assign({}, c, cambios.config || {}, { grupos: Object.assign({}, c.grupos || {}, (cambios.config || {}).grupos || {}) });
  fs.writeFileSync(f, JSON.stringify(nuevo, null, 2));
  if (cambios.liga) guardarAjustes(Object.assign(leerAjustes(), { liga: cambios.liga }));
  await detenerBot(); iniciarBot();
  return { ok: true };
});
ipcMain.handle("reiniciar", async () => { await detenerBot(); iniciarBot(); return { ok: true }; });
ipcMain.handle("carpeta:abrir", (e, sub) => shell.openPath(sub ? path.join(carpeta, sub) : carpeta));
ipcMain.handle("carpeta:cambiar", async () => { carpeta = await elegirCarpeta(true); await detenerBot(); iniciarBot(); return carpeta; });
ipcMain.handle("desvincular", async () => {
  const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["Desvincular", "Cancelar"], defaultId: 1, cancelId: 1, noLink: true,
    title: "Desvincular WhatsApp", message: "¿Desvincular el WhatsApp del bot?", detail: "Se borra la sesión guardada y habrá que vincular de nuevo con un código o QR." });
  if (r.response !== 0) return { ok: false };
  await detenerBot();
  try { fs.rmSync(path.join(carpeta, "sesion-whatsapp"), { recursive: true, force: true }); } catch (e) {}
  iniciarBot(); return { ok: true };
});

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  powerSaveBlocker.start("prevent-app-suspension");   // que el PC no se duerma mientras el bot está abierto
  crearVentana();
  carpeta = await elegirCarpeta(false);
  aVentana("carpeta", carpeta);
  iniciarBot();
});
app.on("window-all-closed", () => { saliendo = true; detenerBot().then(() => app.quit()); });
