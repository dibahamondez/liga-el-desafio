const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bot", {
  pedir: (cmd, a) => ipcRenderer.invoke("bot", cmd, a || {}),
  inicio: () => ipcRenderer.invoke("inicio"),
  configLeer: () => ipcRenderer.invoke("config:leer"),
  configGuardar: c => ipcRenderer.invoke("config:guardar", c),
  reiniciar: () => ipcRenderer.invoke("reiniciar"),
  abrirCarpeta: sub => ipcRenderer.invoke("carpeta:abrir", sub),
  cambiarCarpeta: () => ipcRenderer.invoke("carpeta:cambiar"),
  desvincular: () => ipcRenderer.invoke("desvincular"),
  vista: v => ipcRenderer.invoke("vista", v),
  pantalla: () => ipcRenderer.invoke("pantalla"),
  proyectar: v => ipcRenderer.invoke("tv:mostrar", v),
  pantallaCompleta: () => ipcRenderer.invoke("tv:completa"),
  recargar: () => ipcRenderer.invoke("recargar"),
  publica: () => ipcRenderer.invoke("publica"),
  on: (canal, fn) => ipcRenderer.on(canal, (e, d) => fn(d))
});
