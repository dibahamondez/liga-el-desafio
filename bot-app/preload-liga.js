// Panel de la liga dentro de la app: la cuenta de organizador de este PC (guardada cifrada por la app)
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desafioApp", {
  cuentaLeer: () => ipcRenderer.invoke("cuenta:leer"),
  cuentaGuardar: c => ipcRenderer.invoke("cuenta:guardar", { email: String((c && c.email) || ""), pass: String((c && c.pass) || "") }),
  cuentaBorrar: () => ipcRenderer.invoke("cuenta:borrar")
});
