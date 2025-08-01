import sounddevice as sd
import numpy as np
import queue
import threading
import time
from typing import Optional, Callable, List, Tuple
from dataclasses import dataclass

from .config import AUDIO_CONFIG


@dataclass
class AudioDevice:
    index: int
    name: str
    channels: int
    sample_rate: float
    is_default: bool = False


class AudioCapture:
    def __init__(self, device_index: Optional[int] = None):
        self.sample_rate = AUDIO_CONFIG["sample_rate"]
        self.channels = AUDIO_CONFIG["channels"]
        self.chunk_duration = AUDIO_CONFIG["chunk_duration"]
        self.buffer_duration = AUDIO_CONFIG["buffer_duration"]
        self.device_index = device_index
        
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.stream = None
        self.thread = None
        
        # Voice Activity Detection
        self.silence_threshold = AUDIO_CONFIG["silence_threshold"]
        self.is_speaking = False
        self.silence_start = None
        
        # Platform-specific settings
        self._configure_platform()
        
        # Callbacks
        self.on_audio_chunk: Optional[Callable] = None
        self.on_vad_change: Optional[Callable] = None
        
        # Buffer for smooth audio
        self.buffer_size = int(self.sample_rate * self.buffer_duration)
        self.audio_buffer = np.zeros(self.buffer_size, dtype=np.float32)
        
    def _configure_platform(self):
        import platform
        system = platform.system()
        
        if system == "Windows":
            # Windows-specific audio settings
            sd.default.latency = 'low'
        elif system == "Darwin":  # macOS
            # macOS-specific settings
            sd.default.latency = 'low'
        else:  # Linux
            # Linux-specific settings
            pass
        
    @staticmethod
    def list_devices() -> List[AudioDevice]:
        devices = []
        default_input = sd.default.device[0]
        
        for idx, device in enumerate(sd.query_devices()):
            if device['max_input_channels'] > 0:  # Input devices only
                devices.append(AudioDevice(
                    index=idx,
                    name=device['name'],
                    channels=device['max_input_channels'],
                    sample_rate=device['default_samplerate'],
                    is_default=(idx == default_input)
                ))
        
        return devices
    
    def select_device(self, device_index: int):
        if self.is_recording:
            self.stop()
        self.device_index = device_index
        
    def _audio_callback(self, indata, frames, time, status):
        if status:
            print(f"Audio callback status: {status}")
            
        # Convert to mono if needed
        audio_data = indata[:, 0] if indata.shape[1] > 1 else indata.flatten()
        
        # Add to queue for processing
        self.audio_queue.put(audio_data.copy())
        
        # Voice Activity Detection
        energy = np.sqrt(np.mean(audio_data**2))
        is_speech = energy > self.silence_threshold
        
        if is_speech != self.is_speaking:
            self.is_speaking = is_speech
            if self.on_vad_change:
                self.on_vad_change(is_speech)
                
    def start(self):
        if self.is_recording:
            return
            
        try:
            self.stream = sd.InputStream(
                device=self.device_index,
                channels=self.channels,
                samplerate=self.sample_rate,
                callback=self._audio_callback,
                blocksize=int(self.sample_rate * self.chunk_duration),
                dtype=np.float32
            )
            self.stream.start()
            self.is_recording = True
            
            # Start processing thread
            self.thread = threading.Thread(target=self._process_audio)
            self.thread.daemon = True
            self.thread.start()
            
        except Exception as e:
            raise RuntimeError(f"Failed to start audio capture: {e}")
            
    def stop(self):
        self.is_recording = False
        
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
            
        if self.thread:
            self.thread.join(timeout=1.0)
            
        # Clear queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
                
    def _process_audio(self):
        accumulated_audio = []
        accumulated_duration = 0
        
        while self.is_recording:
            try:
                # Get audio chunk with timeout
                audio_chunk = self.audio_queue.get(timeout=0.1)
                
                # Accumulate audio
                accumulated_audio.append(audio_chunk)
                accumulated_duration += len(audio_chunk) / self.sample_rate
                
                # Process when we have enough audio
                if accumulated_duration >= self.chunk_duration:
                    combined_audio = np.concatenate(accumulated_audio)
                    
                    # Send to callback
                    if self.on_audio_chunk:
                        self.on_audio_chunk(combined_audio)
                        
                    # Reset accumulator
                    accumulated_audio = []
                    accumulated_duration = 0
                    
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Error processing audio: {e}")
                
    def get_level(self) -> float:
        try:
            # Get latest audio without blocking
            audio_data = self.audio_queue.get_nowait()
            self.audio_queue.put(audio_data)  # Put it back
            return float(np.sqrt(np.mean(audio_data**2)))
        except queue.Empty:
            return 0.0
            
    def check_microphone_permission(self) -> Tuple[bool, str]:
        try:
            # Try to create a short test stream
            test_stream = sd.InputStream(
                device=self.device_index,
                channels=1,
                samplerate=self.sample_rate,
                blocksize=1024,
                duration=0.1
            )
            test_stream.close()
            return True, "Microphone access granted"
        except sd.PortAudioError as e:
            return False, f"Microphone access denied: {e}"
        except Exception as e:
            return False, f"Error checking microphone: {e}"