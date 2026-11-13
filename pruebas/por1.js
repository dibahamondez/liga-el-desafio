// Escenario de la página de jugadores: contador de mesa con acciones aleatorias y reporte progresivo
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
const NOM = ['Ana Soto','Beto Rojas','Carla Díaz','Diego Mora','Elena Paz','Fabián Ruiz','Gina Vera','Hugo Lara','Inés Toro','Juan Vega'];
const CMDS = ['Atraxa, Grand Unifier','Tymna the Weaver + Thrasios, Triton Hero','Edgar Markov','Kaalia of the Vast', ''];
function rng(seed){ let s = seed >>> 0 || 1; return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296; }
async function escenario(browser, id, port, out){
  const R = rng(id * 104729 + 7), pick = a => a[Math.floor(R() * a.length)];
  const liga = R() < .5 ? 'b3' : 'precon', mesa = 2 + Math.floor(R() * 4), n = mesa + 2 + Math.floor(R() * 4);
  const tel = R() < .7, w = tel ? pick([360, 390, 414, 740, 844]) : pick([1024, 1366]), h = tel ? (w > 600 ? 390 : 800) : 768;
  const players = NOM.slice(0, n).map((nm, i) => ({id: 'p' + i, name: nm, deck: pick(CMDS) ? {c: pick(CMDS.filter(Boolean)), ts: 1} : undefined}));
  const seats = players.slice(0, mesa).map(p => p.id), resto = players.slice(mesa).map(p => p.id);
  const yo = pick(seats), cerrada = R() < .08;
  const tables = [{seats, result: cerrada ? {w: seats[0], k: {}, a: [seats[0]]} : null}];
  for (let i = 0; i < resto.length; i += 4) if (resto.slice(i, i + 4).length >= 2) tables.push({seats: resto.slice(i, i + 4), result: null});
  const est = {phase: 'juego', players, cur: 0, fecha: '2026-11-14', mes: '2026-11', cfg: {min: 75, rounds: 3, pairing: 'suizo', win: 3, kill: 1, surv: 1, cap: 5}, timer: {running: R() < .7, endAt: Date.now() + (R() < .2 ? -60000 : 3000000), left: 4500000}, rounds: [{tables}]};
  const SEED = {t: {liga: [{id: liga === 'b3' ? 'estado_b3' : 'estado', data: est}], historial: [], vinculos: [{user_id: 'uid-1', pid: yo, liga}], votos: [], inscripciones: [], perfiles: [{id: 'uid-1', nombre: 'X', apellido: 'Y'}]},
    users: [{id: 'uid-1', email: 'j@x.cl', password: 'x', confirmed: true}], session: {user: {id: 'uid-1', email: 'j@x.cl'}}, admins: []};
  const ctx = await browser.newContext({viewport: {width: w, height: h}, hasTouch: true, isMobile: tel});
  await ctx.route(u => !u.href.startsWith('http://127.0.0.1'), r => /supabase/.test(r.request().url()) ? r.fulfill({body: MOCK, contentType: 'application/javascript'}) : r.abort());
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('JS: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  const desc = `#${id} portal ${liga} mesa de ${mesa} ${w}x${h}${cerrada ? ' (mesa cerrada)' : ''}`;
  const texto = async paso => {
    const r = await pg.evaluate(() => ({malos: document.body.innerText.match(/undefined|NaN|\[object Object\]|Infinity/g) || [], ancho: document.documentElement.scrollWidth - innerWidth}));
    if (r.malos.length) errs.push(`${paso}: texto inválido: ${[...new Set(r.malos)].join(', ')}`);
    if (r.ancho > 2) errs.push(`${paso}: desborde horizontal ${r.ancho}px`);
  };
  const voto = () => pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('__mocksb')); const v = (s.t.votos || [])[0]; return v ? (v.data || v).res : null; });
  try {
    await pg.goto(`http://127.0.0.1:${port}/jugador.html?liga=${liga}`);
    await pg.evaluate(s => localStorage.setItem('__mocksb', s), JSON.stringify(SEED)); await pg.reload(); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.querySelectorAll('.acc-back').forEach(x => x.remove()));
    await texto('carga');
    if (await pg.evaluate(() => !!document.getElementById('mainGrid').offsetParent)) errs.push('el standing de la fecha se ve en la página de jugadores');
    const hay = await pg.locator('[data-contador]').count();
    if (cerrada){ if (hay) errs.push('aparece "Iniciar mesa" con la mesa ya cerrada'); }
    else if (!hay) errs.push('no aparece "Iniciar mesa"');
    else {
      await pg.click('[data-contador]'); await pg.waitForTimeout(500); await texto('contador');
      const acciones = 30 + Math.floor(R() * 60);
      for (let i = 0; i < acciones; i++){
        const b = await pg.evaluate(() => [...document.querySelectorAll('#cnt [data-cnt]')].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.height; }).map((x, k) => ({k, a: x.dataset.cnt})));
        if (!b.length) break;
        // sesgo: más daño que otra cosa, para que haya eliminaciones
        const pesos = b.map(x => x.a === 'v-' ? 8 : x.a === 'cmd+' ? 6 : x.a === 'elim' ? 5 : ['salir', 'tiempo-si', 'reiniciar-si'].includes(x.a) ? .15 : 1);
        let t = R() * pesos.reduce((a, c) => a + c, 0), k = 0; while ((t -= pesos[k]) > 0) k++;
        const elegido = b[k], rep = elegido.a === 'v-' ? 1 + Math.floor(R() * 12) : 1;
        for (let j = 0; j < rep; j++){
          const ok = await pg.evaluate(([idx, a]) => { const x = [...document.querySelectorAll('#cnt [data-cnt]')].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.height; })[idx]; if (!x || x.dataset.cnt !== a) return false; x.click(); return true; }, [elegido.k, elegido.a]);
          if (!ok) break;
        }
        if (elegido.a === 'salir' || elegido.a === 'tiempo-si'){ await pg.waitForTimeout(400); if (await pg.locator('[data-contador]').count()){ await pg.click('[data-contador]'); await pg.waitForTimeout(400); } else break; }
        if (i % 10 === 0) await texto('acción ' + i);
        // swipe ocasional para ver el daño de comandante
        if (R() < .05){ const box = await pg.locator('#cnt .cnt-pnl').first().boundingBox(); if (box){ await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await pg.mouse.down(); await pg.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, {steps: 5}); await pg.mouse.up(); } }
      }
      await pg.waitForTimeout(300);
      const st = await pg.evaluate(() => { try { const k = Object.keys(localStorage).find(k => k.startsWith('__mesa:')); return k ? JSON.parse(localStorage.getItem(k)) : null; } catch(e){ return null; } });
      const v = await voto();
      if (st){
        Object.entries(st.life).forEach(([p, l]) => { if (!Number.isFinite(l)) errs.push(`vida inválida de ${p}: ${l}`); });
        Object.entries(st.out).forEach(([p, o]) => { if (o.by === p) errs.push(`${p} figura eliminándose a sí mismo`); if (o.by && !st.seats.includes(o.by)) errs.push('ejecutor fuera de la mesa'); });
        const vivosEst = st.seats.filter(p => !st.out[p]);
        if (v){
          if (!v.a.every(p => seats.includes(p))) errs.push('reporte con vivos fuera de la mesa');
          if (v.w && (v.a.length !== 1 || v.a[0] !== v.w)) errs.push('reporte con ganador pero más de un vivo');
          const kt = Object.values(v.k || {}).reduce((a, b) => a + b, 0), elim = seats.length - v.a.length;
          if (kt > elim) errs.push(`reporte con ${kt} kills y solo ${elim} eliminados`);
          if (JSON.stringify(v.a.slice().sort()) !== JSON.stringify(vivosEst.slice().sort()) && !st.pend) {
            // puede diferir si se reinició después del último envío; solo es error si hubo eliminaciones después del reporte
            if (Object.keys(st.out).length && Object.keys(st.out).length !== elim) errs.push(`el reporte no coincide con la mesa (reporte vivos ${v.a.join(',')} · mesa vivos ${vivosEst.join(',')})`);
          }
        } else if (Object.keys(st.out).length) errs.push('hubo eliminaciones pero no se envió reporte');
      }
    }
  } catch(e){ errs.push('harness: ' + e.message.split('\n')[0]); }
  await ctx.close();
  out.push({desc, errs});
}
module.exports = {escenario};
