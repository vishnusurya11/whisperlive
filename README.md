# WhisperFlow - Real-Time Speech Transcription

A modern, web-based speech transcription application using OpenAI's Whisper model. Features real-time transcription, file upload support, and GPU acceleration - all without external dependencies like ffmpeg.

\![WhisperFlow](https://img.shields.io/badge/whisper-flow-purple?style=for-the-badge)
\![Python](https://img.shields.io/badge/python-3.8+-blue?style=for-the-badge)
\![CUDA](https://img.shields.io/badge/CUDA-enabled-green?style=for-the-badge)

## Features

- 🎙️ **Real-time transcription** - Live microphone recording with instant results
- 📁 **File upload support** - Transcribe audio and video files
- 🚀 **GPU acceleration** - Optimized for NVIDIA GPUs
- 🌐 **Web-based interface** - Modern, responsive UI
- 📝 **Export transcripts** - Save your transcriptions
- 🔧 **No ffmpeg required** - Works out of the box
- 🌍 **Multi-language support** - Transcribe in multiple languages

## Quick Start

### Requirements
- Python 3.8 or higher
- NVIDIA GPU with CUDA support (optional, but recommended)
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/vishnusurya11/whisperflow.git
   cd whisperflow
   ```

2. **Create a virtual environment**
   ```bash
   # Using UV (recommended)
   pip install uv
   uv venv
   
   # Activate environment
   # Windows:
   .venv\Scripts\activate
   # Linux/Mac:
   source .venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   uv pip install -r requirements.txt
   ```

4. **Install PyTorch with CUDA** (for GPU support)
   ```bash
   # CUDA 11.8
   uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   
   # CUDA 12.1
   uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```

## Usage

1. **Start the application**
   ```bash
   python app.py
   ```

2. **Open your browser**
   Navigate to `http://localhost:5000`

3. **Choose your mode**
   - **Live Recording**: Click the microphone button for real-time transcription
   - **File Upload**: Click the folder button to transcribe audio/video files

## Supported Formats

### Audio Files
- WAV, MP3, M4A, FLAC, OGG, WMA

### Video Files
- MP4, AVI, MOV, MKV, WebM

## Configuration

### Model Selection
Choose from various Whisper models based on your needs:
- `tiny` - Fastest, least accurate (39M parameters)
- `base` - Fast, good accuracy (74M)
- `small` - Balanced speed/accuracy (244M)
- `medium` - Good accuracy (769M)
- `large-v3` - Best accuracy (1.5B parameters)

### Language Support
- Auto-detect language
- Specify language for better accuracy
- Support for 90+ languages

## API Endpoints

- `GET /` - Home page
- `GET /record` - Live recording interface
- `GET /upload` - File upload interface
- `POST /transcribe_file` - Process uploaded files
- `WebSocket /socket.io` - Real-time communication

## Architecture

```
whisperflow/
├── app.py                 # Flask backend
├── requirements.txt       # Dependencies
├── templates/
│   ├── home.html         # Home page
│   ├── record.html       # Recording interface
│   └── upload.html       # Upload interface
├── static/
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       ├── record.js     # Recording logic
│       └── upload.js     # Upload logic
└── temp/                 # Temporary files
```

## Troubleshooting

**No audio input?**
- Check microphone permissions in browser
- Ensure microphone is connected and working

**Slow transcription?**
- Use a smaller model for faster results
- Enable GPU acceleration
- Check CUDA installation

**File upload fails?**
- Check file format is supported
- Ensure file size is under 1GB
- Check available disk space

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for the speech recognition model
- Built with Flask and modern web technologies

---

**Note**: This application works with all languages and accents supported by Whisper. For best results, select the appropriate model size based on your hardware capabilities.
