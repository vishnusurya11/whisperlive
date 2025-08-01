// WhisperLive Audio Handler
class WhisperLive {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRecording = false;
        this.transcriptionText = [];
        this.startTime = null;
        this.wordCount = 0;
        
        this.initializeElements();
        this.connectWebSocket();
        this.setupEventListeners();
        this.initializeAudioVisualization();
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
        });
        
        this.socket.on('model_loaded', (data) => {
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.recordBtn.disabled = false;
            this.elements.modelStatus.classList.add('active');
            this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${data.model_size}`;
            this.showToast('Model loaded successfully!', 'success');
        });
        
        this.socket.on('transcription', (data) => {
            this.addTranscription(data);
        });
        
        this.socket.on('error', (data) => {
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.updateRecordButton();
            
            // Clear placeholder
            if (this.transcriptionText.length === 0) {
                this.elements.transcription.innerHTML = '';
            }
            
            // Setup audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            this.analyser.fftSize = 2048;
            
            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const audioData = await this.processAudioData(event.data);
                    this.socket.emit('audio_data', { audio: audioData });
                }
            };
            
            this.mediaRecorder.start(1000); // Send chunks every second
            this.startVisualization();
            this.startDurationTimer();
            
            this.showToast('Recording started', 'success');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showToast('Failed to access microphone', 'error');
        }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.updateRecordButton();
        
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.stopVisualization();
        this.showToast('Recording stopped', 'success');
    }
    
    async processAudioData(blob) {
        // Convert blob to base64 directly
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Extract base64 data from data URL
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    updateRecordButton() {
        if (this.isRecording) {
            this.elements.recordBtn.classList.add('recording');
            this.elements.recordBtn.innerHTML = '<i class="fas fa-stop"></i><span>Stop Recording</span>';
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
        this.wordCount += data.text.split(' ').length;
        this.elements.wordCount.textContent = `${this.wordCount} words`;
        this.elements.saveBtn.disabled = false;
    }
    
    initializeAudioVisualization() {
        this.visualizationData = new Uint8Array(128);
    }
    
    startVisualization() {
        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);
            
            if (this.analyser) {
                this.analyser.getByteFrequencyData(this.visualizationData);
                
                // Clear canvas
                this.canvasContext.fillStyle = 'rgba(0, 0, 0, 0.3)';
                this.canvasContext.fillRect(0, 0, this.elements.visualizer.width, this.elements.visualizer.height);
                
                // Draw frequency bars
                const barWidth = (this.elements.visualizer.width / this.visualizationData.length) * 2.5;
                let x = 0;
                
                for (let i = 0; i < this.visualizationData.length; i++) {
                    const barHeight = (this.visualizationData[i] / 255) * this.elements.visualizer.height;
                    
                    const gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.elements.visualizer.height);
                    gradient.addColorStop(0, '#6366f1');
                    gradient.addColorStop(1, '#10b981');
                    
                    this.canvasContext.fillStyle = gradient;
                    this.canvasContext.fillRect(x, this.elements.visualizer.height - barHeight, barWidth, barHeight);
                    
                    x += barWidth + 1;
                }
                
                // Update audio level
                const average = this.visualizationData.reduce((a, b) => a + b) / this.visualizationData.length;
                this.elements.levelBar.style.width = `${(average / 255) * 100}%`;
            }
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
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.elements.duration.textContent = `${minutes}:${seconds}`;
            
            setTimeout(updateDuration, 1000);
        };
        
        updateDuration();
    }
    
    saveTranscript() {
        const transcript = this.transcriptionText.join('\n\n');
        this.socket.emit('save_transcript', { transcript });
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
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WhisperLive();
});