#!/usr/bin/env python3
"""
Windows Installation Script for WhisperLive
This script handles the installation without requiring UV
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def run_command(cmd, shell=True):
    """Run a command and return success status"""
    try:
        result = subprocess.run(cmd, shell=shell, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"Error running command: {e}")
        return False

def main():
    print("="*60)
    print("WhisperLive Installation for Windows")
    print("="*60)
    
    # Check Python version
    python_version = sys.version_info
    print(f"\nPython version: {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 8):
        print("ERROR: Python 3.8+ is required!")
        sys.exit(1)
    
    # Create virtual environment using venv
    print("\n1. Creating virtual environment...")
    venv_path = Path(".venv")
    
    if venv_path.exists():
        print("   Virtual environment already exists.")
    else:
        if not run_command([sys.executable, "-m", "venv", str(venv_path)], shell=False):
            print("Failed to create virtual environment!")
            sys.exit(1)
        print("   ✓ Virtual environment created")
    
    # Determine pip path
    if platform.system() == "Windows":
        pip_path = venv_path / "Scripts" / "pip.exe"
        python_path = venv_path / "Scripts" / "python.exe"
    else:
        pip_path = venv_path / "bin" / "pip"
        python_path = venv_path / "bin" / "python"
    
    # Upgrade pip
    print("\n2. Upgrading pip...")
    run_command([str(python_path), "-m", "pip", "install", "--upgrade", "pip"], shell=False)
    
    # Check for NVIDIA GPU
    print("\n3. Checking for NVIDIA GPU...")
    has_gpu = False
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, shell=True)
        if result.returncode == 0:
            has_gpu = True
            print("   ✓ NVIDIA GPU detected")
        else:
            print("   ✗ No NVIDIA GPU detected (will use CPU)")
    except:
        print("   ✗ nvidia-smi not found (will use CPU)")
    
    # Install PyTorch
    print("\n4. Installing PyTorch...")
    if has_gpu:
        print("   Installing CUDA version...")
        torch_cmd = [str(pip_path), "install", "torch", "torchvision", "torchaudio", 
                     "--index-url", "https://download.pytorch.org/whl/cu118"]
    else:
        print("   Installing CPU version...")
        torch_cmd = [str(pip_path), "install", "torch", "torchvision", "torchaudio"]
    
    if not run_command(torch_cmd, shell=False):
        print("Failed to install PyTorch!")
        sys.exit(1)
    print("   ✓ PyTorch installed")
    
    # Install other requirements
    print("\n5. Installing other dependencies...")
    
    # Read requirements and filter out torch packages
    with open("requirements.txt", "r") as f:
        requirements = f.read().splitlines()
    
    # Filter out torch-related packages and comments
    filtered_reqs = []
    for req in requirements:
        req = req.strip()
        if req and not req.startswith("#") and not req.startswith("--"):
            if not any(pkg in req.lower() for pkg in ["torch", "torchvision", "torchaudio"]):
                filtered_reqs.append(req)
    
    # Write filtered requirements to temp file
    with open("requirements_filtered.txt", "w") as f:
        f.write("\n".join(filtered_reqs))
    
    # Install filtered requirements
    if not run_command([str(pip_path), "install", "-r", "requirements_filtered.txt"], shell=False):
        print("Warning: Some dependencies may have failed to install")
    
    # Clean up temp file
    try:
        os.remove("requirements_filtered.txt")
    except:
        pass
    
    print("   ✓ Dependencies installed")
    
    # Create activation script
    print("\n6. Creating activation script...")
    
    activate_bat = """@echo off
.venv\\Scripts\\activate
echo WhisperLive environment activated!
echo Run: python speech_to_text.py
"""
    
    with open("activate.bat", "w") as f:
        f.write(activate_bat)
    
    print("   ✓ Created activate.bat")
    
    # Final instructions
    print("\n" + "="*60)
    print("Installation complete!")
    print("="*60)
    print("\nTo use WhisperLive:")
    print("1. Activate the environment:")
    print("   activate.bat")
    print("\n2. Test the installation:")
    print("   python test_app.py")
    print("\n3. Run the application:")
    print("   python speech_to_text.py")
    print("\nFirst run will download the Whisper model (~1.5GB)")
    print("="*60)

if __name__ == "__main__":
    # Change to script directory
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    main()