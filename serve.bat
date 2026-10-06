@echo off
title World Window
cd /d "%~dp0"
echo Starting server at http://localhost:8080
start "" "http://localhost:8080"
python -m http.server 8080
pause
