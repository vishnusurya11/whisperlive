#!/usr/bin/env python3
"""
WhisperLive Web Application
Modern web-based real-time speech transcription
"""

from flask import Flask, render_template, jsonify, request, send_file
from flask_socketio import SocketIO, emit
import whisper
import torch
import numpy as np
import base64
import io
import time
import threading
import queue
from datetime import datetime
import os
import json

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'whisperlive-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Global variables
model = None
model_loading = False
transcription_queue = queue.Queue()
clients = {}

# Configuration
MODEL_SIZE = "large-v3"  # Best accuracy for Indian accents (requires ~10GB VRAM)
SAMPLE_RATE = 16000

class TranscriptionProcessor:
    def __init__(self):
        self.is_running = True
        self.thread = threading.Thread(target=self._process_loop)
        self.thread.daemon = True
        self.thread.start()
        
    def _process_loop(self):
        while self.is_running:
            try:
                # Get audio data from queue
                client_id, audio_file_path = transcription_queue.get(timeout=0.1)
                
                if model is None:
                    continue
                
                print(f"Processing audio file: {audio_file_path}")
                
                # Transcribe
                start_time = time.time()
                result = model.transcribe(
                    audio_file_path,
                    language="en",
                    task="transcribe",
                    fp16=(torch.cuda.is_available()),
                    initial_prompt="This is a speech transcription in Indian English."
                )
                
                processing_time = time.time() - start_time
                
                # Send result back to client
                if result['text'].strip():
                    socketio.emit('transcription', {
                        'text': result['text'].strip(),
                        'timestamp': time.time(),
                        'processing_time': processing_time,
                        'language': result.get('language', 'en')
                    }, room=client_id)
                    print(f"Transcribed: {result['text'].strip()}")
                
                # Clean up temp file
                try:
                    os.remove(audio_file_path)
                except:
                    pass
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Transcription error: {e}")
                import traceback
                print(traceback.format_exc())
                if 'client_id' in locals() and client_id in clients:
                    socketio.emit('error', {'message': str(e)}, room=client_id)

# Initialize processor
processor = TranscriptionProcessor()

@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@app.route('/status')
def status():
    """Get server status"""
    return jsonify({
        'model_loaded': model is not None,
        'model_loading': model_loading,
        'model_size': MODEL_SIZE,
        'gpu_available': torch.cuda.is_available(),
        'gpu_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        'available_models': ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']
    })

@app.route('/change_model', methods=['POST'])
def change_model():
    """Change the Whisper model"""
    global model, MODEL_SIZE, model_loading
    
    data = request.json
    new_model_size = data.get('model', 'small')
    
    # Validate model size
    valid_models = ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']
    if new_model_size not in valid_models:
        return jsonify({'error': 'Invalid model size'}), 400
    
    # Load new model in background
    MODEL_SIZE = new_model_size
    threading.Thread(target=load_model, daemon=True).start()
    
    return jsonify({
        'message': f'Loading {new_model_size} model...',
        'model_size': new_model_size
    })

