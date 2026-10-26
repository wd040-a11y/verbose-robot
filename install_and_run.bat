@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3 -m venv .venv
  if errorlevel 1 goto error
)
.venv\Scripts\python.exe -m pip install -e ".[gui]"
if errorlevel 1 goto error
.venv\Scripts\python.exe launch_gui.py
if errorlevel 1 goto error
exit /b 0
:error
 echo 설치/실행에 실패했습니다. Python 3.11 이상 설치와 인터넷 연결을 확인하세요.
 pause
 exit /b 1
