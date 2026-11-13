// 200 escenarios: 100 del organizador, 60 de la página de jugadores (contador), 40 "mono"
const {chromium} = require('playwright');
const org = require('./org1.js'), por = require('./por1.js'), mono = require('./mono.js');
const ROOT = process.argv[2] || '/home/claude/liga-el-desafio/web', SOLO = process.argv[3];
(async () => {
  const port = 8810; process.argv[2] = ROOT; await org.servidor(port);
  const lista = [];
  for (let i = 1; i <= 100; i++) lista.push(['org', i]);
  for (let i = 1; i <= 60; i++) lista.push(['por', i]);
  for (let i = 1; i <= 40; i++) lista.push(['mono', i]);
  const tareas = SOLO ? lista.filter(([t]) => t === SOLO) : lista;
  const out = [], b = await chromium.launch(); let idx = 0;
  const trabajador = async () => { while (idx < tareas.length){ const [t, i] = tareas[idx++]; await ({org, por, mono})[t].escenario(b, i, port, out); process.stderr.write('.'); } };
  await Promise.all(Array.from({length: 6}, trabajador));
  const malos = out.filter(o => o.errs.length);
  console.log(`\n${out.length} escenarios · ${out.length - malos.length} OK · ${malos.length} con problemas`);
  malos.forEach(o => console.log(o.desc + '\n   ' + [...new Set(o.errs)].slice(0, 6).join('\n   ')));
  require('fs').writeFileSync(__dirname + '/resultado.json', JSON.stringify(out, null, 1));
  await b.close(); process.exit(0);
})();
