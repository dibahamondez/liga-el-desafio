# Arma la carpeta para Netlify: la página de jugadores (portal) en la raíz y el panel del organizador en /organizador
# (solo las cuentas que están en la tabla admins pueden hacer cambios: lo controla Supabase).
import os, shutil, sys
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(SRC), "netlify")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
portal = open(os.path.join(SRC, "jugador.html"), encoding="utf8").read()
assert "const PORTAL = true;" in portal
# En la web pública no hay link al panel del organizador
portal = portal.replace('<a class="btn ghost" id="lnkOther" href="./">Ver la liga</a>', '<a class="btn ghost" id="lnkOther" href="./" hidden>Ver la liga</a>', 1)
for nombre in ("index.html", "jugador.html"):   # jugador.html se mantiene para los links y QR que ya circulan
    open(os.path.join(OUT, nombre), "w", encoding="utf8").write(portal)
org = open(os.path.join(SRC, "index.html"), encoding="utf8").read()
assert "const PORTAL = false;" in org
org = org.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
open(os.path.join(OUT, "organizador.html"), "w", encoding="utf8").write(org)
for f in ("privacidad.html", "config.js", "conexion.js", "logo.png", "logo-256.png", "favicon.png", "apple-touch-icon.png", "manifest.webmanifest", "mazos-extra.json"):
    shutil.copy(os.path.join(SRC, f), OUT)
print("Netlify listo en", OUT)
