// Actualiza web/mazos-extra.json con los mazos precon de Commander que publica MTGJSON (https://mtgjson.com).
// Lo corre GitHub Actions todos los días: cuando sale una edición nueva, sus mazos y sus legendarias que pueden ser
// comandante aparecen solos en la página (la página lee este archivo desde GitHub), sin lanzar un parche.
// Uso local: node herramientas/actualizar-mazos.mjs [carpeta-con-json-de-prueba]
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SALIDA = path.join(RAIZ, "web", "mazos-extra.json");
const DESDE = "2023-01-01";            // los mazos anteriores ya vienen en la lista fija de la página
const API = "https://mtgjson.com/api/v5/";
const LOCAL = process.argv[2];          // para pruebas: carpeta con DeckList.json, SetList.json y decks/*.json

async function leer(rel){
  if (LOCAL) return JSON.parse(fs.readFileSync(path.join(LOCAL, rel), "utf8"));
  for (let i = 0; i < 3; i++){
    try { const r = await fetch(API + rel, {headers: {"User-Agent": "liga-el-desafio (github actions)"}}); if (r.ok) return r.json(); if (r.status === 404) return null; } catch(e){}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error("No se pudo descargar " + rel);
}
const puedeSerComandante = c => (c.leadershipSkills && c.leadershipSkills.commander) || ((c.supertypes || []).includes("Legendary") && (c.types || []).includes("Creature"));
const unicos = a => [...new Set(a.filter(Boolean))];

const previo = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : {mazos: []};
const yaEsta = new Map((previo.mazos || []).map(m => [m[5], m]));   // por archivo de MTGJSON

const [lista, sets] = await Promise.all([leer("DeckList.json"), leer("SetList.json")]);
const nombreSet = {}; (sets.data || []).forEach(s => nombreSet[s.code] = s.name);
const hoy = new Date().toISOString().slice(0, 10);
const candidatos = (lista.data || []).filter(d => d.type === "Commander Deck" && d.releaseDate && d.releaseDate >= DESDE && d.releaseDate <= hoy);

const mazos = [];
let nuevos = 0;
for (const d of candidatos){
  if (yaEsta.has(d.fileName)){ mazos.push(yaEsta.get(d.fileName)); continue; }
  const j = await leer("decks/" + d.fileName + ".json"); if (!j || !j.data) continue;
  const deck = j.data, cmds = deck.commander || [], todas = cmds.concat(deck.mainBoard || []);
  const portada = cmds.length ? cmds[0].name : null; if (!portada) continue;
  const legs = unicos([...cmds.map(c => c.name), ...todas.filter(puedeSerComandante).map(c => c.name)]);
  const ci = unicos(cmds.flatMap(c => c.colorIdentity || [])).sort().join("");
  mazos.push([nombreSet[deck.code] || nombreSet[d.code] || d.code, deck.name || d.name, portada, legs, ci, d.fileName, d.releaseDate]);
  nuevos++;
  if (!LOCAL) await new Promise(r => setTimeout(r, 300));   // sin apurar al servidor de MTGJSON
}
mazos.sort((a, b) => (b[6] || "").localeCompare(a[6] || "") || a[1].localeCompare(b[1]));
const salida = {fuente: "MTGJSON (mtgjson.com)", formato: "[edición, mazo, comandante de portada, legendarias que pueden ser comandante, identidad de color, archivo MTGJSON, fecha]", mazos};
const antes = JSON.stringify(previo.mazos || []), ahora = JSON.stringify(mazos);
if (antes !== ahora){
  salida.actualizado = new Date().toISOString();
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1) + "\n");
  console.log(`mazos-extra.json actualizado: ${mazos.length} mazos (${nuevos} nuevos).`);
} else console.log(`Sin cambios (${mazos.length} mazos).`);
