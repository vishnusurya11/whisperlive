// WhisperFlow File Upload Handler
class FileUploadHandler {
    constructor() {
        this.selectedFile = null;
        this.initializeElements();
        this.setupEventListeners();
        this.checkServerStatus();
    }

    initializeElements() {
        this.elements = {
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            fileInfo: document.getElementById('file-info'),
            fileName: document.getElementById('file-name'),
            fileSize: document.getElementById('file-size'),
            fileIcon: document.getElementById('file-icon'),
            removeFileBtn: document.getElementById('remove-file'),
            progressContainer: document.getElementById('progress-container'),
            progressStatus: document.getElementById('progress-status'),
            progressPercent: document.getElementById('progress-percent'),
            progressFill: document.getElementById('progress-fill'),
            uploadActions: document.getElementById('upload-actions'),
            transcribeBtn: document.getElementById('transcribe-btn'),
            transcriptionContainer: document.getElementById('transcription-container'),
            transcription: document.getElementById('transcription'),
            wordCount: document.getElementById('word-count'),
            processingTime: document.getElementById('processing-time'),
            downloadBtn: document.getElementById('download-btn'),
            newFileBtn: document.getElementById('new-file-btn'),
            modelSelect: document.getElementById('model'),
            languageSelect: document.getElementById('language'),
            loadingOverlay: document.getElementById('loading-overlay'),
            gpuStatus: document.getElementById('gpu-status'),
            modelStatus: document.getElementById('model-status')
        };
    }

