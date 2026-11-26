# Se ejecuta al abrir el instalador, antes de instalar.
$ErrorActionPreference = 'SilentlyContinue'
# 1) cerrar la app si esta abierta (version actual y el bot antiguo)
# (por nombre del programa: el instalador también tiene "Desafio" en su nombre y no debe cerrarse a sí mismo)
Get-Process | Where-Object { $_.ProcessName -like 'El Desaf*Organizador' -or $_.ProcessName -like 'Bot Liga*' } | Stop-Process -Force
Start-Sleep -Milliseconds 800
# 2) desinstalar la app antigua "Bot Liga El Desafio" (la version anterior del Organizador la reemplaza el propio instalador)
$claves = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $claves | Where-Object { $_.DisplayName -like 'Bot Liga*' } | ForEach-Object {
  $u = ($_.UninstallString -replace '^"([^"]+)".*','$1')
  if (Test-Path $u) { Start-Process -FilePath $u -ArgumentList '/S' -Wait }
}
Start-Sleep -Milliseconds 800
# 3) restos: carpeta del programa antiguo y accesos directos viejos
Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory | Where-Object { $_.Name -like 'Bot Liga*' } | Remove-Item -Recurse -Force
@([Environment]::GetFolderPath('Desktop'), "$env:APPDATA\Microsoft\Windows\Start Menu\Programs") | ForEach-Object {
  Get-ChildItem $_ -Filter 'Bot Liga*.lnk' -Recurse | Remove-Item -Force
}
