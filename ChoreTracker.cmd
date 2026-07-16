@echo off
rem ChoreTracker Control Panel launcher - double-click me.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\control-panel.ps1"
