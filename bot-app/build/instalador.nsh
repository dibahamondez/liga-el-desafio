; Instalador de El Desafío Organizador: antes de instalar cierra la app si está abierta
; y quita la versión antigua "Bot Liga El Desafío" (con sus accesos directos).
; La versión anterior de "El Desafío Organizador" la reemplaza electron-builder (mismo appId),
; conservando la cuenta guardada, los ajustes y la carpeta del bot.
!macro customInit
  InitPluginsDir
  File "/oname=$PLUGINSDIR\previo.ps1" "${BUILD_RESOURCES_DIR}\previo.ps1"
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\previo.ps1"'
  Pop $0
!macroend
