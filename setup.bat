@echo off
echo ==========================================
echo WhisperLive Setup for Windows
echo ==========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH!
    echo Please install Python 3.8+ from python.org
    pause
    exit /b 1
)

REM Run the Python installer
python install_windows.py

pause