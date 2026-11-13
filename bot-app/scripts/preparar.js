// Copia el bot (el mismo de la consola) dentro de la app y le aplica el parche de compatibilidad con WhatsApp Web
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ORIG = path.join(__dirname, "..", "..", "bot"), DEST = path.join(__dirname, "..", "bot");
fs.rmSync(DEST, { recursive: true, force: true }); fs.mkdirSync(path.join(DEST, "imagenes-para-enviar"), { recursive: true });
for (const f of ["bot.js", "anuncios.js", "imagenes.js", "logo.png", "mana.css", "config.ejemplo.json"]) fs.copyFileSync(path.join(ORIG, f), path.join(DEST, f));
for (const f of fs.readdirSync(path.join(ORIG, "imagenes-para-enviar"))) if (/\.(png|jpe?g|webp)$/i.test(f)) fs.copyFileSync(path.join(ORIG, "imagenes-para-enviar", f), path.join(DEST, "imagenes-para-enviar", f));
fs.copyFileSync(path.join(ORIG, "logo.png"), path.join(__dirname, "..", "ui", "logo.png"));
// Panel del organizador: la página completa de la liga (la pública en Netlify queda solo para jugadores)
const WEB = path.join(__dirname, "..", "..", "web"), WDEST = path.join(__dirname, "..", "web");
fs.rmSync(WDEST, { recursive: true, force: true }); fs.mkdirSync(WDEST, { recursive: true });
for (const f of ["index.html", "conexion.js", "config.js", "logo.png", "logo-256.png", "favicon.png", "apple-touch-icon.png", "privacidad.html"]) if (fs.existsSync(path.join(WEB, f))) fs.copyFileSync(path.join(WEB, f), path.join(WDEST, f));
{ const f = path.join(WDEST, "index.html"); let h = fs.readFileSync(f, "utf8");
  h = h.replace('<a class="btn ghost" id="lnkOther" href="jugador.html">Portal de jugadores</a>', '<a class="btn ghost" id="lnkOther" href="https://liga-eldesafio.netlify.app/" target="_blank" rel="noopener">Página de jugadores</a>')
       .replace('const other = $("lnkOther"); if (other) other.href = other.getAttribute("href").split("?")[0] + "?liga=" + LIGA + (TEST ? "&test=1" : "");', 'const other = $("lnkOther"); if (other) other.href = "https://liga-eldesafio.netlify.app/?liga=" + LIGA + (TEST ? "&test=1" : "");');
  fs.writeFileSync(f, h); }
try { execFileSync(process.execPath, [path.join(DEST, "bot.js"), "--solo-parche"], { stdio: "inherit", env: Object.assign({}, process.env, { BOT_DATOS: DEST }) }); } catch (e) { console.log("Aviso: no se pudo aplicar el parche ahora (se aplica al abrir la app)."); }
console.log("Bot copiado en la app.");
