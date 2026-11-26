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
# 4) empezar sin nada guardado del bot: se borra la vinculacion de WhatsApp para que al abrir pida el QR
#    (no se tocan config.json con los grupos ni las imagenes)
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*sesion-whatsapp*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Milliseconds 500
$carpetas = @()
Get-ChildItem $env:APPDATA -Directory | Where-Object { $_.Name -like 'El Desaf*Organizador' -or $_.Name -like 'bot-liga*' } | ForEach-Object {
  $aj = Join-Path $_.FullName 'ajustes.json'
  if (Test-Path $aj) { $c = (Get-Content $aj -Raw | ConvertFrom-Json).carpeta; if ($c) { $carpetas += $c } }
}
$carpetas += (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Bot Liga El Desafio')
$carpetas | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique | ForEach-Object {
  $c = $_
  foreach ($n in @('sesion-whatsapp', '.wwebjs_cache', '.wwebjs_auth')) { Remove-Item (Join-Path $c $n) -Recurse -Force }
  # sin numero guardado: vincula con QR (no con codigo)
  $cfg = Join-Path $c 'config.json'
  if (Test-Path $cfg) {
    $t = [IO.File]::ReadAllText($cfg)
    $n2 = [regex]::Replace($t, '"numeroBot"\s*:\s*"[^"]*"', '"numeroBot": ""')
    if ($n2 -ne $t) { [IO.File]::WriteAllText($cfg, $n2, (New-Object Text.UTF8Encoding $false)) }
  }
}
