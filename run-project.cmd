@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-project.ps1"
exit /b %errorlevel%
