// Escenario de organizador: inscripción → rondas con resultados aleatorios → cierre, con chequeos de integridad
const {chromium} = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = process.argv[2] || '/home/claude/liga-el-desafio/web';
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
const NOMBRES = ['Ana Soto','Beto Rojas','Carla Díaz','Diego Mora','Elena Paz','Fabián Ruiz','Gina Vera','Hugo Lara','Inés Toro','Juan Vega','Karen Ríos','Luis Peña','Marta Gil','Nico Salas','Olga Pinto','Pablo Cid','Rosa León','Sergio Paz','Tania Mella','Ulises Bravo','Vale Ortiz','Walter Soto'];
const CMDS = ['Atraxa, Grand Unifier','Sauron, the Dark Lord','The Wise Mothman','Edgar Markov','Kaalia of the Vast','Miirym, Sentinel Wyrm','Tymna the Weaver + Thrasios, Triton Hero'];
function rng(seed){ let s = seed >>> 0 || 1; return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296; }
let srv = null;
function servidor(port){ return new Promise(r => { srv = http.createServer((q, res) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e){ res.writeHead(404); res.end(); return; } res.writeHead(200, {'content-type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'}); res.end(d); }); }).listen(port, r); }); }
async function escenario(browser, id, port, out){
  const R = rng(id * 7919 + 13), pick = a => a[Math.floor(R() * a.length)];
  const liga = R() < .5 ? 'b3' : 'precon', n = 3 + Math.floor(R() * 18), rondas = 1 + Math.floor(R() * 4);
  const tel = R() < .35, w = tel ? pick([360, 390, 414]) : pick([1024, 1280, 1440, 1920]), h = tel ? 800 : pick([720, 900, 1080]);
  const nombres = NOMBRES.slice().sort(() => R() - .5).slice(0, n);
  const players = nombres.map((nm, i) => ({id: 'p' + i, name: nm, deck: R() < .7 ? {c: pick(CMDS), ts: 1} : undefined}));
  const est = {phase: 'inscripcion', players, rounds: [], cur: 0, fecha: liga === 'b3' ? '2026-11-12' : '2026-11-14', mes: '2026-11', cfg: {min: pick([50, 60, 75, 90]), rounds: rondas, pairing: 'suizo', win: 3, kill: 1, surv: 1, cap: 5}};
  const docE = liga === 'b3' ? 'estado_b3' : 'estado', docC = liga === 'b3' ? 'calendario_b3' : 'calendario';
  const SEED = {t: {liga: [{id: docE, data: est}, {id: docC, data: {ligas: {'2026-11': {mes: '2026-11', fechas: liga === 'b3' ? ['2026-11-05','2026-11-12','2026-11-19','2026-11-26'] : ['2026-11-07','2026-11-14','2026-11-21','2026-11-28']}}}}], historial: [], vinculos: [], votos: [], inscripciones: [], perfiles: [{id: 'uid-1', nombre: 'Hans', apellido: 'Org'}], contactos: [], sanciones: [], perfil_publico: [], jueces: []},
    users: [{id: 'uid-1', email: 'org@x.cl', password: 'x', confirmed: true}], session: {user: {id: 'uid-1', email: 'org@x.cl'}}, admins: ['uid-1']};
  const ctx = await browser.newContext({viewport: {width: w, height: h}, hasTouch: tel, isMobile: tel});
  await ctx.route(u => !u.href.startsWith('http://127.0.0.1'), r => /supabase/.test(r.request().url()) ? r.fulfill({body: MOCK, contentType: 'application/javascript'}) : r.abort());
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('JS: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  const desc = `#${id} ${liga} ${n}j ${rondas}r ${w}x${h}`;
  const chequeos = async paso => {
    const r = await pg.evaluate(() => {
      const vis = document.body.innerText, malos = (vis.match(/undefined|NaN|\[object Object\]|Infinity/g) || []);
      const ancho = document.documentElement.scrollWidth - window.innerWidth;
      return {malos, ancho};
    });
    if (r.malos.length) errs.push(`${paso}: texto inválido en pantalla: ${[...new Set(r.malos)].join(', ')}`);
    if (r.ancho > 2) errs.push(`${paso}: la página se desborda ${r.ancho}px a lo ancho`);
    const st = await pg.evaluate(d => { const s = JSON.parse(localStorage.getItem('__mocksb')); const row = s.t.liga.find(x => x.id === d); return row && row.data; }, docE);
    if (!st) return;
    const ids = new Set(st.players.map(p => p.id));
    (st.rounds || []).forEach((r, ri) => { const vistos = new Set();
      r.tables.forEach((t, ti) => {
        t.seats.forEach(s => { if (!ids.has(s)) errs.push(`${paso}: R${ri + 1} M${ti + 1} tiene un jugador que no existe (${s})`); if (vistos.has(s)) errs.push(`${paso}: R${ri + 1}: ${s} está en dos mesas`); vistos.add(s); });
        if (t.seats.length < 2 && st.players.length > 1) errs.push(`${paso}: R${ri + 1} M${ti + 1} con ${t.seats.length} jugador`);
        const x = t.result; if (!x) return;
        if (x.w && !t.seats.includes(x.w)) errs.push(`${paso}: R${ri + 1} M${ti + 1}: ganador fuera de la mesa`);
        if (x.w && x.a && !x.a.includes(x.w)) errs.push(`${paso}: R${ri + 1} M${ti + 1}: ganador no figura vivo`);
        const kt = Object.values(x.k || {}).reduce((a, b) => a + b, 0) + Object.values(x.c || {}).reduce((a, b) => a + b, 0);
        if (kt > t.seats.length - 1) errs.push(`${paso}: R${ri + 1} M${ti + 1}: ${kt} kills en una mesa de ${t.seats.length}`);
      });
    });
  };
  const clic = async sel => { const ok = await pg.evaluate(s => { const b = [...document.querySelectorAll(s)].find(x => x.offsetParent && !x.disabled); if (b){ b.click(); return true; } return false; }, sel); if (ok) await pg.waitForTimeout(120); return ok; };
  try {
    await pg.goto(`http://127.0.0.1:${port}/index.html?liga=${liga}`);
    await pg.evaluate(s => localStorage.setItem('__mocksb', s), JSON.stringify(SEED)); await pg.reload(); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.querySelectorAll('.acc-back').forEach(x => x.remove()));
    await chequeos('carga');
    if (!(await clic('[data-guia=closeInsc]'))) errs.push('no aparece "cerrar inscripción"');
    await pg.waitForTimeout(250);
    if (!(await clic('#btnStart, [data-guia=start]'))) errs.push('no aparece "empezar"');
    await pg.waitForTimeout(300); await chequeos('inicio');
    for (let r = 0; r < rondas; r++){
      if (r > 0) await clic('[data-guia=start]');
      if (R() < .25) { await clic('#btnRearmar'); await chequeos(`R${r + 1} rearmada`); }
      if (R() < .3) { await clic('#btnPlus'); await clic('#btnMinus'); }
      let guard = 0;
      while (guard++ < 14){
        const ti = await pg.evaluate(() => { const b = [...document.querySelectorAll('[data-guia=mesa]')].find(x => x.offsetParent); return b ? b.dataset.t : null; });
        if (ti == null) break;
        await clic('[data-guia=mesa]'); await pg.waitForTimeout(150);
        const ED = `.mesa:has([data-op=edit][data-t="${ti}"]) .ed`;
        const key = await pg.evaluate(s => !!document.querySelector(s), ED) ? 'ok' : null;
        const seats = await pg.evaluate(k => [...new Set([...document.querySelectorAll(k + ` [data-act=win]`)].map(b => b.dataset.p))], key);
        const modo = R();
        if (modo < .75){ const g = pick(seats); await clic(`${ED} [data-act=win][data-p="${g}"]`); const kk = Math.floor(R() * seats.length); for (let i = 0; i < kk; i++) await clic(`${ED} [data-act="k+"][data-p="${pick(seats)}"]`); }
        else { for (const s of seats) if (R() < .5) await clic(`${ED} [data-act=alive][data-p="${s}"]`); }
        if (R() < .1) await clic(`${ED} [data-act=dq][data-p="${pick(seats)}"]`);
        await clic(`${ED} [data-act=send]`); await pg.waitForTimeout(200);
        await chequeos(`R${r + 1} mesa`);
      }
      if (r < rondas - 1){ if (!(await clic('[data-guia=next], #btnNext'))) { const dx = await pg.evaluate(d => { const s = JSON.parse(localStorage.getItem('__mocksb')); const st = s.t.liga.find(x => x.id === d).data; return {guia: [...document.querySelectorAll('[data-guia]')].map(b => b.dataset.guia + (b.offsetParent ? '' : '(oculto)')).join(','), next: (b => b ? (b.disabled ? 'deshab' : b.offsetParent ? 'visible' : 'oculto') : 'no').call(null, document.getElementById('btnNext')), res: st.rounds[st.cur].tables.map(t => t.result ? 'R' : '-').join(''), aviso: (document.querySelector('.guia') || {}).innerText}; }, docE); errs.push(`R${r + 1}: no aparece "siguiente ronda" ${JSON.stringify(dx)}`); break; } await pg.waitForTimeout(300); await chequeos(`R${r + 2} inicio`); }
    }
    // cierre de la fecha
    const completo = await pg.evaluate(d => { const s = JSON.parse(localStorage.getItem('__mocksb')); const st = s.t.liga.find(x => x.id === d).data; return st.rounds.length === st.cfg.rounds && st.rounds.every(r => r.tables.every(t => t.result)); }, docE);
    if (completo){
      await clic('[data-guia=next], #btnNext'); await pg.waitForTimeout(400); await chequeos('cierre de la fecha');
      if (R() < .6){ await pg.evaluate(() => { const b = document.getElementById('btnArchive'); if (b){ const d = b.closest('details'); if (d) d.open = true; let p = b.parentElement; while (p){ if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; } b.click(); } }); await pg.waitForTimeout(500); await chequeos('guardar en el histórico'); }
    }
    for (const v of ['stats', 'salon', 'reglas', 'sorteo', 'warn', 'live']){ await clic(`.tab[data-view=${v}]`); await pg.waitForTimeout(250); await chequeos('vista ' + v); }
    if (R() < .5){ await clic('.tab[data-view=sorteo]'); await clic('#btnSpin'); await pg.waitForTimeout(6000); await chequeos('sorteo'); }
    if (R() < .4){ await pg.evaluate(() => document.getElementById('btnDisplay').click()); await pg.waitForTimeout(500); await chequeos('modo pantalla'); }
  } catch(e){ errs.push('harness: ' + e.message.split('\n')[0]); }
  await ctx.close();
  out.push({desc, errs});
}
module.exports = {escenario, servidor};
if (require.main === module) (async () => {
  const port = 8800, b = await chromium.launch(); await servidor(port);
  const out = [], ids = process.argv.slice(3).map(Number);
  for (const id of ids) await escenario(b, id, port, out);
  out.forEach(o => console.log(o.desc, o.errs.length ? '\n   ' + o.errs.join('\n   ') : 'OK'));
  await b.close(); srv.close();
})();
