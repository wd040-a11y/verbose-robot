@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo install_and_run.bat 를 먼저 실행하세요.
  pause
  exit /b 1
)
.venv\Scripts\python.exe launch_gui.py
if errorlevel 1 pause
