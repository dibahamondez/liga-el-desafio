# Pruebas automáticas (200 escenarios)

Corren la página contra una base de datos falsa en el navegador (no tocan Supabase).

```
cd pruebas
npm i playwright   # una vez
node run.js ../web           # los 200
node run.js ../web org       # solo organizador (100)
node run.js ../web por       # solo página de jugadores / contador (60)
node run.js ../web mono      # toques al azar (40)
```

- **org**: inscripción → rondas con resultados al azar → cierre y guardado, en distintos tamaños de pantalla. Revisa que nadie quede en dos mesas, que el ganador esté en su mesa, que no haya más kills que jugadores, que no aparezca "undefined/NaN" y que la página no se desborde.
- **por**: contador de mesa con eliminaciones, daño de comandante, veneno, deshacer y reinicio. Revisa que el reporte enviado coincida con la mesa.
- **mono**: toca botones al azar (incluidos borrar y reiniciar) buscando errores de JavaScript.
