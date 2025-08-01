@echo off
echo ==========================================
echo WhisperLive Installation Script
echo ==========================================

REM Check if UV is installed
where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing UV package manager...
    powershell -Command "irm https://astral.sh/uv/install.ps1 | iex"
)

REM Create virtual environment
echo Creating virtual environment...
uv venv .venv --python 3.11

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate

REM Check for NVIDIA GPU
nvidia-smi >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo NVIDIA GPU detected, installing CUDA version...
    uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
) else (
    echo No NVIDIA GPU detected, installing CPU version...
    uv pip install torch torchvision torchaudio
)

REM Install remaining dependencies
echo Installing remaining dependencies...
uv pip install -r requirements.txt

echo.
echo ==========================================
echo Installation complete!
echo.
echo To run the application:
echo 1. Activate the virtual environment:
echo    .venv\Scripts\activate
echo 2. Run the application:
echo    python speech_to_text.py
echo.
echo To test the installation:
echo    python test_app.py
echo ==========================================
pause