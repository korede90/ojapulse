@echo off
echo ===================================================================
echo   Starting OjaPulse (FastAPI Backend + React Frontend)
echo ===================================================================

start "OjaPulse - FastAPI Backend (Port 8000)" cmd /k ""%~dp0Foodprice\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

cd /d "%~dp0frontend"
start "OjaPulse - React Frontend (Port 5173)" cmd /k "npm run dev"

echo.
echo   Backend API Docs : http://127.0.0.1:8000/docs
echo   Web Application  : http://localhost:5173
echo ===================================================================
