import whisper
import torch
import numpy as np
import time
import warnings
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from threading import Lock
import queue
import threading

from .config import WHISPER_CONFIG, PERFORMANCE

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


@dataclass
class TranscriptionResult:
    text: str
    language: str
    confidence: float
    processing_time: float
    timestamp: float
    segments: list = None


class WhisperTranscriber:
    def __init__(self):
        self.model = None
        self.device = None
        self.model_lock = Lock()
        self.is_loaded = False
        
        # Processing queue
        self.audio_queue = queue.Queue()
        self.result_queue = queue.Queue()
        self.processing_thread = None
        self.is_processing = False
        
        # GPU optimization
        self._setup_gpu()
        
    def _setup_gpu(self):
        if torch.cuda.is_available():
            self.device = "cuda"
            # Set GPU memory fraction
            torch.cuda.set_per_process_memory_fraction(
                PERFORMANCE["gpu_memory_fraction"]
            )
            # Enable TF32 for better performance on RTX 4090
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            print(f"GPU detected: {torch.cuda.get_device_name(0)}")
            print(f"CUDA version: {torch.version.cuda}")
        else:
            self.device = "cpu"
            print("No GPU detected, using CPU")
            
    def load_model(self, progress_callback=None):
        try:
            model_size = WHISPER_CONFIG["model_size"]
            print(f"Loading Whisper {model_size} model...")
            
            if progress_callback:
                progress_callback("Downloading model if needed...")
                
            # Load model with FP16 for GPU
            self.model = whisper.load_model(
                model_size,
                device=self.device,
                download_root=None,  # Use default cache
                in_memory=True
            )
            
            # Move to GPU and optimize
            if self.device == "cuda":
                self.model = self.model.half()  # FP16 for speed
                
            self.is_loaded = True
            print(f"Model loaded successfully on {self.device}")
            
            # Start processing thread
            self.is_processing = True
            self.processing_thread = threading.Thread(target=self._process_loop)
            self.processing_thread.daemon = True
            self.processing_thread.start()
            
        except Exception as e:
            raise RuntimeError(f"Failed to load Whisper model: {e}")
            
    def transcribe(self, audio_data: np.ndarray) -> Optional[TranscriptionResult]:
        if not self.is_loaded:
            return None
            
        # Add to processing queue
        timestamp = time.time()
        self.audio_queue.put((audio_data, timestamp))
        
        # Try to get result (non-blocking)
        try:
            result = self.result_queue.get_nowait()
            return result
        except queue.Empty:
            return None
            
    def _process_loop(self):
        while self.is_processing:
            try:
                # Get audio from queue
                audio_data, timestamp = self.audio_queue.get(timeout=0.1)
                
                # Process transcription
                result = self._transcribe_internal(audio_data, timestamp)
                
                # Put result in queue
                self.result_queue.put(result)
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Error in transcription loop: {e}")
                
    def _transcribe_internal(self, audio_data: np.ndarray, timestamp: float) -> TranscriptionResult:
        start_time = time.time()
        
        try:
            with self.model_lock:
                # Prepare audio
                audio_data = audio_data.astype(np.float32)
                
                # Transcribe with optimized settings
                result = self.model.transcribe(
                    audio_data,
                    language=WHISPER_CONFIG["language"],
                    task=WHISPER_CONFIG["task"],
                    initial_prompt=WHISPER_CONFIG["initial_prompt"],
                    temperature=WHISPER_CONFIG["temperature"],
                    compression_ratio_threshold=WHISPER_CONFIG["compression_ratio_threshold"],
                    logprob_threshold=WHISPER_CONFIG["logprob_threshold"],
                    no_speech_threshold=WHISPER_CONFIG["no_speech_threshold"],
                    condition_on_previous_text=WHISPER_CONFIG["condition_on_previous_text"],
                    beam_size=WHISPER_CONFIG["beam_size"] if self.device == "cuda" else 1,
                    best_of=WHISPER_CONFIG["best_of"] if self.device == "cuda" else 1,
                    fp16=(self.device == "cuda"),
                    word_timestamps=WHISPER_CONFIG["word_timestamps"],
                    verbose=False
                )
                
            # Calculate confidence
            confidence = self._calculate_confidence(result)
            
            # Process result
            processing_time = time.time() - start_time
            
            return TranscriptionResult(
                text=result["text"].strip(),
                language=result.get("language", "en"),
                confidence=confidence,
                processing_time=processing_time,
                timestamp=timestamp,
                segments=result.get("segments", [])
            )
            
        except Exception as e:
            import traceback
            error_msg = f"Transcription error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            return TranscriptionResult(
                text=f"[Error: {str(e)}]",
                language="en",
                confidence=0.0,
                processing_time=time.time() - start_time,
                timestamp=timestamp
            )
            
    def _calculate_confidence(self, result: Dict[str, Any]) -> float:
        if "segments" not in result or not result["segments"]:
            return 0.0
            
        # Calculate average probability from segments
        total_prob = 0
        total_tokens = 0
        
        for segment in result["segments"]:
            if "avg_logprob" in segment:
                # Convert log probability to probability
                prob = np.exp(segment["avg_logprob"])
                tokens = segment.get("tokens", [])
                total_prob += prob * len(tokens)
                total_tokens += len(tokens)
                
        if total_tokens > 0:
            return min(total_prob / total_tokens, 1.0)
        return 0.0
        
    def get_gpu_stats(self) -> Dict[str, Any]:
        if self.device != "cuda" or not torch.cuda.is_available():
            return {"device": "CPU", "available": False}
            
        stats = {
            "device": torch.cuda.get_device_name(0),
            "available": True,
            "memory_used": torch.cuda.memory_allocated() / 1024**3,  # GB
            "memory_total": torch.cuda.get_device_properties(0).total_memory / 1024**3,  # GB
        }
        
        # Try to get GPU utilization using pynvml if available
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            stats["utilization"] = util.gpu
            pynvml.nvmlShutdown()
        except:
            stats["utilization"] = 0  # Default if pynvml not available
            
        return stats
        
    def cleanup(self):
        self.is_processing = False
        
        if self.processing_thread:
            self.processing_thread.join(timeout=1.0)
            
        # Clear queues
        while not self.audio_queue.empty():
            self.audio_queue.get_nowait()
        while not self.result_queue.empty():
            self.result_queue.get_nowait()
            
        # Clear model from memory
        if self.model is not None:
            del self.model
            self.model = None
            
        # Clear GPU cache
        if self.device == "cuda":
            torch.cuda.empty_cache()
            
        self.is_loaded = False