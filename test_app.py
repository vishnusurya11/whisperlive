#!/usr/bin/env python3

import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

print("Testing WhisperLive components...")
print("=" * 50)

# Test imports
try:
    print("✓ Testing basic imports...")
    from src.config import WHISPER_CONFIG, AUDIO_CONFIG
    print("  - Config module: OK")
    
    from src.audio_handler import AudioCapture
    print("  - Audio handler: OK")
    
    from src.display import TerminalDisplay
    print("  - Display module: OK")
    
    from src.utils import TranscriptManager, SystemMonitor
    print("  - Utils module: OK")
    
except ImportError as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)

# Test audio devices
print("\n✓ Testing audio devices...")
try:
    devices = AudioCapture.list_devices()
    print(f"  - Found {len(devices)} audio input devices:")
    for device in devices[:3]:  # Show first 3
        print(f"    • {device.name} {'[DEFAULT]' if device.is_default else ''}")
except Exception as e:
    print(f"✗ Audio device error: {e}")

# Test GPU availability
print("\n✓ Testing GPU availability...")
try:
    import torch
    if torch.cuda.is_available():
        print(f"  - GPU: {torch.cuda.get_device_name(0)}")
        print(f"  - CUDA Version: {torch.version.cuda}")
        print(f"  - PyTorch Version: {torch.__version__}")
    else:
        print("  - No GPU detected, will use CPU")
except Exception as e:
    print(f"✗ GPU test error: {e}")

# Test Whisper import
print("\n✓ Testing Whisper...")
try:
    import whisper
    print("  - Whisper module: OK")
    print(f"  - Available models: {', '.join(['tiny', 'base', 'small', 'medium', 'large-v3'])}")
except ImportError:
    print("✗ Whisper not installed. Run: pip install openai-whisper")

# Test dependencies
print("\n✓ Testing other dependencies...")
deps = {
    "sounddevice": "Audio capture",
    "numpy": "Numerical processing",
    "rich": "Terminal UI",
    "colorama": "Cross-platform colors",
    "psutil": "System monitoring",
    "pynvml": "GPU monitoring"
}

missing = []
for module, desc in deps.items():
    try:
        __import__(module)
        print(f"  - {module} ({desc}): OK")
    except ImportError:
        missing.append(module)
        print(f"  ✗ {module} ({desc}): MISSING")

if missing:
    print(f"\nMissing dependencies: {', '.join(missing)}")
    print("Install with: pip install -r requirements.txt")
else:
    print("\n✅ All tests passed! Ready to run speech_to_text.py")

# Test microphone permissions
print("\n✓ Testing microphone permissions...")
try:
    audio = AudioCapture()
    has_permission, msg = audio.check_microphone_permission()
    if has_permission:
        print(f"  - Microphone access: OK")
    else:
        print(f"  ✗ {msg}")
except Exception as e:
    print(f"  ✗ Permission test error: {e}")

print("\n" + "=" * 50)
print("Test complete!")