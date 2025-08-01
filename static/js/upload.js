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

        const supportedFormats = [
            // Audio formats
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
            'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/ogg', 'audio/webm',
            'audio/x-ms-wma',
            // Video formats
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
            'video/x-matroska', 'video/webm'
        ];

        // Check file extension if MIME type is not recognized
        const extension = file.name.split('.').pop().toLowerCase();
        const supportedExtensions = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'wma', 'mp4', 'avi', 'mov', 'mkv', 'webm'];
        
        if (!supportedFormats.includes(file.type) && !supportedExtensions.includes(extension)) {
            this.showToast('Unsupported file format.', 'error');
            return;
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

        // Prepare form data
        const formData = new FormData();
        formData.append('file', this.selectedFile);
        formData.append('model', this.elements.modelSelect.value);
        formData.append('language', this.elements.languageSelect.value);

        // Show progress
        this.elements.progressContainer.style.display = 'block';
        this.elements.transcribeBtn.disabled = true;
        this.elements.progressStatus.textContent = 'Uploading file...';

        try {
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