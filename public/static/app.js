// Image Chart Manager - Frontend JavaScript
class ImageChartManager {
    constructor() {
        this.selectedFiles = [];
        this.contextMenuTarget = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadImages();
    }

    setupEventListeners() {
        // File upload area
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files);
        });

        // Upload and clear buttons
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadFiles());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearFiles());
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadImages());

        // Context menu
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', () => this.hideContextMenu());
        document.getElementById('downloadItem').addEventListener('click', () => this.downloadImage());
        document.getElementById('deleteItem').addEventListener('click', () => this.deleteImage());
    }

    handleFileSelect(files) {
        const validFiles = Array.from(files).filter(file => {
            return file.type.startsWith('image/') && file.size > 0;
        });

        if (validFiles.length === 0) {
            this.showMessage('Please select valid image files.', 'error');
            return;
        }

        this.selectedFiles = [...this.selectedFiles, ...validFiles];
        this.updateFilePreview();
        this.showFilePreview();
    }

    updateFilePreview() {
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';

        this.selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            
            // Create thumbnail
            const reader = new FileReader();
            reader.onload = (e) => {
                item.innerHTML = `
                    <div class="file-preview-info">
                        <img src="${e.target.result}" alt="Preview" class="file-preview-thumbnail">
                        <div class="file-preview-details">
                            <div class="file-preview-name">${file.name}</div>
                            <div class="file-preview-size">${this.formatFileSize(file.size)}</div>
                            <textarea class="description-input" placeholder="Enter description for this image..." data-index="${index}"></textarea>
                        </div>
                    </div>
                    <button class="remove-file-btn" data-index="${index}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            };
            reader.readAsDataURL(file);

            container.appendChild(item);
        });

        // Add event listeners for remove buttons
        setTimeout(() => {
            container.querySelectorAll('.remove-file-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('button').dataset.index);
                    this.removeFile(index);
                });
            });
        }, 100);
    }

    showFilePreview() {
        document.getElementById('filePreview').classList.remove('hidden');
    }

    hideFilePreview() {
        document.getElementById('filePreview').classList.add('hidden');
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        if (this.selectedFiles.length === 0) {
            this.clearFiles();
        } else {
            this.updateFilePreview();
        }
    }

    clearFiles() {
        this.selectedFiles = [];
        this.hideFilePreview();
        document.getElementById('fileInput').value = '';
    }

    async uploadFiles() {
        if (this.selectedFiles.length === 0) {
            this.showMessage('Please select files to upload.', 'error');
            return;
        }

        const formData = new FormData();
        const descriptions = [];

        // Add files and collect descriptions
        this.selectedFiles.forEach((file, index) => {
            formData.append('images', file);
            const descInput = document.querySelector(`textarea[data-index="${index}"]`);
            descriptions.push(descInput ? descInput.value.trim() : '');
        });

        // Add descriptions
        descriptions.forEach(desc => {
            formData.append('descriptions', desc);
        });

        try {
            this.showProgress(true);
            const response = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    this.updateProgress(percentCompleted);
                }
            });

            if (response.data.success) {
                this.showMessage(`Successfully uploaded ${response.data.data.length} image(s)!`, 'success');
                this.clearFiles();
                this.loadImages();
            } else {
                this.showMessage(response.data.error || 'Upload failed', 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showMessage('Failed to upload images. Please try again.', 'error');
        } finally {
            this.showProgress(false);
        }
    }

    showProgress(show) {
        const progressDiv = document.getElementById('uploadProgress');
        const uploadArea = document.getElementById('uploadArea');
        
        if (show) {
            progressDiv.classList.remove('hidden');
            uploadArea.classList.add('processing');
        } else {
            progressDiv.classList.add('hidden');
            uploadArea.classList.remove('processing');
        }
    }

    updateProgress(percent) {
        document.getElementById('progressBar').style.width = `${percent}%`;
    }

    async loadImages() {
        try {
            const response = await axios.get('/api/images');
            if (response.data.success) {
                this.renderImageTable(response.data.data);
            } else {
                this.showMessage('Failed to load images', 'error');
            }
        } catch (error) {
            console.error('Load images error:', error);
            this.showMessage('Failed to load images', 'error');
        }
    }

    renderImageTable(images) {
        const tbody = document.getElementById('imageTableBody');
        
        if (images.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-gray-500">
                        <i class="fas fa-image text-3xl mb-2"></i>
                        <p>No images uploaded yet. Upload some images to get started!</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = images.map((image, index) => `
            <tr>
                <td class="text-center font-medium">${index + 1}</td>
                <td class="image-cell">
                    <img src="/api/images/${image.id}/file" 
                         alt="${image.original_name}"
                         title="${image.original_name}"
                         data-image-id="${image.id}"
                         class="hover:scale-105 transition-transform">
                </td>
                <td class="description-cell">
                    <textarea onblur="imageManager.updateDescription(${image.id}, this.value)"
                              placeholder="Enter description...">${image.description || ''}</textarea>
                </td>
                <td class="text-sm">
                    <div class="space-y-1">
                        <div><strong>Size:</strong> ${this.formatFileSize(image.file_size)}</div>
                        <div><strong>Type:</strong> ${image.mime_type}</div>
                        <div><strong>Original:</strong> ${this.truncateString(image.original_name, 15)}</div>
                    </div>
                </td>
                <td class="text-sm">
                    ${new Date(image.upload_date).toLocaleString()}
                </td>
            </tr>
        `).join('');
    }

    async updateDescription(imageId, description) {
        try {
            const response = await axios.put(`/api/images/${imageId}`, {
                description: description.trim()
            });

            if (!response.data.success) {
                this.showMessage('Failed to update description', 'error');
            }
        } catch (error) {
            console.error('Update description error:', error);
            this.showMessage('Failed to update description', 'error');
        }
    }

    handleContextMenu(e) {
        // Check if right-clicked on an image
        const img = e.target.closest('img[data-image-id]');
        if (!img) {
            this.hideContextMenu();
            return;
        }

        e.preventDefault();
        this.contextMenuTarget = img.dataset.imageId;
        
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;

        // Ensure menu stays within viewport
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${e.pageX - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${e.pageY - rect.height}px`;
        }
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
        this.contextMenuTarget = null;
    }

    downloadImage() {
        if (this.contextMenuTarget) {
            window.open(`/api/images/${this.contextMenuTarget}/download`, '_blank');
        }
        this.hideContextMenu();
    }

    async deleteImage() {
        if (!this.contextMenuTarget) {
            this.hideContextMenu();
            return;
        }

        if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
            this.hideContextMenu();
            return;
        }

        try {
            const response = await axios.delete(`/api/images/${this.contextMenuTarget}`);
            if (response.data.success) {
                this.showMessage('Image deleted successfully', 'success');
                this.loadImages();
            } else {
                this.showMessage(response.data.error || 'Failed to delete image', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showMessage('Failed to delete image', 'error');
        }
        this.hideContextMenu();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    truncateString(str, length) {
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    showMessage(message, type = 'info') {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} mr-2"></i>
            ${message}
        `;

        // Insert after the title
        const title = document.querySelector('h1');
        title.parentNode.insertBefore(messageDiv, title.nextSibling);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}

// Initialize the application
const imageManager = new ImageChartManager();

// Expose updateDescription method globally for inline textarea onblur events
window.imageManager = imageManager;