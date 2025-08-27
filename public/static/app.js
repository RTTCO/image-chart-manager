// Image Chart Manager - Frontend JavaScript
class ImageChartManager {
    constructor() {
        this.selectedFiles = [];
        this.contextMenuTarget = null;
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.totalPages = 1;
        this.currentCategory = 'all';
        this.currentSearch = '';
        this.categories = [];
        this.selectedImages = new Set();
        this.isEditingCategory = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCategories();
        this.loadImages();
    }

    setupEventListeners() {
        // File upload area
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (uploadArea && fileInput) {
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
            document.getElementById('uploadBtn')?.addEventListener('click', () => this.uploadFiles());
            document.getElementById('clearBtn')?.addEventListener('click', () => this.clearFiles());
        }

        // Search and pagination
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.currentSearch = e.target.value;
            this.currentPage = 1;
            this.loadImages();
        });
        
        document.getElementById('viewModeSelect')?.addEventListener('change', (e) => {
            this.itemsPerPage = parseInt(e.target.value);
            this.currentPage = 1;
            this.loadImages();
        });

        // Category management
        document.getElementById('addCategoryBtn')?.addEventListener('click', () => this.showCategoryModal());
        document.getElementById('cancelCategoryBtn')?.addEventListener('click', () => this.hideCategoryModal());
        document.getElementById('categoryForm')?.addEventListener('submit', (e) => this.handleCategorySubmit(e));

        // Bulk selection
        document.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => this.handleSelectAll(e));
        document.getElementById('selectAllBtn')?.addEventListener('click', () => this.selectAllImages());
        document.getElementById('deselectAllBtn')?.addEventListener('click', () => this.deselectAllImages());
        document.getElementById('bulkDownloadBtn')?.addEventListener('click', () => this.bulkDownload());
        document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDelete());

        // Pagination
        document.getElementById('prevBtn')?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        document.getElementById('nextBtn')?.addEventListener('click', () => this.goToPage(this.currentPage + 1));

        // Context menu
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', () => this.hideContextMenu());
        document.getElementById('editItem')?.addEventListener('click', () => this.editDescriptionFromContext());
        document.getElementById('downloadItem')?.addEventListener('click', () => this.downloadImage());
        document.getElementById('deleteRowItem')?.addEventListener('click', () => this.deleteRowFromContext());
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
                            <div class="category-selection mt-2">
                                <label class="text-sm font-medium text-gray-600">Category:</label>
                                <select class="category-input w-full mt-1 text-sm p-2 border border-gray-300 rounded" data-index="${index}">
                                    ${this.renderCategoryOptions()}
                                </select>
                            </div>
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
        const categoryIds = [];

        // Compress and add files
        for (let index = 0; index < this.selectedFiles.length; index++) {
            const originalFile = this.selectedFiles[index];
            
            // Compress image if it's too large (>500KB)
            const compressedFile = originalFile.size > 500000 ? 
                await this.compressImage(originalFile, 0.7, 1200) : originalFile;
            
            formData.append('images', compressedFile);
            
            const descInput = document.querySelector(`textarea[data-index="${index}"]`);
            const categorySelect = document.querySelector(`select[data-index="${index}"]`);
            descriptions.push(descInput ? descInput.value.trim() : '');
            categoryIds.push(categorySelect ? categorySelect.value || null : null);
        }

        // Add descriptions
        descriptions.forEach(desc => {
            formData.append('descriptions', desc);
        });
        
        // Add category IDs
        categoryIds.forEach(categoryId => {
            formData.append('categoryIds', categoryId || '');
        });

        try {
            this.showProgress(true);
            this.updateProgressText('Compressing images...');
            
            // Mobile debugging - log file details
            console.log('Upload attempt:', {
                fileCount: this.selectedFiles.length,
                descriptions: descriptions,
                categoryIds: categoryIds,
                isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            });
            
            this.updateProgressText('Uploading images...');
            
            const response = await axios.post('/api/upload', formData, {
                timeout: 60000, // 60 second timeout for mobile
                // Don't set Content-Type - let browser set it automatically for FormData
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    this.updateProgress(percentCompleted);
                    console.log('Upload progress:', percentCompleted + '%');
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
            
            // Mobile-specific error messages
            let errorMessage = 'Failed to upload images. ';
            if (error.code === 'ECONNABORTED') {
                errorMessage += 'Upload timed out. Try with smaller images or better connection.';
            } else if (error.response) {
                errorMessage += `Server error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`;
            } else if (error.request) {
                errorMessage += 'Network error. Check your internet connection.';
            } else {
                errorMessage += `Error: ${error.message}`;
            }
            
            this.showMessage(errorMessage, 'error');
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

    updateProgressText(text) {
        const progressDiv = document.getElementById('uploadProgress');
        const textSpan = progressDiv.querySelector('span');
        if (textSpan) {
            textSpan.textContent = text;
        }
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
                    <td colspan="8" class="text-center py-8 text-gray-500">
                        <i class="fas fa-image text-3xl mb-2"></i>
                        <p>No images found. Try adjusting your filters or upload some images!</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = images.map((image, index) => `
            <tr data-row-id="${image.id}">
                <td class="text-center">
                    <input type="checkbox" class="image-checkbox" data-image-id="${image.id}" onchange="imageManager.updateSelection()">
                </td>
                <td class="text-center font-medium compact-info">${(this.currentPage - 1) * this.itemsPerPage + index + 1}</td>
                <td class="image-cell">
                    <img src="/api/images/${image.id}/file" 
                         alt="${image.original_name}"
                         title="${image.original_name} (${this.formatFileSize(image.file_size)})"
                         data-image-id="${image.id}">
                </td>
                <td class="description-cell" data-image-id="${image.id}">
                    <textarea data-image-id="${image.id}" 
                              data-original-value="${this.escapeHtml(image.description || '')}"
                              placeholder="Enter description..."
                              onkeydown="imageManager.handleTextareaKeydown(event, ${image.id})"
                              onfocus="imageManager.startEditing(${image.id})"
                              onblur="imageManager.saveDescription(${image.id}, this)">${image.description || ''}</textarea>
                </td>
                <td>
                    <select class="category-select text-xs p-1 border border-gray-300 rounded w-full" 
                            onchange="imageManager.updateCategory(${image.id}, this.value)">
                        ${this.renderCategoryOptions(image.category_id)}
                    </select>
                </td>
                <td class="compact-info">
                    ${this.formatFileSize(image.file_size)}
                    <div class="text-xs text-gray-500">${image.mime_type.split('/')[1].toUpperCase()}</div>
                </td>
                <td class="compact-info">
                    ${new Date(image.upload_date).toLocaleDateString()}
                    <div class="text-xs text-gray-500">${new Date(image.upload_date).toLocaleTimeString()}</div>
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

    async compressImage(file, quality = 0.7, maxWidth = 1200) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions maintaining aspect ratio
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress image
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    console.log(`Compressed ${file.name}: ${this.formatFileSize(file.size)} → ${this.formatFileSize(compressedFile.size)}`);
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            
            img.onerror = () => {
                console.log(`Compression failed for ${file.name}, using original`);
                resolve(file);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    truncateString(str, length) {
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async loadCategories() {
        try {
            const response = await axios.get('/api/categories');
            if (response.data.success) {
                this.categories = response.data.data;
                this.renderCategories();
            }
        } catch (error) {
            console.error('Load categories error:', error);
        }
    }

    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        if (!categoryList) return;

        const totalCount = this.categories.reduce((sum, cat) => sum + (cat.image_count || 0), 0);
        
        let html = `
            <div class="category-item ${this.currentCategory === 'all' ? 'active' : ''}" data-category="all">
                <i class="fas fa-images mr-2"></i>
                <span>All Images</span>
                <span class="count">${totalCount}</span>
            </div>
        `;

        this.categories.forEach(category => {
            html += `
                <div class="category-item-wrapper">
                    <div class="category-item ${this.currentCategory === category.name ? 'active' : ''}" 
                         data-category="${category.name}">
                        <i class="fas fa-folder mr-2" style="color: ${category.color}"></i>
                        <span class="flex-1">${category.name}</span>
                        <span class="count">${category.image_count || 0}</span>
                        <div class="category-actions ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="imageManager.showCategoryModal(${category.id})" 
                                    class="text-xs text-blue-600 hover:text-blue-800 p-1" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="imageManager.deleteCategory(${category.id})" 
                                    class="text-xs text-red-600 hover:text-red-800 p-1" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        categoryList.innerHTML = html;

        // Add click events for category selection (not on action buttons)
        categoryList.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking on action buttons
                if (e.target.closest('.category-actions')) return;
                
                const category = e.currentTarget.dataset.category;
                this.selectCategory(category);
            });
        });
    }

    selectCategory(category) {
        this.currentCategory = category;
        this.currentPage = 1;
        
        // Update active state
        document.querySelectorAll('.category-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        
        this.loadImages();
    }

    renderCategoryOptions(selectedId) {
        let options = '<option value="">No Category</option>';
        this.categories.forEach(category => {
            const selected = category.id == selectedId ? 'selected' : '';
            options += `<option value="${category.id}" ${selected}>${category.name}</option>`;
        });
        return options;
    }

    async updateCategory(imageId, categoryId) {
        try {
            const response = await axios.put(`/api/images/${imageId}`, {
                category_id: categoryId || null
            });

            if (response.data.success) {
                // Refresh category counts
                this.loadCategories();
            } else {
                this.showMessage('Failed to update category', 'error');
            }
        } catch (error) {
            console.error('Update category error:', error);
            this.showMessage('Failed to update category', 'error');
        }
    }

    showCategoryModal() {
        document.getElementById('categoryModal').classList.remove('hidden');
        document.getElementById('categoryModal').classList.add('flex');
    }

    hideCategoryModal() {
        document.getElementById('categoryModal').classList.add('hidden');
        document.getElementById('categoryModal').classList.remove('flex');
        document.getElementById('categoryForm').reset();
    }

    async handleCategorySubmit(e) {
        e.preventDefault();
        
        const name = document.getElementById('categoryName').value.trim();
        const color = document.getElementById('categoryColor').value;
        const description = document.getElementById('categoryDescription').value.trim();

        try {
            const response = await axios.post('/api/categories', {
                name, color, description
            });

            if (response.data.success) {
                this.showMessage('Category created successfully!', 'success');
                this.hideCategoryModal();
                this.loadCategories();
            } else {
                this.showMessage(response.data.error || 'Failed to create category', 'error');
            }
        } catch (error) {
            console.error('Create category error:', error);
            this.showMessage('Failed to create category', 'error');
        }
    }

    async loadImages() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage
            });
            
            if (this.currentCategory && this.currentCategory !== 'all') {
                params.append('category', this.currentCategory);
            }
            
            if (this.currentSearch) {
                params.append('search', this.currentSearch);
            }

            const response = await axios.get(`/api/images?${params}`);
            if (response.data.success) {
                this.renderImageTable(response.data.data);
                this.updatePagination(response.data.pagination);
            } else {
                this.showMessage('Failed to load images', 'error');
            }
        } catch (error) {
            console.error('Load images error:', error);
            this.showMessage('Failed to load images', 'error');
        }
    }

    updatePagination(pagination) {
        this.totalPages = pagination.totalPages;
        
        // Update info text
        const start = ((pagination.page - 1) * pagination.limit) + 1;
        const end = Math.min(pagination.page * pagination.limit, pagination.total);
        document.getElementById('paginationInfo').textContent = 
            `Showing ${start}-${end} of ${pagination.total} images`;
        
        // Update buttons
        document.getElementById('prevBtn').disabled = pagination.page <= 1;
        document.getElementById('nextBtn').disabled = pagination.page >= pagination.totalPages;
        
        // Update page numbers
        this.renderPageNumbers(pagination);
    }

    renderPageNumbers(pagination) {
        const container = document.getElementById('pageNumbers');
        if (!container) return;
        
        let html = '';
        const current = pagination.page;
        const total = pagination.totalPages;
        
        // Show pages around current page
        const start = Math.max(1, current - 2);
        const end = Math.min(total, current + 2);
        
        for (let i = start; i <= end; i++) {
            html += `
                <button class="page-btn ${i === current ? 'active' : ''}" 
                        onclick="imageManager.goToPage(${i})">${i}</button>
            `;
        }
        
        container.innerHTML = html;
    }

    goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadImages();
        }
    }

    // Bulk Selection Methods
    updateSelection() {
        const checkboxes = document.querySelectorAll('.image-checkbox:checked');
        this.selectedImages.clear();
        
        checkboxes.forEach(cb => {
            this.selectedImages.add(parseInt(cb.dataset.imageId));
        });
        
        this.updateBulkActionsBar();
    }

    updateBulkActionsBar() {
        const bar = document.getElementById('bulkActionsBar');
        const count = document.getElementById('selectionCount');
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        
        if (this.selectedImages.size > 0) {
            bar.classList.remove('hidden');
            count.textContent = `${this.selectedImages.size} image${this.selectedImages.size !== 1 ? 's' : ''} selected`;
        } else {
            bar.classList.add('hidden');
        }

        // Update select all checkbox state
        const allCheckboxes = document.querySelectorAll('.image-checkbox');
        const checkedBoxes = document.querySelectorAll('.image-checkbox:checked');
        
        if (checkedBoxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checkedBoxes.length === allCheckboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
        }
    }

    handleSelectAll(e) {
        const checkboxes = document.querySelectorAll('.image-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
        this.updateSelection();
    }

    selectAllImages() {
        const checkboxes = document.querySelectorAll('.image-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = true;
        });
        this.updateSelection();
    }

    deselectAllImages() {
        const checkboxes = document.querySelectorAll('.image-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        this.updateSelection();
    }

    async bulkDownload() {
        if (this.selectedImages.size === 0) {
            this.showMessage('Please select images to download', 'error');
            return;
        }

        try {
            const imageIds = Array.from(this.selectedImages);
            this.showMessage(`Preparing ${imageIds.length} images for download...`, 'info');
            
            const response = await axios.post('/api/images/bulk-download', {
                imageIds: imageIds
            });

            if (response.data.success) {
                this.createZipDownload(response.data.images);
                this.showMessage('Download started successfully!', 'success');
            } else {
                this.showMessage(response.data.error || 'Failed to prepare download', 'error');
            }
        } catch (error) {
            console.error('Bulk download error:', error);
            this.showMessage('Failed to download images', 'error');
        }
    }

    async createZipDownload(images) {
        try {
            if (typeof JSZip === 'undefined') {
                // Fallback: individual downloads
                this.fallbackIndividualDownloads(images);
                return;
            }

            const zip = new JSZip();
            
            // Add each image to the zip
            images.forEach(image => {
                // Convert base64 to binary
                const binaryString = atob(image.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                zip.file(image.name, bytes);
            });

            // Generate zip file
            const timestamp = new Date().toISOString().split('T')[0];
            const zipBlob = await zip.generateAsync({type: 'blob'});
            
            // Download zip file
            if (typeof saveAs !== 'undefined') {
                saveAs(zipBlob, `images_${timestamp}.zip`);
            } else {
                // Fallback download
                const url = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `images_${timestamp}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Zip creation error:', error);
            this.fallbackIndividualDownloads(images);
        }
    }

    fallbackIndividualDownloads(images) {
        this.showMessage(`Creating ${images.length} individual downloads...`, 'info');
        images.forEach((image, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = `data:${image.type};base64,${image.data}`;
                link.download = image.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 200); // Stagger downloads
        });
    }

    async bulkDelete() {
        if (this.selectedImages.size === 0) {
            this.showMessage('Please select images to delete', 'error');
            return;
        }

        const count = this.selectedImages.size;
        if (!confirm(`⚠️ Delete ${count} image${count !== 1 ? 's' : ''}?\n\nThis will permanently delete the selected images and cannot be undone.\n\nAre you sure you want to continue?`)) {
            return;
        }

        try {
            const imageIds = Array.from(this.selectedImages);
            let successCount = 0;
            let errorCount = 0;

            for (const imageId of imageIds) {
                try {
                    const response = await axios.delete(`/api/images/${imageId}`);
                    if (response.data.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            if (successCount > 0) {
                this.showMessage(`Successfully deleted ${successCount} image${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount === imageIds.length ? 'success' : 'info');
                this.selectedImages.clear();
                this.loadImages();
                this.loadCategories();
            } else {
                this.showMessage('Failed to delete images', 'error');
            }
        } catch (error) {
            console.error('Bulk delete error:', error);
            this.showMessage('Failed to delete images', 'error');
        }
    }

    // Category Management Methods
    showCategoryModal(categoryId = null) {
        this.isEditingCategory = !!categoryId;
        const modal = document.getElementById('categoryModal');
        const title = document.getElementById('categoryModalTitle');
        const submitBtn = document.getElementById('categorySubmitBtn');
        
        if (this.isEditingCategory) {
            const category = this.categories.find(cat => cat.id == categoryId);
            if (category) {
                title.textContent = 'Edit Category';
                submitBtn.textContent = 'Update Category';
                document.getElementById('categoryId').value = category.id;
                document.getElementById('categoryName').value = category.name;
                document.getElementById('categoryColor').value = category.color;
                document.getElementById('categoryDescription').value = category.description || '';
            }
        } else {
            title.textContent = 'Add New Category';
            submitBtn.textContent = 'Add Category';
            document.getElementById('categoryForm').reset();
            document.getElementById('categoryId').value = '';
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async handleCategorySubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('categoryId').value;
        const name = document.getElementById('categoryName').value.trim();
        const color = document.getElementById('categoryColor').value;
        const description = document.getElementById('categoryDescription').value.trim();

        try {
            let response;
            if (this.isEditingCategory && id) {
                response = await axios.put(`/api/categories/${id}`, {
                    name, color, description
                });
            } else {
                response = await axios.post('/api/categories', {
                    name, color, description
                });
            }

            if (response.data.success) {
                this.showMessage(`Category ${this.isEditingCategory ? 'updated' : 'created'} successfully!`, 'success');
                this.hideCategoryModal();
                this.loadCategories();
            } else {
                this.showMessage(response.data.error || `Failed to ${this.isEditingCategory ? 'update' : 'create'} category`, 'error');
            }
        } catch (error) {
            console.error('Category operation error:', error);
            this.showMessage(`Failed to ${this.isEditingCategory ? 'update' : 'create'} category`, 'error');
        }
    }

    async deleteCategory(categoryId) {
        const category = this.categories.find(cat => cat.id == categoryId);
        if (!category) return;

        if (!confirm(`⚠️ Delete category "${category.name}"?\n\nThis action cannot be undone. Images in this category will become uncategorized.\n\nAre you sure?`)) {
            return;
        }

        try {
            const response = await axios.delete(`/api/categories/${categoryId}`);
            if (response.data.success) {
                this.showMessage('Category deleted successfully', 'success');
                this.loadCategories();
                if (this.currentCategory === category.name) {
                    this.selectCategory('all');
                }
            } else {
                this.showMessage(response.data.error || 'Failed to delete category', 'error');
            }
        } catch (error) {
            console.error('Delete category error:', error);
            this.showMessage('Failed to delete category', 'error');
        }
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