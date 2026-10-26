$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Developer build requires Python 3.11+" }
}
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $py -m pip install -e ".[gui,dev]"
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
& $py -m pytest -q --junitxml=build/windows-evidence/tests.xml
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
& $py -m PyInstaller --noconfirm --clean --windowed --onedir --name RPGMakerExtractor --paths src --collect-data rpgextractor --hidden-import PySide6.QtTest launch_gui.py
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
& $py -m tools.prepare_smoke
& $py tools/verify_windows.py
if ($LASTEXITCODE -ne 0) { throw "Packaged GUI verification failed" }
Copy-Item README.md,LICENSE dist/RPGMakerExtractor/
Copy-Item docs dist/RPGMakerExtractor/docs -Recurse -Force
Compress-Archive -Path dist/RPGMakerExtractor -DestinationPath dist/RPGMakerExtractor-Windows-x64.zip -Force
Write-Host "Verified portable folder: dist/RPGMakerExtractor"
