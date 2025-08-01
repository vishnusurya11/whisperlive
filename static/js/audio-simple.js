// WhisperLive Simple Audio Handler - Using MediaRecorder
class WhisperLiveSimple {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.transcriptionText = [];
        this.startTime = null;
        this.wordCount = 0;
        this.recordingDuration = 10; // Record for 10 seconds at a time
        
        this.initializeElements();
        this.connectWebSocket();
        this.setupEventListeners();
    }
    
    initializeElements() {
        this.elements = {
            recordBtn: document.getElementById('record-btn'),
            saveBtn: document.getElementById('save-btn'),
            clearBtn: document.getElementById('clear-btn'),
            transcription: document.getElementById('transcription'),
            wordCount: document.getElementById('word-count'),
            duration: document.getElementById('duration'),
            visualizer: document.getElementById('visualizer'),
            levelBar: document.getElementById('level-bar'),
            loadingOverlay: document.getElementById('loading-overlay'),
            gpuStatus: document.getElementById('gpu-status'),
            modelStatus: document.getElementById('model-status'),
            language: document.getElementById('language')
        };
        
        this.canvasContext = this.elements.visualizer.getContext('2d');
    }
    
    connectWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.showToast('Connected to server', 'success');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showToast('Disconnected from server', 'error');
            this.stopRecording();
        });
        
        this.socket.on('model_loaded', (data) => {
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.recordBtn.disabled = false;
            this.elements.modelStatus.classList.add('active');
            this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${data.model_size}`;
            this.showToast('Model loaded successfully!', 'success');
        });
        
        this.socket.on('transcription', (data) => {
            console.log('Received transcription:', data);
            this.addTranscription(data);
        });
        
        this.socket.on('error', (data) => {
            console.error('Server error:', data);
            this.showToast(data.message, 'error');
        });
        
        // Check initial status
        this.checkServerStatus();
    }
    
    async checkServerStatus() {
        try {
            const response = await fetch('/status');
            const status = await response.json();
            
            if (status.gpu_available) {
                this.elements.gpuStatus.classList.add('active');
                this.elements.gpuStatus.querySelector('.status-text').textContent = status.gpu_name;
            } else {
                this.elements.gpuStatus.querySelector('.status-text').textContent = 'CPU Mode';
            }
            
            if (status.model_loaded) {
                this.elements.loadingOverlay.classList.add('hidden');
                this.elements.recordBtn.disabled = false;
                this.elements.modelStatus.classList.add('active');
                this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${status.model_size}`;
            }
        } catch (error) {
            console.error('Failed to check server status:', error);
        }
    }
    
    setupEventListeners() {
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveTranscript());
        this.elements.clearBtn.addEventListener('click', () => this.clearTranscript());
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Create audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            this.analyser.fftSize = 256;
            
            // Setup MediaRecorder
            const mimeType = this.getSupportedMimeType();
            console.log('Using MIME type:', mimeType);
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('Audio chunk received:', event.data.size, 'bytes');
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                console.log('MediaRecorder stopped, processing audio...');
                await this.processRecording();
            };
            
            this.mediaRecorder.onerror = (error) => {
                console.error('MediaRecorder error:', error);
                this.showToast('Recording error: ' + error.message, 'error');
            };
            
            // Start recording
            this.isRecording = true;
            this.startTime = Date.now();
            this.updateRecordButton();
            
            // Clear placeholder
            if (this.transcriptionText.length === 0) {
                this.elements.transcription.innerHTML = '';
            }
            
            this.mediaRecorder.start();
            this.startVisualization();
            this.startDurationTimer();
            
            this.showToast(`Recording started (${this.recordingDuration}s duration)`, 'success');
            
            // Auto-stop after duration
            setTimeout(() => {
                if (this.isRecording) {
                    this.showToast('Processing audio...', 'info');
                    this.stopRecording();
                }
            }, this.recordingDuration * 1000);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showToast('Failed to access microphone: ' + error.message, 'error');
            this.isRecording = false;
            this.updateRecordButton();
        }
    }
    
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/wav'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        
        return 'audio/webm'; // Default fallback
    }
    
    stopRecording() {
        this.isRecording = false;
        this.updateRecordButton();
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.stopVisualization();
    }
    
    async processRecording() {
        if (this.audioChunks.length === 0) {
            console.log('No audio chunks to process');
            return;
        }
        
        // Create blob from chunks
        const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder.mimeType || 'audio/webm' 
        });
        
        console.log('Audio blob created:', audioBlob.size, 'bytes, type:', audioBlob.type);
        
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            
            // Send to server
            console.log('Sending audio to server...');
            this.socket.emit('audio_blob', {
                audio: base64Audio,
                mimeType: audioBlob.type,
                duration: this.recordingDuration
            });
            
            this.showToast('Audio sent for transcription...', 'info');
        };
        
        reader.readAsDataURL(audioBlob);
        
        // Clear chunks
        this.audioChunks = [];
    }
    
    updateRecordButton() {
        if (this.isRecording) {
            this.elements.recordBtn.classList.add('recording');
            this.elements.recordBtn.innerHTML = '<i class="fas fa-stop"></i><span>Recording...</span>';
        } else {
            this.elements.recordBtn.classList.remove('recording');
            this.elements.recordBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Start Recording</span>';
        }
    }
    
    addTranscription(data) {
        const segment = document.createElement('div');
        segment.className = 'transcription-segment';
        
        const time = new Date(data.timestamp * 1000).toLocaleTimeString();
        segment.innerHTML = `
            <div class="transcription-time">${time}</div>
            <div class="transcription-text">${data.text}</div>
        `;
        
        this.elements.transcription.appendChild(segment);
        this.elements.transcription.scrollTop = this.elements.transcription.scrollHeight;
        
        // Update stats
        this.transcriptionText.push(data.text);
        this.wordCount += data.text.split(' ').filter(w => w.length > 0).length;
        this.elements.wordCount.textContent = `${this.wordCount} words`;
        this.elements.saveBtn.disabled = false;
        
        this.showToast('Transcription received!', 'success');
    }
    
    startVisualization() {
        if (!this.analyser) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            this.canvasContext.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.canvasContext.fillRect(0, 0, this.elements.visualizer.width, this.elements.visualizer.height);
            
            // Draw frequency bars
            const barWidth = (this.elements.visualizer.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * this.elements.visualizer.height;
                
                const gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.elements.visualizer.height);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(1, '#10b981');
                
                this.canvasContext.fillStyle = gradient;
                this.canvasContext.fillRect(x, this.elements.visualizer.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
            
            // Update audio level
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            this.elements.levelBar.style.width = `${(average / 255) * 100}%`;
        };
        
        draw();
    }
    
    stopVisualization() {
        // Clear visualization
        this.canvasContext.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.canvasContext.fillRect(0, 0, this.elements.visualizer.width, this.elements.visualizer.height);
        this.elements.levelBar.style.width = '0%';
    }
    
    startDurationTimer() {
        const updateDuration = () => {
            if (!this.isRecording) return;
            
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const remaining = Math.max(0, this.recordingDuration - elapsed);
            const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
            const seconds = (remaining % 60).toString().padStart(2, '0');
            this.elements.duration.textContent = `${minutes}:${seconds}`;
            
            if (remaining > 0) {
                setTimeout(updateDuration, 1000);
            }
        };
        
        updateDuration();
    }
    
    saveTranscript() {
        const transcript = this.transcriptionText.join('\n\n');
        this.socket.emit('save_transcript', { transcript });
        
        this.socket.once('save_complete', (data) => {
            this.showToast(`Transcript saved: ${data.filename}`, 'success');
        });
    }
    
    clearTranscript() {
        this.elements.transcription.innerHTML = '<p class="placeholder">Click "Start Recording" to begin transcribing...</p>';
        this.transcriptionText = [];
        this.wordCount = 0;
        this.elements.wordCount.textContent = '0 words';
        this.elements.saveBtn.disabled = true;
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WhisperLiveSimple();
});