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
        document.getElementById('editItem').addEventListener('click', () => this.editDescriptionFromContext());
        document.getElementById('downloadItem').addEventListener('click', () => this.downloadImage());
        document.getElementById('deleteRowItem').addEventListener('click', () => this.deleteRowFromContext());
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
                    <td colspan="6" class="text-center py-8 text-gray-500">
                        <i class="fas fa-image text-3xl mb-2"></i>
                        <p>No images uploaded yet. Upload some images to get started!</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = images.map((image, index) => `
            <tr data-row-id="${image.id}">
                <td class="text-center font-medium">${index + 1}</td>
                <td class="image-cell">
                    <img src="/api/images/${image.id}/file" 
                         alt="${image.original_name}"
                         title="${image.original_name}"
                         data-image-id="${image.id}"
                         class="hover:scale-105 transition-transform">
                </td>
                <td class="description-cell" data-image-id="${image.id}">
                    <textarea data-image-id="${image.id}" 
                              data-original-value="${this.escapeHtml(image.description || '')}"
                              placeholder="Enter description..."
                              onkeydown="imageManager.handleTextareaKeydown(event, ${image.id})"
                              onfocus="imageManager.startEditing(${image.id})"
                              onblur="imageManager.saveDescription(${image.id}, this)">${image.description || ''}</textarea>
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
                <td class="action-buttons">
                    <button class="action-btn edit" onclick="imageManager.editDescription(${image.id})" title="Edit Description">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="imageManager.deleteRow(${image.id})" title="Delete Row">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    startEditing(imageId) {
        const cell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        if (cell) {
            cell.classList.add('editing');
            cell.classList.remove('saving', 'error');
        }
    }

    handleTextareaKeydown(event, imageId) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            // Ctrl/Cmd + Enter to save
            event.preventDefault();
            const textarea = event.target;
            this.saveDescription(imageId, textarea);
            textarea.blur();
        } else if (event.key === 'Escape') {
            // Escape to cancel
            event.preventDefault();
            const textarea = event.target;
            const originalValue = textarea.dataset.originalValue || '';
            textarea.value = originalValue;
            this.cancelEditing(imageId);
            textarea.blur();
        }
    }

    async saveDescription(imageId, textarea) {
        const cell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const description = textarea.value.trim();
        
        try {
            cell.classList.remove('editing');
            cell.classList.add('saving');
            
            const response = await axios.put(`/api/images/${imageId}`, {
                description: description
            });

            if (response.data.success) {
                // Update the original value for future cancellations
                textarea.dataset.originalValue = this.escapeHtml(description);
                cell.classList.remove('saving');
                
                // Show brief success feedback
                setTimeout(() => {
                    cell.classList.remove('saving');
                }, 500);
            } else {
                throw new Error(response.data.error || 'Failed to update');
            }
        } catch (error) {
            console.error('Update description error:', error);
            cell.classList.remove('saving');
            cell.classList.add('error');
            
            // Reset to original value on error
            const originalValue = textarea.dataset.originalValue || '';
            textarea.value = originalValue;
            
            this.showMessage('Failed to update description. Changes reverted.', 'error');
            
            // Remove error state after 3 seconds
            setTimeout(() => {
                cell.classList.remove('error');
            }, 3000);
        }
    }

    cancelEditing(imageId) {
        const cell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        if (cell) {
            cell.classList.remove('editing', 'saving', 'error');
        }
    }

    editDescription(imageId) {
        const textarea = document.querySelector(`textarea[data-image-id="${imageId}"]`);
        if (textarea) {
            textarea.focus();
            textarea.select();
        }
    }

    async deleteRow(imageId) {
        if (!confirm('⚠️ Delete entire row?\n\nThis will permanently delete both the image and its description. This action cannot be undone.\n\nAre you sure you want to continue?')) {
            return;
        }

        const row = document.querySelector(`tr[data-row-id="${imageId}"]`);
        
        try {
            // Add visual feedback
            if (row) {
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
            }

            const response = await axios.delete(`/api/images/${imageId}`);
            
            if (response.data.success) {
                this.showMessage('Row deleted successfully', 'success');
                // Remove row with animation
                if (row) {
                    row.style.transition = 'all 0.3s ease';
                    row.style.transform = 'translateX(-100%)';
                    row.style.opacity = '0';
                    
                    setTimeout(() => {
                        this.loadImages(); // Reload table to renumber rows
                    }, 300);
                }
            } else {
                throw new Error(response.data.error || 'Failed to delete');
            }
        } catch (error) {
            console.error('Delete row error:', error);
            
            // Restore row visual state on error
            if (row) {
                row.style.opacity = '1';
                row.style.pointerEvents = 'auto';
            }
            
            this.showMessage('Failed to delete row. Please try again.', 'error');
        }
    }

    // Legacy method for backward compatibility
    async updateDescription(imageId, description) {
        const textarea = document.querySelector(`textarea[data-image-id="${imageId}"]`);
        if (textarea) {
            await this.saveDescription(imageId, textarea);
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

    editDescriptionFromContext() {
        if (this.contextMenuTarget) {
            this.editDescription(this.contextMenuTarget);
        }
        this.hideContextMenu();
    }

    downloadImage() {
        if (this.contextMenuTarget) {
            window.open(`/api/images/${this.contextMenuTarget}/download`, '_blank');
        }
        this.hideContextMenu();
    }

    async deleteRowFromContext() {
        if (this.contextMenuTarget) {
            await this.deleteRow(this.contextMenuTarget);
        }
        this.hideContextMenu();
    }

    // Legacy method - kept for backward compatibility
    async deleteImage() {
        if (this.contextMenuTarget) {
            await this.deleteRow(this.contextMenuTarget);
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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