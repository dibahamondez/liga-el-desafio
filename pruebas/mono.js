// Escenario "mono": toques al azar sobre todo botón visible del organizador (incluidos los peligrosos) buscando errores de JavaScript
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
function rng(seed){ let s = seed >>> 0 || 1; return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296; }
async function escenario(browser, id, port, out){
  const R = rng(id * 31337 + 3), pick = a => a[Math.floor(R() * a.length)];
  const liga = R() < .5 ? 'b3' : 'precon', n = 4 + Math.floor(R() * 12), portal = R() < .3;
  const tel = R() < .4, w = tel ? pick([360, 414]) : pick([1280, 1600]), h = tel ? 800 : 900;
  const players = Array.from({length: n}, (_, i) => ({id: 'p' + i, name: 'Jugador ' + String.fromCharCode(65 + i) + ' Prueba'}));
  const fase = pick(['inscripcion', 'juego']);
  const est = {phase: fase, players, rounds: fase === 'juego' ? [{tables: [{seats: players.slice(0, Math.min(4, n)).map(p => p.id), result: null}].concat(n >= 6 ? [{seats: players.slice(4, Math.min(8, n)).map(p => p.id), result: null}] : [])}] : [], cur: 0, fecha: '2026-11-14', mes: '2026-11', cfg: {min: 75, rounds: 3, pairing: 'suizo', win: 3, kill: 1, surv: 1, cap: 5}, timer: {running: false, left: 4500000, endAt: 0}};
  const hist = R() < .6 ? [{id: 'f1', data: {id: 'f1', liga, mes: '2026-11', fecha: '2026-11-07', enCurso: false, rondas: 3, jugadores: players.slice(0, 6).map((p, i) => ({nombre: p.name, k: '', cmd: 'Edgar Markov', pts: 12 - i, w: i < 2 ? 2 : 0, kills: 3 - (i % 3), s: 1, pj: 3, buch: 10})), sorteo: [players[2].name]}}] : [];
  const SEED = {t: {liga: [{id: liga === 'b3' ? 'estado_b3' : 'estado', data: est}], historial: hist, vinculos: portal ? [{user_id: 'uid-1', pid: 'p1', liga}] : [], votos: [], inscripciones: [], perfiles: [{id: 'uid-1', nombre: 'Hans', apellido: 'Org'}], contactos: [], sanciones: [], perfil_publico: [], jueces: []},
    users: [{id: 'uid-1', email: 'o@x.cl', password: 'x', confirmed: true}], session: {user: {id: 'uid-1', email: 'o@x.cl'}}, admins: portal ? [] : ['uid-1']};
  const ctx = await browser.newContext({viewport: {width: w, height: h}, hasTouch: tel, isMobile: tel});
  await ctx.route(u => !u.href.startsWith('http://127.0.0.1'), r => /supabase/.test(r.request().url()) ? r.fulfill({body: MOCK, contentType: 'application/javascript'}) : r.abort());
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('JS: ' + e.message + ' @ ' + ((e.stack || '').split('\n').slice(1, 3).join(' | ').replace(/http:\/\/127.0.0.1:\d+\//g, ''))));
  pg.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  const desc = `#${id} mono ${portal ? 'jugador' : 'organizador'} ${liga} ${fase} ${n}j ${w}x${h}`;
  try {
    await pg.goto(`http://127.0.0.1:${port}/${portal ? 'jugador' : 'index'}.html?liga=${liga}`);
    await pg.evaluate(s => localStorage.setItem('__mocksb', s), JSON.stringify(SEED)); await pg.reload(); await pg.waitForTimeout(900);
    const toques = 40 + Math.floor(R() * 40);
    for (let i = 0; i < toques; i++){
      try {
      const c = await pg.evaluate(() => [...document.querySelectorAll('button, [role=button], summary, .tab, input[type=checkbox]')].filter(x => { if (x.disabled) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.closest('[hidden]'); }).length);
      if (!c) { await pg.waitForTimeout(300); continue; }
      const k = Math.floor(R() * c);
      await pg.evaluate(k => { const x = [...document.querySelectorAll('button, [role=button], summary, .tab, input[type=checkbox]')].filter(x => { if (x.disabled) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.closest('[hidden]'); })[k]; if (x) x.click(); }, k);
      await pg.waitForTimeout(60 + Math.floor(R() * 120));
      if (R() < .08) await pg.keyboard.press(pick(['Escape', 'Enter', ' ', 'Tab']));
      if (pg.url().indexOf('127.0.0.1') < 0) { await pg.goBack().catch(() => {}); }
      } catch(e){ if (!/context was destroyed|navigation/i.test(e.message)) throw e; await pg.waitForLoadState('load').catch(() => {}); await pg.waitForTimeout(700); }
    }
    await pg.waitForLoadState('load').catch(() => {}); await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => ({malos: document.body.innerText.match(/undefined|NaN|\[object Object\]/g) || []}));
    if (r.malos.length) errs.push('texto inválido al final: ' + [...new Set(r.malos)].join(', '));
  } catch(e){ errs.push('harness: ' + e.message.split('\n')[0]); }
  await ctx.close();
  out.push({desc, errs});
}
module.exports = {escenario};
