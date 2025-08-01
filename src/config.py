import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).parent.parent
TRANSCRIPT_DIR = BASE_DIR / "transcripts"
TRANSCRIPT_DIR.mkdir(exist_ok=True)

# Whisper configuration optimized for Indian accent and RTX 4090
WHISPER_CONFIG = {
    "model_size": "large-v3",  # Best accuracy for accents
    "device": "cuda",  # Use GPU
    "compute_type": "float16",  # FP16 for speed on RTX 4090
    "language": "en",  # English
    "task": "transcribe",
    "initial_prompt": (
        "This is a transcription of Indian English speech. "
        "The speaker may use technical terms, proper nouns, and occasionally mix Hindi words. "
        "Please transcribe accurately with proper punctuation."
    ),
    "temperature": 0.0,  # Deterministic output
    "compression_ratio_threshold": 2.4,
    "logprob_threshold": -1.0,
    "no_speech_threshold": 0.6,
    "condition_on_previous_text": True,
    "beam_size": 5,  # Higher for better accuracy
    "best_of": 5,  # Sample 5 times and pick best
    "patience": 1.0,
    "length_penalty": 1.0,
    "suppress_tokens": "-1",
    "suppress_blank": True,
    "word_timestamps": True,  # For better timing
}

# Audio configuration
AUDIO_CONFIG = {
    "sample_rate": 16000,  # Whisper expects 16kHz
    "channels": 1,  # Mono
    "chunk_duration": 1.0,  # Process 1 second chunks
    "buffer_duration": 0.5,  # 500ms buffer for smooth streaming
    "silence_threshold": 0.01,  # Voice activity detection
    "device": None,  # Auto-select default device
}

# UI configuration
UI_CONFIG = {
    "max_display_lines": 50,
    "autosave_interval": 120,  # Auto-save every 2 minutes
    "timestamp_format": "%H:%M:%S",
    "show_confidence": True,
    "show_processing_time": True,
}

# Keyboard shortcuts
SHORTCUTS = {
    "start_stop": "space",
    "save": "s",
    "quit": "q",
    "clear": "c",
    "toggle_timestamps": "t",
    "change_device": "d",
}

# Performance settings
PERFORMANCE = {
    "num_workers": 2,  # Parallel processing threads
    "gpu_memory_fraction": 0.8,  # Use 80% of GPU memory
    "enable_vad": True,  # Voice Activity Detection
    "vad_threshold": 0.5,
    "min_speech_duration": 0.5,  # Minimum speech duration in seconds
}

# File settings
FILE_CONFIG = {
    "output_format": "txt",  # txt or md
    "include_timestamps": True,
    "include_confidence": False,
    "max_file_size": 10 * 1024 * 1024,  # 10MB
}