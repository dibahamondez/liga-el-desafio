// Copia el bot (el mismo de la consola) dentro de la app y le aplica el parche de compatibilidad con WhatsApp Web
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ORIG = path.join(__dirname, "..", "..", "bot"), DEST = path.join(__dirname, "..", "bot");
fs.rmSync(DEST, { recursive: true, force: true }); fs.mkdirSync(path.join(DEST, "imagenes-para-enviar"), { recursive: true });
for (const f of ["bot.js", "anuncios.js", "imagenes.js", "logo.png", "mana.css", "config.ejemplo.json"]) fs.copyFileSync(path.join(ORIG, f), path.join(DEST, f));
for (const f of fs.readdirSync(path.join(ORIG, "imagenes-para-enviar"))) if (/\.(png|jpe?g|webp)$/i.test(f)) fs.copyFileSync(path.join(ORIG, "imagenes-para-enviar", f), path.join(DEST, "imagenes-para-enviar", f));
fs.copyFileSync(path.join(ORIG, "logo.png"), path.join(__dirname, "..", "ui", "logo.png"));
try { execFileSync(process.execPath, [path.join(DEST, "bot.js"), "--solo-parche"], { stdio: "inherit", env: Object.assign({}, process.env, { BOT_DATOS: DEST }) }); } catch (e) { console.log("Aviso: no se pudo aplicar el parche ahora (se aplica al abrir la app)."); }
console.log("Bot copiado en la app.");
