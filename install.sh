#!/bin/bash

echo "=========================================="
echo "WhisperLive Installation Script"
echo "=========================================="

# Check if UV is installed
if ! command -v uv &> /dev/null; then
    echo "Installing UV package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.local/bin/env
fi

# Create virtual environment
echo "Creating virtual environment..."
uv venv .venv --python 3.11

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Detect platform
OS=$(uname -s)
if [ "$OS" = "Linux" ]; then
    echo "Detected Linux system"
    # Check for CUDA
    if command -v nvidia-smi &> /dev/null; then
        echo "NVIDIA GPU detected, installing CUDA version..."
        uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
    else
        echo "No NVIDIA GPU detected, installing CPU version..."
        uv pip install torch torchvision torchaudio
    fi
elif [ "$OS" = "Darwin" ]; then
    echo "Detected macOS system"
    echo "Installing CPU version (GPU not supported on Mac)..."
    uv pip install torch torchvision torchaudio
else
    echo "Detected Windows/Other system"
    echo "Installing CUDA version..."
    uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
fi

# Install remaining dependencies
echo "Installing remaining dependencies..."
uv pip install -r requirements.txt

echo ""
echo "=========================================="
echo "Installation complete!"
echo ""
echo "To run the application:"
echo "1. Activate the virtual environment:"
echo "   source .venv/bin/activate"
echo "2. Run the application:"
echo "   python speech_to_text.py"
echo ""
echo "To test the installation:"
echo "   python test_app.py"
echo "=========================================="