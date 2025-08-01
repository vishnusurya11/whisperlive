// WhisperLive PCM Audio Handler - More robust audio capture
class WhisperLivePCM {
    constructor() {
        this.socket = null;
        this.audioContext = null;
        this.microphone = null;
        this.processor = null;
        this.isRecording = false;
        this.transcriptionText = [];
        this.startTime = null;
        this.wordCount = 0;
        
        // Audio settings
        this.sampleRate = 16000;
        this.bufferSize = 4096; // Must be power of 2
        this.audioBuffer = [];
        this.chunkDuration = 2.0; // Send 2-second chunks
        
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.audioBuffer = [];
            this.updateRecordButton();
            
            // Clear placeholder
            if (this.transcriptionText.length === 0) {
                this.elements.transcription.innerHTML = '';
            }
            
            // Setup audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Create nodes
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
            
            // Setup analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Connect nodes
            this.microphone.connect(this.analyser);
            this.analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            // Process audio
            this.processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                // Copy data to avoid buffer reuse issues
                const audioData = new Float32Array(inputData);
                this.audioBuffer.push(audioData);
                
                // Check if we have enough data for a chunk
                const totalSamples = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
                const chunkSamples = Math.floor(this.sampleRate * this.chunkDuration);
                
                if (totalSamples >= chunkSamples) {
                    this.sendAudioChunk();
                }
            };
            
            // Store stream reference for cleanup
            this.stream = stream;
            
            this.startVisualization();
            this.startDurationTimer();
            
            this.showToast('Recording started', 'success');
            console.log('Recording started with sample rate:', this.sampleRate);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showToast('Failed to access microphone: ' + error.message, 'error');
            this.isRecording = false;
            this.updateRecordButton();
        }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.updateRecordButton();
        
        // Send any remaining audio
        if (this.audioBuffer.length > 0) {
            this.sendAudioChunk();
        }
        
        // Clean up audio nodes
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
        }
        
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.stopVisualization();
        this.showToast('Recording stopped', 'success');
    }
    
    sendAudioChunk() {
        if (this.audioBuffer.length === 0) return;
        
        // Combine all buffers
        const totalLength = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
        const combinedBuffer = new Float32Array(totalLength);
        let offset = 0;
        
        for (const buffer of this.audioBuffer) {
            combinedBuffer.set(buffer, offset);
            offset += buffer.length;
        }
        
        // Clear buffer
        this.audioBuffer = [];
        
        // Convert to WAV format
        const wavData = this.encodeWAV(combinedBuffer);
        const base64 = this.arrayBufferToBase64(wavData);
        
        // Send to server
        this.socket.emit('audio_data', { 
            audio: base64,
            format: 'wav',
            sampleRate: this.sampleRate
        });
        
        console.log('Sent audio chunk:', combinedBuffer.length, 'samples');
    }
    
    encodeWAV(samples) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        // Convert float32 to int16
        const floatTo16BitPCM = (output, offset, input) => {
            for (let i = 0; i < input.length; i++, offset += 2) {
                const s = Math.max(-1, Math.min(1, input[i]));
                output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
        };
        
        // RIFF chunk descriptor
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(8, 'WAVE');
        
        // FMT sub-chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, 1, true); // AudioFormat (PCM)
        view.setUint16(22, 1, true); // NumChannels
        view.setUint32(24, this.sampleRate, true); // SampleRate
        view.setUint32(28, this.sampleRate * 2, true); // ByteRate
        view.setUint16(32, 2, true); // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        
        // Data sub-chunk
        writeString(36, 'data');
        view.setUint32(40, samples.length * 2, true);
        floatTo16BitPCM(view, 44, samples);
        
        return buffer;
    }
    
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
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
        
        this.socket.on('save_complete', (data) => {
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
    const app = new WhisperLivePCM();
});