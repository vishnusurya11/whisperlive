import os
import sys
import time
from pathlib import Path
from datetime import datetime
import json
import psutil
import pynvml
from typing import Tuple, List

from .config import TRANSCRIPT_DIR, FILE_CONFIG


class TranscriptManager:
    def __init__(self):
        self.current_file = None
        self.ensure_transcript_dir()
        
    def ensure_transcript_dir(self):
        TRANSCRIPT_DIR.mkdir(exist_ok=True)
        
    def save_transcript(self, content: str, format: str = None) -> Path:
        format = format or FILE_CONFIG["output_format"]
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"transcript_{timestamp}.{format}"
        filepath = TRANSCRIPT_DIR / filename
        
        # Add metadata header
        header = self._create_header()
        full_content = header + "\n\n" + content
        
        # Save file
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(full_content)
            
        self.current_file = filepath
        return filepath
        
    def _create_header(self) -> str:
        header_lines = [
            "=" * 50,
            "SPEECH TRANSCRIPTION",
            f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Duration: {time.strftime('%H:%M:%S', time.gmtime(time.time()))}",
            "=" * 50
        ]
        return "\n".join(header_lines)
        
    def auto_save(self, content: str) -> bool:
        try:
            if not self.current_file:
                self.current_file = self.save_transcript(content)
            else:
                # Append to existing file
                with open(self.current_file, "a", encoding="utf-8") as f:
                    f.write("\n" + content)
            return True
        except Exception as e:
            print(f"Auto-save error: {e}")
            return False


class SystemMonitor:
    def __init__(self):
        self.gpu_available = False
        try:
            pynvml.nvmlInit()
            self.gpu_available = True
            self.gpu_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        except:
            pass
            
    def get_system_stats(self) -> dict:
        stats = {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": psutil.virtual_memory().percent,
        }
        
        if self.gpu_available:
            try:
                gpu_info = pynvml.nvmlDeviceGetMemoryInfo(self.gpu_handle)
                gpu_util = pynvml.nvmlDeviceGetUtilizationRates(self.gpu_handle)
                
                stats.update({
                    "gpu_available": True,
                    "gpu_memory_used": gpu_info.used / 1024**3,  # GB
                    "gpu_memory_total": gpu_info.total / 1024**3,  # GB
                    "gpu_utilization": gpu_util.gpu,
                })
            except:
                stats["gpu_available"] = False
        else:
            stats["gpu_available"] = False
            
        return stats
        
    def cleanup(self):
        if self.gpu_available:
            try:
                pynvml.nvmlShutdown()
            except:
                pass


def check_dependencies() -> Tuple[bool, List[str]]:
    missing = []
    
    # Check critical imports
    required_modules = [
        "whisper",
        "torch",
        "sounddevice",
        "numpy",
        "rich",
        "keyboard"
    ]
    
    for module in required_modules:
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
            
    # Check CUDA availability
    try:
        import torch
        if not torch.cuda.is_available():
            missing.append("CUDA (GPU support)")
    except:
        pass
        
    return len(missing) == 0, missing


def format_duration(seconds: float) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}"


def cleanup_old_transcripts(days: int = 7):
    import time
    from datetime import datetime, timedelta
    
    cutoff_time = time.time() - (days * 24 * 60 * 60)
    
    for file in TRANSCRIPT_DIR.iterdir():
        if file.is_file() and file.stat().st_mtime < cutoff_time:
            try:
                file.unlink()
                print(f"Deleted old transcript: {file.name}")
            except Exception as e:
                print(f"Error deleting {file.name}: {e}")