import os
import sys
import time
from datetime import datetime
from typing import List, Optional, Tuple
from collections import deque
import threading
from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.text import Text
from rich.live import Live
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.syntax import Syntax

from .config import UI_CONFIG, SHORTCUTS


class TerminalDisplay:
    def __init__(self):
        self.console = Console()
        self.transcription_lines = deque(maxlen=UI_CONFIG["max_display_lines"])
        self.is_recording = False
        self.show_timestamps = UI_CONFIG.get("include_timestamps", True)
        self.audio_level = 0.0
        self.current_device = "Default"
        self.gpu_stats = {}
        self.last_save_time = None
        self.total_words = 0
        self.session_start = time.time()
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Layout components
        self.layout = None
        self.live = None
        
    def start(self):
        self.layout = self._create_layout()
        self.live = Live(self.layout, console=self.console, refresh_per_second=4)
        self.live.start()
        
    def stop(self):
        if self.live:
            self.live.stop()
            
    def _create_layout(self) -> Layout:
        layout = Layout()
        
        layout.split_column(
            Layout(name="header", size=3),
            Layout(name="main", ratio=1),
            Layout(name="footer", size=6)
        )
        
        layout["main"].split_row(
            Layout(name="transcript", ratio=3),
            Layout(name="stats", ratio=1)
        )
        
        return layout
        
    def update(self):
        if not self.layout:
            return
            
        with self.lock:
            # Update header
            self.layout["header"].update(self._create_header())
            
            # Update transcript
            self.layout["transcript"].update(self._create_transcript_panel())
            
            # Update stats
            self.layout["stats"].update(self._create_stats_panel())
            
            # Update footer
            self.layout["footer"].update(self._create_footer())
            
    def _create_header(self) -> Panel:
        status = "[bold green]● RECORDING[/]" if self.is_recording else "[bold red]● STOPPED[/]"
        
        # Audio level meter
        level_bar = self._create_audio_meter(self.audio_level)
        
        header_text = f"{status}  |  Audio: {level_bar}  |  Device: {self.current_device}"
        
        return Panel(
            header_text,
            style="bold white on blue",
            title="[bold]Real-Time Speech Transcription[/]",
            border_style="blue"
        )
        
    def _create_audio_meter(self, level: float) -> str:
        # Create visual audio level meter
        max_bars = 20
        filled = int(level * max_bars)
        
        if filled < 5:
            color = "green"
        elif filled < 15:
            color = "yellow"
        else:
            color = "red"
            
        meter = f"[{color}]{'█' * filled}[/]{'░' * (max_bars - filled)}"
        return meter
        
    def _create_transcript_panel(self) -> Panel:
        transcript_text = Text()
        
        for line in self.transcription_lines:
            if self.show_timestamps and "timestamp" in line:
                timestamp = datetime.fromtimestamp(line["timestamp"]).strftime(
                    UI_CONFIG["timestamp_format"]
                )
                transcript_text.append(f"[dim]{timestamp}[/] ", style="cyan")
                
            text = line.get("text", "")
            confidence = line.get("confidence", 1.0)
            
            # Color based on confidence
            if confidence > 0.9:
                style = "white"
            elif confidence > 0.7:
                style = "yellow"
            else:
                style = "red"
                
            transcript_text.append(text + "\n", style=style)
            
        return Panel(
            transcript_text,
            title="[bold]Transcript[/]",
            border_style="green",
            padding=(1, 2)
        )
        
    def _create_stats_panel(self) -> Panel:
        stats_table = Table(show_header=False, box=None, padding=(0, 1))
        stats_table.add_column("Label", style="cyan")
        stats_table.add_column("Value", style="white")
        
        # Session duration
        duration = time.time() - self.session_start
        hours, remainder = divmod(duration, 3600)
        minutes, seconds = divmod(remainder, 60)
        duration_str = f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}"
        
        stats_table.add_row("Duration:", duration_str)
        stats_table.add_row("Words:", str(self.total_words))
        
        if self.last_save_time:
            save_ago = int(time.time() - self.last_save_time)
            stats_table.add_row("Last Save:", f"{save_ago}s ago")
        else:
            stats_table.add_row("Last Save:", "Not saved")
            
        # GPU stats
        if self.gpu_stats.get("available"):
            gpu_mem = f"{self.gpu_stats.get('memory_used', 0):.1f}/{self.gpu_stats.get('memory_total', 0):.1f}GB"
            stats_table.add_row("GPU Mem:", gpu_mem)
            stats_table.add_row("GPU Usage:", f"{self.gpu_stats.get('utilization', 0)}%")
        else:
            stats_table.add_row("GPU:", "Not available")
            
        return Panel(
            stats_table,
            title="[bold]Statistics[/]",
            border_style="blue"
        )
        
    def _create_footer(self) -> Panel:
        shortcuts_text = Text()
        
        shortcuts_text.append("Shortcuts: ", style="bold cyan")
        shortcuts_text.append(f"[{SHORTCUTS['start_stop'].upper()}] Start/Stop  ", style="green")
        shortcuts_text.append(f"[{SHORTCUTS['save'].upper()}] Save  ", style="yellow")
        shortcuts_text.append(f"[{SHORTCUTS['clear'].upper()}] Clear  ", style="blue")
        shortcuts_text.append(f"[{SHORTCUTS['toggle_timestamps'].upper()}] Timestamps  ", style="magenta")
        shortcuts_text.append(f"[{SHORTCUTS['change_device'].upper()}] Device  ", style="cyan")
        shortcuts_text.append(f"[{SHORTCUTS['quit'].upper()}] Quit", style="red")
        
        return Panel(
            shortcuts_text,
            style="bold white on black",
            border_style="white"
        )
        
    def add_transcription(self, text: str, confidence: float = 1.0, timestamp: Optional[float] = None):
        if not text.strip():
            return
            
        with self.lock:
            self.transcription_lines.append({
                "text": text,
                "confidence": confidence,
                "timestamp": timestamp or time.time()
            })
            
            # Update word count
            self.total_words += len(text.split())
            
        self.update()
        
    def set_recording_status(self, is_recording: bool):
        with self.lock:
            self.is_recording = is_recording
        self.update()
        
    def set_audio_level(self, level: float):
        with self.lock:
            self.audio_level = min(max(level, 0.0), 1.0)
            
    def set_device_name(self, device_name: str):
        with self.lock:
            self.current_device = device_name
        self.update()
        
    def update_gpu_stats(self, stats: dict):
        with self.lock:
            self.gpu_stats = stats
            
    def mark_saved(self):
        with self.lock:
            self.last_save_time = time.time()
        self.update()
        
    def clear_transcript(self):
        with self.lock:
            self.transcription_lines.clear()
            self.total_words = 0
        self.update()
        
    def toggle_timestamps(self):
        with self.lock:
            self.show_timestamps = not self.show_timestamps
        self.update()
        
    def get_full_transcript(self) -> str:
        with self.lock:
            lines = []
            for line in self.transcription_lines:
                if self.show_timestamps:
                    timestamp = datetime.fromtimestamp(line["timestamp"]).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
                    lines.append(f"[{timestamp}] {line['text']}")
                else:
                    lines.append(line['text'])
                    
            return "\n".join(lines)