# WhisperLive Quick Start Guide

## 🚀 Installation (2 minutes)

### Windows
```bash
# Run the installation script
install.bat
```

### Linux/Mac
```bash
# Run the installation script
chmod +x install.sh
./install.sh
```

## 🎯 First Run

1. **Activate the virtual environment:**
   ```bash
   # Windows
   .venv\Scripts\activate
   
   # Linux/Mac
   source .venv/bin/activate
   ```

2. **Test the installation:**
   ```bash
   python test_app.py
   ```

3. **Run the application:**
   ```bash
   python speech_to_text.py
   ```

## 🎙️ Using WhisperLive

1. **Start Recording**: Press `SPACE`
2. **Stop Recording**: Press `SPACE` again
3. **Save Transcript**: Press `S`
4. **Quit**: Press `Q`

## 💡 Tips

- First run downloads the Whisper model (~1.5GB)
- Speak naturally - the app handles accents well
- Transcripts auto-save every 2 minutes
- Find saved transcripts in the `transcripts/` folder

## 🔧 Troubleshooting

**No microphone detected?**
- Check microphone permissions in system settings
- Try a different USB port for external mics

**GPU not detected?**
- Install NVIDIA drivers
- Verify with: `nvidia-smi`

**Import errors?**
- Make sure virtual environment is activated
- Run: `pip install -r requirements.txt`

## 📞 Need Help?

- Check the full README.md
- Open an issue on GitHub
- Run `python test_app.py` to diagnose issues