@app.route('/test')
def test():
    """Test page for debugging"""
    return '''
    <html>
    <body>
        <h1>WhisperLive Test Page</h1>
        <p>This is a minimal test to check if recording works without buffer errors.</p>
        <button onclick="testRecord()">Test Record (3s)</button>
        <div id="status"></div>
        <script>
        async function testRecord() {
            const status = document.getElementById('status');
            status.innerHTML = 'Getting microphone...';
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                status.innerHTML = 'Got microphone! Recording...';
                
                const mediaRecorder = new MediaRecorder(stream);
                const chunks = [];
                
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = () => {
                    status.innerHTML = 'Recording complete! Size: ' + chunks.reduce((a,b) => a + b.size, 0) + ' bytes';
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                setTimeout(() => mediaRecorder.stop(), 3000);
                
            } catch (error) {
                status.innerHTML = 'ERROR: ' + error.message;
            }
        }
        </script>
    </body>
    </html>
    '''

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    client_id = request.sid
    clients[client_id] = {
        'connected_at': time.time(),
        'transcriptions': []
    }
    print(f"Client connected: {client_id}")
    
    # Send initial status
    emit('connected', {
        'client_id': client_id,
        'model_loaded': model is not None,
        'model_loading': model_loading
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    client_id = request.sid
    if client_id in clients:
        del clients[client_id]
    print(f"Client disconnected: {client_id}")

@socketio.on('audio_data')
def handle_audio_data(data):
    """Handle incoming audio data"""
    try:
        client_id = request.sid
        
        # Decode base64 audio data
        audio_bytes = base64.b64decode(data['audio'])
        
        # Get format (default to wav)
        audio_format = data.get('format', 'wav')
        
        # Save to temporary file for Whisper to process
        temp_filename = f"temp_audio_{client_id}_{int(time.time()*1000)}.{audio_format}"
        temp_path = os.path.join("temp", temp_filename)
        
        # Ensure temp directory exists
        os.makedirs("temp", exist_ok=True)
        
        # Write audio data to file
        with open(temp_path, 'wb') as f:
            f.write(audio_bytes)
        
        print(f"Received audio chunk: {len(audio_bytes)} bytes, format: {audio_format}")
        
        # Add to transcription queue
        transcription_queue.put((client_id, temp_path))
        
        # Send acknowledgment
        emit('audio_received', {'timestamp': time.time()})
        
    except Exception as e:
        print(f"Error handling audio data: {e}")
        import traceback
        print(traceback.format_exc())
        emit('error', {'message': str(e)})

@socketio.on('audio_blob')
def handle_audio_blob(data):
    """Handle complete audio recording"""
    try:
        client_id = request.sid
        
        # Decode base64 audio data
        audio_bytes = base64.b64decode(data['audio'])
        mime_type = data.get('mimeType', 'audio/webm')
        duration = data.get('duration', 0)
        
        print(f"Received audio blob: {len(audio_bytes)} bytes, type: {mime_type}, duration: {duration}s")
        
        # Determine file extension from mime type
        ext = 'webm'
        if 'wav' in mime_type:
            ext = 'wav'
        elif 'ogg' in mime_type:
            ext = 'ogg'
        elif 'mp4' in mime_type:
            ext = 'mp4'
        
        # Save to temporary file
        temp_filename = f"recording_{client_id}_{int(time.time())}.{ext}"
        temp_path = os.path.join("temp", temp_filename)
        
        # Ensure temp directory exists
        os.makedirs("temp", exist_ok=True)
        
        # Write audio data to file
        with open(temp_path, 'wb') as f:
            f.write(audio_bytes)
        
        print(f"Saved audio to: {temp_path}")
        
        # Process immediately
        if model is not None:
            print("Processing with Whisper...")
            print(f"Model type: {type(model)}")
            print(f"Using GPU: {torch.cuda.is_available()}")
            
            try:
                # Get absolute path for debugging
                abs_temp_path = os.path.abspath(temp_path)
                print(f"Processing audio file: {abs_temp_path}")
                print(f"File exists: {os.path.exists(abs_temp_path)}")
                print(f"File size: {os.path.getsize(abs_temp_path)} bytes")
                print(f"File extension: {ext}")
                
                # Always load audio ourselves to avoid ffmpeg dependency
                import numpy as np
                
                if ext == 'wav':
                    # Load WAV file using scipy (no ffmpeg needed)
                    print("Loading WAV file with scipy...")
                    import scipy.io.wavfile
                    try:
                        sample_rate, audio_data = scipy.io.wavfile.read(abs_temp_path)
                        print(f"WAV loaded: sample_rate={sample_rate}, shape={audio_data.shape}, dtype={audio_data.dtype}")
                        
                        # Convert to float32 and normalize
                        if audio_data.dtype == np.int16:
                            audio_data = audio_data.astype(np.float32) / 32768.0
                        elif audio_data.dtype == np.int32:
                            audio_data = audio_data.astype(np.float32) / 2147483648.0
                        else:
                            audio_data = audio_data.astype(np.float32)
                        
                        # Resample if needed (Whisper expects 16kHz)
                        if sample_rate != 16000:
                            print(f"Resampling from {sample_rate}Hz to 16000Hz...")
                            import scipy.signal
                            audio_data = scipy.signal.resample(audio_data, int(len(audio_data) * 16000 / sample_rate))
                        
                        print(f"Audio prepared: shape={audio_data.shape}, dtype={audio_data.dtype}, range=[{audio_data.min():.3f}, {audio_data.max():.3f}]")
                        
                    except Exception as e:
                        print(f"scipy.io.wavfile failed: {e}")
                        # Fallback to soundfile
                        import soundfile as sf
                        audio_data, sample_rate = sf.read(abs_temp_path)
                        if sample_rate != 16000:
                            import scipy.signal
                            audio_data = scipy.signal.resample(audio_data, int(len(audio_data) * 16000 / sample_rate))
                        audio_data = audio_data.astype(np.float32)
                        
                else:
                    # For non-WAV formats, use librosa
                    import librosa
                    print(f"Loading {ext} file with librosa...")
                    try:
                        audio_data, sample_rate = librosa.load(abs_temp_path, sr=16000, mono=True)
                        print(f"Audio loaded: shape={audio_data.shape}, dtype={audio_data.dtype}")
                    except Exception as e:
                        print(f"Librosa failed: {e}")
                        # Try soundfile as fallback
                        import soundfile as sf
                        audio_data, sample_rate = sf.read(abs_temp_path)
                        if sample_rate != 16000:
                            import scipy.signal
                            audio_data = scipy.signal.resample(audio_data, int(len(audio_data) * 16000 / sample_rate))
                        if len(audio_data.shape) > 1:
                            audio_data = audio_data.mean(axis=1)
                        audio_data = audio_data.astype(np.float32)
                
                # Ensure audio is properly normalized for Whisper
                if audio_data.max() > 1.0 or audio_data.min() < -1.0:
                    print(f"Normalizing audio from [{audio_data.min():.3f}, {audio_data.max():.3f}] to [-1, 1]")
                    audio_data = audio_data / np.abs(audio_data).max()
                
                # Transcribe numpy array (bypasses ffmpeg completely)
                print("Transcribing audio array with Whisper...")
                result = model.transcribe(
                    audio_data,  # numpy array, not file path!
                    language="en",
                    fp16=(torch.cuda.is_available()),
                    no_speech_threshold=0.6,  # Higher threshold to reduce hallucinations
                    compression_ratio_threshold=2.4  # Filter out repetitive text
                )
                
                transcribed_text = result['text'].strip()
                print(f"Transcription result: {transcribed_text}")
                
                # Filter out common Whisper hallucinations
                hallucinations = [
                    "thank you", "thanks for watching", "thanks", 
                    "bye", "goodbye", "see you later",
                    "♪", "[music]", "[Music]", "[MUSIC]",
                    "you", "yeah", "uh", "um"
                ]
                
                # Check if transcription is just a hallucination
                if transcribed_text.lower() in hallucinations:
                    print(f"Filtered out hallucination: {transcribed_text}")
                    transcribed_text = ""
                
                if transcribed_text:
                    socketio.emit('transcription', {
                        'text': transcribed_text,
                        'timestamp': time.time(),
                        'language': result.get('language', 'en')
                    }, room=client_id)
                else:
                    emit('error', {'message': 'No speech detected in audio'})
                
            except Exception as e:
                print(f"Transcription error: {e}")
                import traceback
                traceback.print_exc()
                emit('error', {'message': f'Transcription failed: {str(e)}'})
            
            # Clean up
            try:
                os.remove(temp_path)
            except:
                pass
        else:
            emit('error', {'message': 'Model not loaded yet'})
        
    except Exception as e:
        print(f"Error handling audio blob: {e}")
        import traceback
        traceback.print_exc()
        emit('error', {'message': str(e)})

@socketio.on('save_transcript')
def handle_save_transcript(data):
    """Save transcript to file"""
    try:
        client_id = request.sid
        transcript = data.get('transcript', '')
        
        # Create filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"transcript_{timestamp}.txt"
        filepath = os.path.join("transcripts", filename)
        
        # Ensure directory exists
        os.makedirs("transcripts", exist_ok=True)
        
        # Save file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"WhisperLive Transcript\n")
            f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("="*50 + "\n\n")
            f.write(transcript)
        
        emit('save_complete', {
            'filename': filename,
            'path': filepath
        })
        
    except Exception as e:
        print(f"Error saving transcript: {e}")
        emit('error', {'message': f"Failed to save: {str(e)}"})

def load_model():
    """Load Whisper model"""
    global model, model_loading
    
    try:
        model_loading = True
        print(f"Loading Whisper {MODEL_SIZE} model...")
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = whisper.load_model(MODEL_SIZE, device=device)
        
        print(f"Model loaded successfully on {device}")
        model_loading = False
        
        # Notify all connected clients
        socketio.emit('model_loaded', {'model_size': MODEL_SIZE})
        
    except Exception as e:
        print(f"Error loading model: {e}")
        model_loading = False
        socketio.emit('error', {'message': f"Failed to load model: {str(e)}"})

# Load model in background when server starts
threading.Thread(target=load_model, daemon=True).start()

if __name__ == '__main__':
    print("Starting WhisperLive Web Server...")
    print("Open http://localhost:5000 in your browser")
    socketio.run(app, debug=False, port=5000, host='0.0.0.0')