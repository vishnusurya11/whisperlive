// WhisperLive WAV Audio Handler - Converts to WAV before sending
class WhisperLiveWAV {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.transcriptionText = [];
        this.stream = null;
        this.chunkInterval = null;
        this.chunkDuration = 3000; // Send chunks every 3 seconds
        this.sampleRate = 16000; // Whisper expects 16kHz
        
        console.log('=== WhisperLive WAV Audio Handler v2 ===');
        console.log('This version converts audio to WAV format before sending');
        console.log('No ffmpeg required!');
        
        this.initializeElements();
        this.connectWebSocket();
        this.setupEventListeners();
        
        // Hide visualizer to avoid any issues
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
            modelStatus: document.getElementById('model-status'),
            modelSelect: document.getElementById('model'),
            deviceSelect: document.getElementById('audio-device'),
            languageSelect: document.getElementById('language')
        };
    }
    
    hideVisualizer() {
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
            this.elements.modelSelect.disabled = false;
            this.elements.modelStatus.classList.add('active');
            this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${data.model_size}`;
            this.elements.modelSelect.value = data.model_size;
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
                this.elements.modelSelect.disabled = false;
                this.elements.modelStatus.classList.add('active');
                this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${status.model_size}`;
                this.elements.modelSelect.value = status.model_size;
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
        
        // Model selection
        this.elements.modelSelect.addEventListener('change', (e) => {
            this.changeModel(e.target.value);
        });
        
        // Device enumeration and selection
        this.enumerateDevices();
        this.elements.deviceSelect.addEventListener('change', (e) => {
            this.selectedDeviceId = e.target.value;
            console.log('Selected device:', this.selectedDeviceId);
        });
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
            // Get microphone access with selected device
            const constraints = {
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            // Add device constraint if specific device selected
            if (this.selectedDeviceId && this.selectedDeviceId !== 'default') {
                constraints.audio.deviceId = { exact: this.selectedDeviceId };
            }
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log('Got media stream');
            
            // Create audio context for processing
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Create source from stream
            const source = this.audioContext.createMediaStreamSource(this.stream);
            
            // Create script processor for capturing audio
            const bufferSize = 4096;
            this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            // Collect audio samples
            this.audioBuffer = [];
            this.scriptProcessor.onaudioprocess = (e) => {
                if (this.isRecording) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    this.audioBuffer.push(...inputData);
                }
            };
            
            // Connect nodes
            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            
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
        
        // Disconnect audio nodes
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Stop all tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                console.log('Stopping track:', track.kind);
                track.stop();
            });
            this.stream = null;
        }
        
        // Clear buffer
        this.audioBuffer = [];
    }
    
    startChunkStreaming() {
        // Send chunks periodically while recording
        this.chunkInterval = setInterval(() => {
            if (this.isRecording && this.audioBuffer.length > 0) {
                console.log('Processing chunk...');
                this.processAndSendChunk();
            }
        }, this.chunkDuration);
    }
    
    stopChunkStreaming() {
        if (this.chunkInterval) {
            clearInterval(this.chunkInterval);
            this.chunkInterval = null;
        }
        
        // Process any remaining audio
        if (this.audioBuffer.length > 0) {
            console.log('Processing final chunk...');
            this.processAndSendChunk();
        }
    }
    
    processAndSendChunk() {
        if (this.audioBuffer.length === 0) {
            return;
        }
        
        // Check if audio contains actual sound (not just silence)
        const audioLevel = this.getAudioLevel(this.audioBuffer);
        console.log('Audio level:', audioLevel.toFixed(4));
        
        // Skip if audio is too quiet (likely silence)
        if (audioLevel < 0.01) {
            console.log('Skipping silent chunk');
            this.audioBuffer = [];
            return;
        }
        
        // Create WAV from audio buffer
        const wavBlob = this.createWAVBlob(this.audioBuffer);
        console.log('Created WAV blob:', wavBlob.size, 'bytes');
        
        // Clear buffer for next chunk
        this.audioBuffer = [];
        
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            console.log('Sending WAV audio to server...');
            
            // Send to server
            this.socket.emit('audio_blob', {
                audio: base64,
                mimeType: 'audio/wav',
                duration: this.chunkDuration / 1000
            });
            
            this.showToast('Processing audio...', 'info');
        };
        
        reader.readAsDataURL(wavBlob);
    }
    
    getAudioLevel(audioBuffer) {
        // Calculate RMS (Root Mean Square) level of audio
        let sum = 0;
        for (let i = 0; i < audioBuffer.length; i++) {
            sum += audioBuffer[i] * audioBuffer[i];
        }
        return Math.sqrt(sum / audioBuffer.length);
    }
    
    createWAVBlob(audioBuffer) {
        // Convert float samples to 16-bit PCM
        const length = audioBuffer.length;
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        // RIFF chunk descriptor
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        
        // fmt sub-chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, 1, true); // AudioFormat (PCM)
        view.setUint16(22, 1, true); // NumChannels
        view.setUint32(24, this.sampleRate, true); // SampleRate
        view.setUint32(28, this.sampleRate * 2, true); // ByteRate
        view.setUint16(32, 2, true); // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        
        // data sub-chunk
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert float samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
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
        this.elements.transcription.innerHTML = '<p class="placeholder">Click "Start Recording" to begin...</p>';
        this.transcriptionText = [];
        this.elements.wordCount.textContent = '0 words';
        this.elements.saveBtn.disabled = true;
    }
    
    showToast(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
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
    
    async enumerateDevices() {
        try {
            // First check if we already have permission
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasLabels = devices.some(device => device.label !== '');
            
            if (!hasLabels) {
                // Request permissions first
                const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop the stream immediately
                tempStream.getTracks().forEach(track => track.stop());
            }
            
            // Get all devices again (now with labels)
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
            
            // Clear existing options
            this.elements.deviceSelect.innerHTML = '<option value="default">Default Microphone</option>';
            
            // Add each microphone
            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${index + 1}`;
                this.elements.deviceSelect.appendChild(option);
            });
            
            console.log(`Found ${audioInputs.length} audio input devices`);
            
        } catch (error) {
            console.error('Error enumerating devices:', error);
            this.showToast('Could not access microphone list', 'error');
        }
    }
    
    async changeModel(modelSize) {
        try {
            // Disable controls during model change
            this.elements.modelSelect.disabled = true;
            this.elements.recordBtn.disabled = true;
            
            this.showToast(`Loading ${modelSize} model...`, 'info');
            
            const response = await fetch('/change_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: modelSize })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast(data.message, 'info');
                // Model will load in background, status updates via WebSocket
            } else {
                this.showToast(data.error || 'Failed to change model', 'error');
                // Revert selection
                const currentModel = this.elements.modelStatus.querySelector('.status-text').textContent.split(': ')[1];
                this.elements.modelSelect.value = currentModel;
            }
            
        } catch (error) {
            console.error('Error changing model:', error);
            this.showToast('Failed to change model', 'error');
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing WhisperLive WAV...');
    const app = new WhisperLiveWAV();
});