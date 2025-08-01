#!/usr/bin/env python3

import sys
import os
import time
import threading
import queue
import signal
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.audio_handler import AudioCapture, AudioDevice
from src.transcriber import WhisperTranscriber
from src.display import TerminalDisplay
from src.utils import TranscriptManager, SystemMonitor, check_dependencies, cleanup_old_transcripts
from src.config import UI_CONFIG, SHORTCUTS, PERFORMANCE

import numpy as np
import platform

# Platform-specific imports
if platform.system() == "Windows":
    import msvcrt
    import asyncio
    # Windows event loop policy
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
else:
    import termios
    import tty
    import select

# Try to import keyboard, fallback to basic input if not available
try:
    import keyboard
    HAS_KEYBOARD = True
except ImportError:
    HAS_KEYBOARD = False
    print("Warning: 'keyboard' module not available. Using basic input mode.")


class KeyboardHandler:
    def __init__(self):
        self.system = platform.system()
        self.callbacks = {}
        
    def add_hotkey(self, key, callback):
        self.callbacks[key.lower()] = callback
        
    def check_input(self):
        if self.system == "Windows":
            if msvcrt.kbhit():
                key = msvcrt.getch().decode('utf-8', errors='ignore').lower()
                if key in self.callbacks:
                    self.callbacks[key]()
        else:
            # Unix/Linux/Mac
            if select.select([sys.stdin], [], [], 0)[0]:
                key = sys.stdin.read(1).lower()
                if key in self.callbacks:
                    self.callbacks[key]()


