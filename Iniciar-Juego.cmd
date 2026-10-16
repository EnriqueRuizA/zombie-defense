@echo off
rem Lanzador de desarrollo (doble-clic): cliente+servidor en modo dev.
rem No cambia la ExecutionPolicy global: el Bypass aplica solo a este proceso.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-simple.ps1"
set EXITCODE=%errorlevel%
if %EXITCODE% neq 0 pause
exit /b %EXITCODE%
