// App de escritorio de los organizadores de la Liga El Desafío.
// Junta en una sola ventana: el panel del organizador (la misma página de la liga, servida desde el PC),
// el bot de WhatsApp (solo manda lo que el organizador envía) y la pantalla para la TV del evento.
// El bot (el mismo bot.js de la consola) corre aparte, dentro de la app; si se cae, la app lo vuelve a abrir sola.
const { app, BrowserWindow, BaseWindow, WebContentsView, ipcMain, dialog, shell, powerSaveBlocker, screen, safeStorage } = require("electron");
const path = require("path"), fs = require("fs"), os = require("os"), http = require("http"), { fork } = require("child_process");
const QR = require("qrcode");

if (!app.requestSingleInstanceLock()) { app.quit(); }

const BOT_DIR = path.join(__dirname, "bot");
// El nombre de la app lleva tilde ("El Desafío") y Electron lo pone en el User-Agent sin codificar bien:
// Supabase lo rechaza ("invalid byte sequence for encoding UTF8") y falla el inicio de sesión y la lectura de la liga.
// Se deja el User-Agent solo con caracteres ASCII.
const uaLimpio = ua => String(ua || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
app.userAgentFallback = uaLimpio(app.userAgentFallback);
const AJUSTES = () => path.join(app.getPath("userData"), "ajustes.json");
const leerAjustes = () => { try { return JSON.parse(fs.readFileSync(AJUSTES(), "utf8")); } catch (e) { return {}; } };
const guardarAjustes = a => { fs.mkdirSync(path.dirname(AJUSTES()), { recursive: true }); fs.writeFileSync(AJUSTES(), JSON.stringify(a, null, 2)); };

let win = null, bot = null, saliendo = false, reinicio = null, carpeta = null, pend = new Map(), nPet = 0;
let vBarra = null, vLiga = null, vBot = null, vistaAct = "liga", tv = null, URL_LIGA = null;
const ultimo = { estado: "apagado", code: null, qr: null, logs: [] };
const vivo = v => v && !v.webContents.isDestroyed();
const aVentana = (canal, dato) => { if (vivo(vBot)) vBot.webContents.send(canal, dato); if (canal === "estado" && vivo(vBarra)) vBarra.webContents.send("estado", dato); };
const WEB_DIR = path.join(__dirname, "web");
const PUBLICA = "https://liga-eldesafio.netlify.app/";

// ---------- Servidor local de la página de la liga (solo en este PC) ----------
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" };
function servidorLiga() {
  return new Promise(ok => {
    const srv = http.createServer((q, r) => {
      let rel = decodeURIComponent(q.url.split("?")[0].split("#")[0]); if (rel.endsWith("/")) rel += "index.html";
      const f = path.normalize(path.join(WEB_DIR, rel));
      if (!f.startsWith(WEB_DIR)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end("No encontrado"); } r.writeHead(200, { "content-type": TIPOS[path.extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }); r.end(d); });
    });
    const probar = puerto => { srv.once("error", () => probar(puerto + 1)); srv.listen(puerto, "127.0.0.1", () => ok(`http://localhost:${puerto}/`)); };
    probar(47830);   // puerto fijo (si está ocupado, el siguiente): así la sesión del organizador se mantiene entre aperturas
  });
}

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
    // ya no salta solo a la pestaña del bot: la barra avisa (pestaña parpadeando) y el organizador entra cuando quiera
    if ((m.ev === "code" || m.ev === "qr") && vivo(vBarra)) vBarra.webContents.send("avisoBot", true);
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
const ALTO_BARRA = 52;
function acomodar() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  vBarra.setBounds({ x: 0, y: 0, width: w, height: ALTO_BARRA });
  const zona = { x: 0, y: ALTO_BARRA, width: w, height: Math.max(0, h - ALTO_BARRA) };
  vLiga.setBounds(zona); vBot.setBounds(zona);
  vLiga.setVisible(vistaAct === "liga"); vBot.setVisible(vistaAct === "bot");
}
// Los links a otros sitios (la página pública, Scryfall, WhatsApp…) se abren en el navegador normal
function linksAfuera(wc) {
  const local = u => u.startsWith(URL_LIGA) || u.startsWith("file:") || u.startsWith("about:");
  wc.setWindowOpenHandler(({ url }) => { if (!local(url)) shell.openExternal(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (!local(url) && !/supabase\.co|accounts\.google\.com/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
}
function crearVentana() {
  win = new BaseWindow({ width: 1360, height: 880, minWidth: 1000, minHeight: 640, backgroundColor: "#0e0908", title: "El Desafío · Organizador", icon: path.join(__dirname, "ui", "logo.png"), autoHideMenuBar: true });
  vBarra = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true } });
  vLiga = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload-liga.js") } });
  vBot = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  [vBarra, vLiga, vBot].forEach(v => { v.setBackgroundColor("#0e0908"); win.contentView.addChildView(v); });
  vBarra.webContents.loadFile(path.join(__dirname, "ui", "barra.html"));
  vBot.webContents.loadFile(path.join(__dirname, "ui", "index.html"));
  vLiga.webContents.loadURL(URL_LIGA + "index.html");
  // si el organizador cambia de liga (Precon ↔ Bracket 3), la proyección la sigue
  vLiga.webContents.on("did-navigate", (e, url) => {
    const l = ligaDeUrl(url);
    if (l && tv && !tv.isDestroyed() && l !== tvLiga){ tvLiga = l; tvVista = "live"; tv.loadURL(URL_LIGA + "index.html?pantalla=1" + (l ? "&liga=" + encodeURIComponent(l) : "")); avisarPantalla(); }
  });
  linksAfuera(vLiga.webContents);
  win.on("resize", acomodar); acomodar();
  global.__vistas = () => ({ win, vBarra, vLiga, vBot });   // para pruebas automáticas
  win.on("close", async e => {
    if (saliendo) return;
    e.preventDefault();
    const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["Cerrar", "Cancelar"], defaultId: 1, cancelId: 1, noLink: true,
      title: "Cerrar", message: "¿Cerrar la app del organizador?", detail: "Se cierran también el bot de WhatsApp y la pantalla de la TV. La liga sigue guardada." });
    if (r.response !== 0) return;
    saliendo = true; if (tv && !tv.isDestroyed()) tv.destroy(); await detenerBot(); app.quit();
  });
}
// Modo 2 pantallas: esta ventana queda con los controles y la proyección va en una ventana aparte,
// a pantalla completa en el segundo monitor (proyector o TV). El organizador elige desde la barra qué se proyecta.
let tvLiga = "", tvVista = "live";
const ligaDeUrl = u => { try { return new URL(u).searchParams.get("liga") || ""; } catch (e) { return ""; } };
const pantallaExtra = () => { const prin = screen.getPrimaryDisplay(); return screen.getAllDisplays().find(d => d.id !== prin.id) || null; };
function avisarPantalla() {
  if (!vivo(vBarra)) return;
  const abierta = !!(tv && !tv.isDestroyed());
  vBarra.webContents.send("pantalla", abierta ? { on: true, vista: tvVista, segunda: !!pantallaExtra(), completa: tv.isFullScreen() } : false);
}
function llevarASegunda() {
  const otra = pantallaExtra(); if (!tv || tv.isDestroyed() || !otra) return;
  tv.setFullScreen(false); tv.setBounds({ x: otra.bounds.x + 40, y: otra.bounds.y + 40, width: 1280, height: 760 }); tv.setFullScreen(true);
}
async function abrirPantalla() {
  if (tv && !tv.isDestroyed()) { tv.close(); return false; }
  // la proyección muestra la misma liga que está abierta en el panel (Precon o Bracket 3)
  let liga = ligaDeUrl(vLiga.webContents.getURL());
  if (!liga) try { liga = await vLiga.webContents.executeJavaScript('(document.getElementById("lnkOther") && new URL(document.getElementById("lnkOther").href).searchParams.get("liga")) || ""'); } catch (e) {}
  tvLiga = liga; tvVista = "live";
  const prin = screen.getPrimaryDisplay(), otra = pantallaExtra() || prin;
  tv = new BrowserWindow({ x: otra.bounds.x + 40, y: otra.bounds.y + 40, width: 1280, height: 760, backgroundColor: "#000", title: "Proyección · Liga El Desafío", icon: path.join(__dirname, "ui", "logo.png"), autoHideMenuBar: true,
    fullscreen: otra.id !== prin.id, webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload-tv.js") } });
  tv.loadURL(URL_LIGA + "index.html?pantalla=1" + (liga ? "&liga=" + encodeURIComponent(liga) : ""));
  tv.on("enter-full-screen", avisarPantalla); tv.on("leave-full-screen", avisarPantalla);
  setTimeout(avisarPantalla, 50);
  linksAfuera(tv.webContents);
  tv.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && (i.key === "F11" || (i.key === "Escape" && tv.isFullScreen()))) { e.preventDefault(); tv.setFullScreen(i.key === "F11" ? !tv.isFullScreen() : false); } });
  tv.on("closed", () => { tv = null; avisarPantalla(); });
  return true;
}
// Qué muestra la proyección: "live" (mesas, reloj y standing) o "sorteo" (ruleta)
async function proyectar(v) {
  if (!tv || tv.isDestroyed()) return null;
  try { tvVista = await tv.webContents.executeJavaScript(`window.__proyectar ? window.__proyectar(${JSON.stringify(v)}) : null`) || tvVista; } catch (e) {}
  avisarPantalla(); return tvVista;
}
ipcMain.on("tv:vista", (e, v) => { if (tv && !tv.isDestroyed() && e.sender === tv.webContents) { tvVista = v; avisarPantalla(); } });
ipcMain.handle("tv:mostrar", (e, v) => proyectar(v));
// Cuenta de organizador de este PC: la app entra sola con ella. Se guarda cifrada con el sistema (Windows: DPAPI del usuario).
const archivoCuenta = () => path.join(app.getPath("userData"), "cuenta-organizador.bin");
const soloPanel = e => vLiga && e.sender === vLiga.webContents;
// Cuenta de organizador por defecto que trae el instalador (se usa si en este PC no se guardó otra)
const sinDefecto = () => path.join(app.getPath("userData"), "sin-cuenta-defecto");
function cuentaDefecto() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "cuenta-defecto.json"), "utf8"));
    const k = Buffer.from("ElDesafio-Liga-Commander"), d = Buffer.from(j.d, "base64");
    const c = JSON.parse(Buffer.from(d.map((b, i) => b ^ k[i % k.length])).toString("utf8"));
    return c && c.email && c.pass ? Object.assign(c, { defecto: true }) : null;
  } catch (err) { return null; }
}
ipcMain.handle("cuenta:leer", e => {
  if (!soloPanel(e)) return null;
  try {
    const b = fs.readFileSync(archivoCuenta());
    const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : Buffer.from(b.toString(), "base64").toString("utf8");
    return JSON.parse(txt);
  } catch (err) {}
  return fs.existsSync(sinDefecto()) ? null : cuentaDefecto();
});
ipcMain.handle("cuenta:guardar", (e, c) => {
  if (!soloPanel(e) || !c || !c.email || !c.pass) return false;
  const txt = JSON.stringify({ email: c.email, pass: c.pass });
  fs.writeFileSync(archivoCuenta(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(Buffer.from(txt).toString("base64")));
  try { fs.unlinkSync(sinDefecto()); } catch (err) {}
  return true;
});
// "Cambiar cuenta": se borra la guardada y tampoco se usa la por defecto, así se puede poner otra
ipcMain.handle("cuenta:borrar", e => { if (!soloPanel(e)) return false; try { fs.unlinkSync(archivoCuenta()); } catch (err) {} try { fs.writeFileSync(sinDefecto(), "1"); } catch (err) {} return true; });
ipcMain.handle("tv:completa", () => { if (!tv || tv.isDestroyed()) return false; if (pantallaExtra() && !tv.isFullScreen()) llevarASegunda(); else tv.setFullScreen(!tv.isFullScreen()); return tv.isFullScreen(); });
// Si hay que vincular WhatsApp, se muestra la pestaña del bot para que se vea el código
function verBot() { if (vistaAct !== "bot" && win) { vistaAct = "bot"; acomodar(); if (vivo(vBarra)) vBarra.webContents.send("vista", "bot"); } }
ipcMain.handle("vista", (e, v) => { vistaAct = v === "bot" ? "bot" : "liga"; acomodar(); return vistaAct; });
ipcMain.handle("pantalla", () => abrirPantalla());
ipcMain.handle("recargar", () => { if (vistaAct === "liga") vLiga.webContents.reload(); else vBot.webContents.reload(); if (tv && !tv.isDestroyed()) tv.webContents.reload(); });
ipcMain.handle("publica", () => shell.openExternal(PUBLICA));

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
// La ventana principal es una BaseWindow: los diálogos se anclan a ella
app.whenReady().then(async () => {
  try { const { session } = require("electron"); session.defaultSession.setUserAgent(uaLimpio(session.defaultSession.getUserAgent())); } catch (e) {}
  powerSaveBlocker.start("prevent-display-sleep");
  // si se conecta el proyector con la proyección ya abierta, se va sola a esa pantalla
  screen.on("display-added", () => { setTimeout(() => { if (tv && !tv.isDestroyed()) llevarASegunda(); avisarPantalla(); }, 800); });
  screen.on("display-removed", () => setTimeout(avisarPantalla, 300));   // que el PC y la pantalla no se duerman durante el evento
  URL_LIGA = await servidorLiga();
  crearVentana();
  carpeta = await elegirCarpeta(false);
  aVentana("carpeta", carpeta);
  iniciarBot();
});
app.on("window-all-closed", () => { if (!saliendo && win && !win.isDestroyed()) return; saliendo = true; detenerBot().then(() => app.quit()); });
