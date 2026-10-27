$ErrorActionPreference = 'Stop'
$exe = Get-ChildItem release -Filter '*.exe' | Select-Object -First 1
if (!$exe) { throw 'Portable EXE missing' }
$bytes = [System.IO.File]::ReadAllBytes($exe.FullName)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
$subsystem = [BitConverter]::ToUInt16($bytes, $pe + 24 + 68)
if ($subsystem -ne 2) { throw "Console subsystem detected: $subsystem" }
$started = Get-Date
$launcher = Start-Process -FilePath $exe.FullName -PassThru
$window = $null
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  $window = Get-Process | Where-Object { $_.MainWindowTitle -eq 'RPG Story Player' -and $_.StartTime -ge $started.AddSeconds(-1) } | Select-Object -First 1
  if ($window) { break }
}
if (!$window) {
  Get-Process | Where-Object { $_.ProcessName -like '*RPGStoryPlayer*' } | Select-Object Id,ProcessName,MainWindowTitle,StartTime | ConvertTo-Json | Set-Content reports/portable-failure.json
  throw 'Portable executable did not display its GUI within 60 seconds'
}
@{ subsystem = $subsystem; guiWindow = $true; portableLaunched = $true; executable = $exe.Name } | ConvertTo-Json | Set-Content reports/portable-smoke.json -Encoding utf8
$window.CloseMainWindow() | Out-Null
Start-Sleep -Seconds 2
if (!$window.HasExited) { Stop-Process -Id $window.Id -ErrorAction SilentlyContinue }
Write-Output 'Portable EXE GUI launch and Windows GUI subsystem PASS'


