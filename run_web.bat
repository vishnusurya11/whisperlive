@echo off
echo ==========================================
echo Starting WhisperLive Web Application
echo ==========================================
echo.

REM Check if virtual environment exists
if not exist .venv (
    echo Virtual environment not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Activate virtual environment
call .venv\Scripts\activate

REM Install Flask dependencies if needed
pip install flask flask-socketio python-socketio

REM Start the web server
echo.
echo Starting web server...
echo Open http://localhost:5000 in your browser
echo.
python app.py

pause