    setupEventListeners() {
        // File selection
        this.elements.uploadArea.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Drag and drop
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('dragover');
        });

        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('dragover');
        });

        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // File actions
        this.elements.removeFileBtn.addEventListener('click', () => {
            this.removeFile();
        });

        this.elements.transcribeBtn.addEventListener('click', () => {
            this.startTranscription();
        });

        this.elements.downloadBtn.addEventListener('click', () => {
            this.downloadTranscript();
        });

        this.elements.newFileBtn.addEventListener('click', () => {
            this.resetInterface();
        });

        // Model selection
        this.elements.modelSelect.addEventListener('change', (e) => {
            this.changeModel(e.target.value);
        });
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
                this.elements.modelStatus.classList.add('active');
                this.elements.modelStatus.querySelector('.status-text').textContent = `Model: ${status.model_size}`;
                this.elements.modelSelect.value = status.model_size;
            }
        } catch (error) {
            console.error('Status check failed:', error);
        }
    }

    handleFileSelect(file) {
        // Validate file
        const maxSize = 1024 * 1024 * 1024; // 1GB
        if (file.size > maxSize) {
            this.showToast('File too large. Maximum size is 1GB.', 'error');
            return;
        }

        // Check file extension
        const extension = file.name.split('.').pop().toLowerCase();
        const audioExtensions = ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'wma', 'webm'];
        const videoExtensions = ['mp4', 'avi', 'mov', 'mkv'];
        
        if (!audioExtensions.includes(extension) && !videoExtensions.includes(extension)) {
            this.showToast('Unsupported file format.', 'error');
            return;
        }
        
        if (videoExtensions.includes(extension)) {
            this.showToast('Note: Video files require ffmpeg to be installed', 'info');
        }

        this.selectedFile = file;
        this.displayFileInfo();
    }

    displayFileInfo() {
        // Update file icon based on type
        if (this.selectedFile.type.startsWith('video/')) {
            this.elements.fileIcon.className = 'fas fa-file-video';
        } else {
            this.elements.fileIcon.className = 'fas fa-file-audio';
        }

        // Display file details
        this.elements.fileName.textContent = this.selectedFile.name;
        this.elements.fileSize.textContent = this.formatFileSize(this.selectedFile.size);

        // Show/hide elements
        this.elements.uploadArea.style.display = 'none';
        this.elements.fileInfo.style.display = 'flex';
        this.elements.uploadActions.style.display = 'flex';
    }

    removeFile() {
        this.selectedFile = null;
        this.elements.fileInput.value = '';
        this.elements.uploadArea.style.display = 'block';
        this.elements.fileInfo.style.display = 'none';
        this.elements.uploadActions.style.display = 'none';
    }

    async startTranscription() {
        if (!this.selectedFile) return;

        // Show progress
        this.elements.progressContainer.style.display = 'block';
        this.elements.transcribeBtn.disabled = true;

        try {
            // Check if we need to convert audio
            const extension = this.selectedFile.name.split('.').pop().toLowerCase();
            const needsConversion = ['mp3', 'm4a', 'flac', 'ogg', 'wma', 'webm'].includes(extension);
            
            let fileToUpload = this.selectedFile;
            
            if (needsConversion && this.selectedFile.type.startsWith('audio/')) {
                // Convert audio to WAV
                this.elements.progressStatus.textContent = 'Converting audio to WAV format...';
                this.elements.progressPercent.textContent = '0%';
                this.elements.progressFill.style.width = '0%';
                
                try {
                    fileToUpload = await this.convertAudioToWAV(this.selectedFile);
                    this.showToast('Audio converted to WAV successfully', 'success');
                } catch (error) {
                    console.error('Audio conversion error:', error);
                    this.showToast('Failed to convert audio. Please convert to WAV manually.', 'error');
                    this.elements.transcribeBtn.disabled = false;
                    this.elements.progressContainer.style.display = 'none';
                    return;
                }
            }

            // Prepare form data
            const formData = new FormData();
            formData.append('file', fileToUpload);
            formData.append('model', this.elements.modelSelect.value);
            formData.append('language', this.elements.languageSelect.value);

            this.elements.progressStatus.textContent = 'Uploading file...';

            const response = await fetch('/transcribe_file', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        this.handleProgress(data);
                    }
                }
            }

        } catch (error) {
            console.error('Transcription error:', error);
            this.showToast('Transcription failed: ' + error.message, 'error');
            this.elements.transcribeBtn.disabled = false;
            this.elements.progressContainer.style.display = 'none';
        }
    }

    handleProgress(data) {
        if (data.status === 'processing') {
            this.elements.progressStatus.textContent = data.message;
            this.elements.progressPercent.textContent = `${data.progress}%`;
            this.elements.progressFill.style.width = `${data.progress}%`;
        } else if (data.status === 'complete') {
            this.displayTranscription(data);
        } else if (data.status === 'error') {
            this.showToast(data.message, 'error');
            this.elements.transcribeBtn.disabled = false;
            this.elements.progressContainer.style.display = 'none';
        }
    }

    displayTranscription(data) {
        // Hide progress, show transcription
        this.elements.progressContainer.style.display = 'none';
        this.elements.transcriptionContainer.style.display = 'block';

        // Display transcription
        this.elements.transcription.innerHTML = `
            <div class="transcription-text">${data.transcription.replace(/\n/g, '<br>')}</div>
        `;

        // Update stats
        const words = data.transcription.split(/\s+/).filter(w => w.length > 0).length;
        this.elements.wordCount.textContent = `${words} words`;
        this.elements.processingTime.textContent = `${data.processing_time.toFixed(1)}s`;

        // Store transcription for download
        this.currentTranscription = data.transcription;
        this.currentMetadata = {
            filename: this.selectedFile.name,
            model: data.model,
            language: data.language,
            processing_time: data.processing_time
        };

        this.showToast('Transcription complete!', 'success');
    }

    downloadTranscript() {
        if (!this.currentTranscription) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `transcript_${timestamp}.txt`;
        
        const content = `Transcription of: ${this.currentMetadata.filename}
Model: ${this.currentMetadata.model}
Language: ${this.currentMetadata.language}
Processing Time: ${this.currentMetadata.processing_time.toFixed(1)}s
Date: ${new Date().toLocaleString()}
${'='.repeat(50)}

${this.currentTranscription}`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('Transcript downloaded!', 'success');
    }

    resetInterface() {
        this.removeFile();
        this.elements.transcriptionContainer.style.display = 'none';
        this.elements.transcription.innerHTML = '<p class="placeholder">Transcription will appear here...</p>';
        this.elements.wordCount.textContent = '0 words';
        this.elements.processingTime.textContent = '0s';
        this.currentTranscription = null;
        this.currentMetadata = null;
    }

    async changeModel(modelSize) {
        try {
            this.elements.modelSelect.disabled = true;
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
            } else {
                this.showToast(data.error || 'Failed to change model', 'error');
            }
            
        } catch (error) {
            console.error('Error changing model:', error);
            this.showToast('Failed to change model', 'error');
        } finally {
            this.elements.modelSelect.disabled = false;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async convertAudioToWAV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    // Create audio context
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    
                    // Decode audio data
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Update progress
                    this.elements.progressPercent.textContent = '50%';
                    this.elements.progressFill.style.width = '50%';
                    
                    // Convert to mono and resample to 16kHz
                    const sampleRate = 16000;
                    const numberOfChannels = 1;
                    const length = Math.floor(audioBuffer.duration * sampleRate);
                    
                    // Create offline context for resampling
                    const offlineContext = new OfflineAudioContext(
                        numberOfChannels,
                        length,
                        sampleRate
                    );
                    
                    // Create buffer source
                    const source = offlineContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(offlineContext.destination);
                    source.start(0);
                    
                    // Render audio
                    const renderedBuffer = await offlineContext.startRendering();
                    
                    // Update progress
                    this.elements.progressPercent.textContent = '75%';
                    this.elements.progressFill.style.width = '75%';
                    
                    // Get audio data as Float32Array
                    const audioData = renderedBuffer.getChannelData(0);
                    
                    // Create WAV file
                    const wavBlob = this.createWAVBlob(audioData, sampleRate);
                    
                    // Create new File object with .wav extension
                    const wavFileName = file.name.replace(/\.[^/.]+$/, '') + '.wav';
                    const wavFile = new File([wavBlob], wavFileName, { type: 'audio/wav' });
                    
                    // Update progress
                    this.elements.progressPercent.textContent = '100%';
                    this.elements.progressFill.style.width = '100%';
                    
                    // Close audio context
                    audioContext.close();
                    
                    resolve(wavFile);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    createWAVBlob(audioData, sampleRate) {
        const length = audioData.length;
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // Helper function to write string
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
        view.setUint32(24, sampleRate, true); // SampleRate
        view.setUint32(28, sampleRate * 2, true); // ByteRate
        view.setUint16(32, 2, true); // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        
        // data sub-chunk
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert float samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation' : 'info'}-circle"></i>
            <span>${message}</span>
        `;
        
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const uploader = new FileUploadHandler();
});