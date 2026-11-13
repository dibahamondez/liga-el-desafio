// Ventana de proyección: le avisa a la app qué se está mostrando (mesas y reloj, o la ruleta)
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desafioTV", { vista: v => ipcRenderer.send("tv:vista", String(v || "")) });