class SpeechToTextApp:
    def __init__(self):
        self.audio_capture = None
        self.transcriber = None
        self.display = None
        self.transcript_manager = None
        self.system_monitor = None
        
        self.is_running = False
        self.is_recording = False
        self.selected_device = None
        
        # Threading
        self.transcription_queue = queue.Queue()
        self.last_transcription = ""
        self.accumulated_text = []
        
        # Auto-save
        self.last_autosave = time.time()
        
    def initialize(self):
        print("Initializing Speech-to-Text Application...")
        
        # Check dependencies
        deps_ok, missing = check_dependencies()
        if not deps_ok:
            print(f"Missing dependencies: {', '.join(missing)}")
            print("Please install requirements: pip install -r requirements.txt")
            return False
            
        # Initialize components
        try:
            # System monitor
            self.system_monitor = SystemMonitor()
            
            # Audio capture
            self.audio_capture = AudioCapture()
            
            # Check microphone permission
            has_permission, msg = self.audio_capture.check_microphone_permission()
            if not has_permission:
                print(f"Microphone error: {msg}")
                return False
                
            # Transcriber
            self.transcriber = WhisperTranscriber()
            
            # Display
            self.display = TerminalDisplay()
            
            # Transcript manager
            self.transcript_manager = TranscriptManager()
            
            # Clean old transcripts
            cleanup_old_transcripts(days=30)
            
            return True
            
        except Exception as e:
            print(f"Initialization error: {e}")
            return False
            
    def setup_audio_device(self):
        devices = AudioCapture.list_devices()
        
        if not devices:
            print("No audio input devices found!")
            return False
            
        # Show device list
        print("\nAvailable audio devices:")
        for i, device in enumerate(devices):
            marker = "[DEFAULT]" if device.is_default else ""
            print(f"{i + 1}. {device.name} {marker}")
            
        # Auto-select default or let user choose
        default_device = next((d for d in devices if d.is_default), devices[0])
        
        print(f"\nUsing: {default_device.name}")
        print("Press 'D' during recording to change device")
        
        self.audio_capture.select_device(default_device.index)
        self.display.set_device_name(default_device.name)
        self.selected_device = default_device
        
        return True
        
    def load_model(self):
        print("\nLoading Whisper model (this may take a moment)...")
        
        def progress_callback(msg):
            print(f"  {msg}")
            
        try:
            self.transcriber.load_model(progress_callback)
            
            # Show GPU stats
            gpu_stats = self.transcriber.get_gpu_stats()
            if gpu_stats["available"]:
                print(f"\nGPU: {gpu_stats['device']}")
                print(f"Memory: {gpu_stats['memory_used']:.1f}/{gpu_stats['memory_total']:.1f} GB")
            else:
                print("\nRunning on CPU (slower performance)")
                
            return True
            
        except Exception as e:
            print(f"Model loading error: {e}")
            return False
            
    def setup_callbacks(self):
        # Audio callbacks
        self.audio_capture.on_audio_chunk = self.process_audio_chunk
        self.audio_capture.on_vad_change = self.on_voice_activity_change
        
        # Keyboard callbacks
        if HAS_KEYBOARD:
            keyboard.on_press_key(SHORTCUTS["start_stop"], lambda _: self.toggle_recording())
            keyboard.on_press_key(SHORTCUTS["save"], lambda _: self.save_transcript())
            keyboard.on_press_key(SHORTCUTS["quit"], lambda _: self.quit())
            keyboard.on_press_key(SHORTCUTS["clear"], lambda _: self.clear_transcript())
            keyboard.on_press_key(SHORTCUTS["toggle_timestamps"], lambda _: self.toggle_timestamps())
            keyboard.on_press_key(SHORTCUTS["change_device"], lambda _: self.change_device())
        else:
            # Use fallback keyboard handler
            self.keyboard_handler = KeyboardHandler()
            self.keyboard_handler.add_hotkey(SHORTCUTS["start_stop"], self.toggle_recording)
            self.keyboard_handler.add_hotkey(SHORTCUTS["save"], self.save_transcript)
            self.keyboard_handler.add_hotkey(SHORTCUTS["quit"], self.quit)
            self.keyboard_handler.add_hotkey(SHORTCUTS["clear"], self.clear_transcript)
            self.keyboard_handler.add_hotkey(SHORTCUTS["toggle_timestamps"], self.toggle_timestamps)
            self.keyboard_handler.add_hotkey(SHORTCUTS["change_device"], self.change_device)
        
    def process_audio_chunk(self, audio_data: np.ndarray):
        if not self.is_recording:
            return
            
        # Update audio level
        level = float(np.sqrt(np.mean(audio_data**2))) * 10  # Scale for display
        self.display.set_audio_level(level)
        
        # Queue for transcription
        self.transcription_queue.put(audio_data)
        
    def on_voice_activity_change(self, is_speaking: bool):
        # Could add visual indicator for voice activity
        pass
        
    def transcription_worker(self):
        while self.is_running:
            try:
                # Get audio from queue
                audio_data = self.transcription_queue.get(timeout=0.1)
                
                # Transcribe
                result = self.transcriber.transcribe(audio_data)
                
                if result and result.text:
                    # Add to display
                    self.display.add_transcription(
                        result.text,
                        result.confidence,
                        result.timestamp
                    )
                    
                    # Accumulate for saving
                    self.accumulated_text.append(result.text)
                    
                    # Show processing time in debug mode
                    if UI_CONFIG.get("show_processing_time"):
                        print(f"Processing time: {result.processing_time:.2f}s")
                        
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Transcription error: {e}")
                
    def monitor_worker(self):
        while self.is_running:
            try:
                # Update system stats
                stats = self.system_monitor.get_system_stats()
                gpu_stats = self.transcriber.get_gpu_stats() if self.transcriber else {}
                
                # Merge stats
                stats.update(gpu_stats)
                self.display.update_gpu_stats(stats)
                
                # Auto-save check
                if time.time() - self.last_autosave > UI_CONFIG["autosave_interval"]:
                    if self.accumulated_text:
                        self.auto_save()
                        
                time.sleep(1)
                
            except Exception as e:
                print(f"Monitor error: {e}")
                
    def toggle_recording(self):
        if self.is_recording:
            self.stop_recording()
        else:
            self.start_recording()
            
    def start_recording(self):
        if self.is_recording:
            return
            
        try:
            self.audio_capture.start()
            self.is_recording = True
            self.display.set_recording_status(True)
            
        except Exception as e:
            print(f"Failed to start recording: {e}")
            
    def stop_recording(self):
        if not self.is_recording:
            return
            
        self.audio_capture.stop()
        self.is_recording = False
        self.display.set_recording_status(False)
        
        # Process remaining audio
        time.sleep(0.5)
        
    def save_transcript(self):
        transcript = self.display.get_full_transcript()
        
        if not transcript:
            print("No transcript to save")
            return
            
        try:
            filepath = self.transcript_manager.save_transcript(transcript)
            self.display.mark_saved()
            print(f"\nTranscript saved to: {filepath}")
            
        except Exception as e:
            print(f"Save error: {e}")
            
    def auto_save(self):
        if not self.accumulated_text:
            return
            
        # Join accumulated text
        new_text = " ".join(self.accumulated_text)
        self.accumulated_text.clear()
        
        # Auto-save
        success = self.transcript_manager.auto_save(new_text)
        if success:
            self.display.mark_saved()
            self.last_autosave = time.time()
            
    def clear_transcript(self):
        self.display.clear_transcript()
        self.accumulated_text.clear()
        
    def toggle_timestamps(self):
        self.display.toggle_timestamps()
        
    def change_device(self):
        # This would show device selection menu
        # For now, just cycle through devices
        devices = AudioCapture.list_devices()
        if len(devices) > 1:
            current_idx = next((i for i, d in enumerate(devices) if d.index == self.selected_device.index), 0)
            next_idx = (current_idx + 1) % len(devices)
            next_device = devices[next_idx]
            
            was_recording = self.is_recording
            if was_recording:
                self.stop_recording()
                
            self.audio_capture.select_device(next_device.index)
            self.display.set_device_name(next_device.name)
            self.selected_device = next_device
            
            if was_recording:
                self.start_recording()
                
    def quit(self):
        self.is_running = False
        
    def run(self):
        # Initialize
        if not self.initialize():
            return
            
        # Setup audio device
        if not self.setup_audio_device():
            return
            
        # Load model
        if not self.load_model():
            return
            
        # Setup callbacks
        self.setup_callbacks()
        
        # Start display
        self.display.start()
        
        # Start workers
        self.is_running = True
        
        transcription_thread = threading.Thread(target=self.transcription_worker)
        transcription_thread.daemon = True
        transcription_thread.start()
        
        monitor_thread = threading.Thread(target=self.monitor_worker)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        print("\nReady! Press SPACE to start recording...")
        print(f"Press {SHORTCUTS['quit'].upper()} to quit")
        
        try:
            # Main loop
            while self.is_running:
                self.display.update()
                
                # Check for keyboard input if using fallback
                if not HAS_KEYBOARD and hasattr(self, 'keyboard_handler'):
                    self.keyboard_handler.check_input()
                    
                time.sleep(0.1)
                
        except KeyboardInterrupt:
            print("\nInterrupted by user")
            
        finally:
            self.cleanup()
            
    def cleanup(self):
        print("\nCleaning up...")
        
        # Stop recording
        if self.is_recording:
            self.stop_recording()
            
        # Save any remaining transcript
        if self.accumulated_text:
            self.auto_save()
            
        # Stop display
        if self.display:
            self.display.stop()
            
        # Cleanup components
        if self.audio_capture:
            self.audio_capture.stop()
            
        if self.transcriber:
            self.transcriber.cleanup()
            
        if self.system_monitor:
            self.system_monitor.cleanup()
            
        print("Goodbye!")


def main():
    # Handle signals
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    
    # Clear screen
    os.system('cls' if os.name == 'nt' else 'clear')
    
    print("=" * 60)
    print("REAL-TIME SPEECH-TO-TEXT TRANSCRIPTION")
    print("Optimized for Indian English & RTX 4090")
    print("=" * 60)
    
    # Run app
    app = SpeechToTextApp()
    app.run()


if __name__ == "__main__":
    main()