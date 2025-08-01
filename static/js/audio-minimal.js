// WhisperLive Minimal Audio - No processing, just recording
class WhisperLiveMinimal {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.transcriptionText = [];
        this.stream = null;
        this.chunkInterval = null;
        this.chunkDuration = 3000; // Send chunks every 3 seconds
        
        console.log('WhisperLive Minimal - Starting...');
        
        this.initializeElements();
        this.connectWebSocket();
        this.setupEventListeners();
        
        // Disable visualizer completely
        this.hideVisualizer();
    }
    
    initializeElements() {
        this.elements = {
            recordBtn: document.getElementById('record-btn'),
            saveBtn: document.getElementById('save-btn'),
            clearBtn: document.getElementById('clear-btn'),
            transcription: document.getElementById('transcription'),
            wordCount: document.getElementById('word-count'),
            duration: document.getElementById('duration'),
            loadingOverlay: document.getElementById('loading-overlay'),
            gpuStatus: document.getElementById('gpu-status'),
            modelStatus: document.getElementById('model-status')
        };
    }
    
    hideVisualizer() {
        // Hide visualizer to avoid any audio processing
        const vizContainer = document.querySelector('.visualizer-container');
        if (vizContainer) {
            vizContainer.style.display = 'none';
        }
    }
    
    connectWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.showToast('Connected to server', 'success');
        });
        
        this.socket.on('model_loaded', (data) => {
            console.log('Model loaded:', data);
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.recordBtn.disabled = false;
            this.elements.modelStatus.classList.add('active');
            this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${data.model_size}`;
            this.showToast('Model loaded!', 'success');
        });
        
        this.socket.on('transcription', (data) => {
            console.log('Received transcription:', data);
            this.addTranscription(data);
        });
        
        this.socket.on('error', (data) => {
            console.error('Server error:', data);
            this.showToast(data.message, 'error');
        });
        
        this.checkServerStatus();
    }
    
    async checkServerStatus() {
        try {
            const response = await fetch('/status');
            const status = await response.json();
            console.log('Server status:', status);
            
            if (status.gpu_available) {
                this.elements.gpuStatus.classList.add('active');
                this.elements.gpuStatus.querySelector('.status-text').textContent = status.gpu_name;
            }
            
            if (status.model_loaded) {
                this.elements.loadingOverlay.classList.add('hidden');
                this.elements.recordBtn.disabled = false;
                this.elements.modelStatus.classList.add('active');
                this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${status.model_size}`;
            }
        } catch (error) {
            console.error('Status check failed:', error);
        }
    }
    
    setupEventListeners() {
        this.elements.recordBtn.addEventListener('click', () => {
            console.log('Record button clicked');
            this.toggleRecording();
        });
        
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
        console.log('Starting recording...');
        
        try {
            // Get microphone - MINIMAL settings
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true  // Just basic audio, no constraints
            });
            
            console.log('Got media stream');
            
            // Create MediaRecorder - let browser choose format
            this.mediaRecorder = new MediaRecorder(this.stream);
            console.log('MediaRecorder created, mimeType:', this.mediaRecorder.mimeType);
            
            this.audioChunks = [];
            
            // Setup event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                console.log('Recording stopped, processing...');
                this.processRecording();
            };
            
            this.mediaRecorder.onerror = (error) => {
                console.error('MediaRecorder error:', error);
                this.showToast('Recording error!', 'error');
            };
            
            // Start recording with timeslice to get data periodically
            this.mediaRecorder.start(100); // Get data every 100ms
            this.isRecording = true;
            this.updateRecordButton();
            
            // Clear placeholder
            if (this.transcriptionText.length === 0) {
                this.elements.transcription.innerHTML = '';
            }
            
            this.showToast('Recording started...', 'info');
            
            // Start sending chunks periodically
            this.startChunkStreaming();
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showToast('Microphone error: ' + error.message, 'error');
        }
    }
    
    stopRecording() {
        console.log('Stopping recording...');
        
        this.isRecording = false;
        this.updateRecordButton();
        
        // Stop chunk streaming
        this.stopChunkStreaming();
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                console.log('Stopping track:', track.kind);
                track.stop();
            });
            this.stream = null;
        }
    }
    
    async processRecording() {
        console.log('Processing recording, chunks:', this.audioChunks.length);
        
        if (this.audioChunks.length === 0) {
            console.log('No audio data');
            return;
        }
        
        // Create blob
        const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder.mimeType 
        });
        
        console.log('Created blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
        
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            console.log('Sending audio to server...');
            
            // Send to server
            this.socket.emit('audio_blob', {
                audio: base64,
                mimeType: audioBlob.type,
                duration: this.chunkDuration / 1000
            });
            
            this.showToast('Processing audio...', 'info');
        };
        
        reader.readAsDataURL(audioBlob);
        this.audioChunks = [];
    }
    
    startChunkStreaming() {
        // Send chunks periodically while recording
        this.chunkInterval = setInterval(() => {
            if (this.isRecording && this.audioChunks.length > 0) {
                console.log('Sending chunk...');
                this.processRecording();
            }
        }, this.chunkDuration);
    }
    
    stopChunkStreaming() {
        if (this.chunkInterval) {
            clearInterval(this.chunkInterval);
            this.chunkInterval = null;
        }
        
        // Process any remaining chunks
        if (this.audioChunks.length > 0) {
            console.log('Processing final chunks...');
            this.processRecording();
        }
    }
    
    updateRecordButton() {
        if (this.isRecording) {
            this.elements.recordBtn.classList.add('recording');
            this.elements.recordBtn.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
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
        
        this.transcriptionText.push(data.text);
        const words = data.text.split(' ').filter(w => w.length > 0).length;
        const currentWords = parseInt(this.elements.wordCount.textContent) || 0;
        this.elements.wordCount.textContent = `${currentWords + words} words`;
        
        this.elements.saveBtn.disabled = false;
        this.showToast('Transcription complete!', 'success');
    }
    
    saveTranscript() {
        const transcript = this.transcriptionText.join('\n\n');
        this.socket.emit('save_transcript', { transcript });
        
        this.socket.once('save_complete', (data) => {
            this.showToast(`Saved: ${data.filename}`, 'success');
        });
    }
    
    clearTranscript() {
        this.elements.transcription.innerHTML = '<p class="placeholder">Click "Record" to begin...</p>';
        this.transcriptionText = [];
        this.elements.wordCount.textContent = '0 words';
        this.elements.saveBtn.disabled = true;
    }
    
    showToast(message, type = 'info') {
        // Simple console log instead of toast for minimal version
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Also show in UI
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : 'info'}-circle"></i>
            <span>${message}</span>
        `;
        
        const container = document.getElementById('toast-container');
        if (container) {
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing WhisperLive Minimal...');
    const app = new WhisperLiveMinimal();
});