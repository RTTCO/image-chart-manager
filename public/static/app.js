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
        // Removed editItem as we now use action buttons for editing
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
                            <div class="theme-selection mt-2">
                                <label class="text-sm font-medium text-gray-600">Theme:</label>
                                <input type="text" class="theme-input w-full mt-1 text-sm p-2 border border-gray-300 rounded" 
                                       placeholder="Enter theme (e.g., nature, business, portrait)" data-index="${index}">
                            </div>
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
        const themes = [];

        // Compress and add files
        for (let index = 0; index < this.selectedFiles.length; index++) {
            const originalFile = this.selectedFiles[index];
            
            // Compress image if it's too large (>500KB)
            const compressedFile = originalFile.size > 500000 ? 
                await this.compressImage(originalFile, 0.7, 1200) : originalFile;
            
            formData.append('images', compressedFile);
            
            const descInput = document.querySelector(`textarea[data-index="${index}"]`);
            const categorySelect = document.querySelector(`select[data-index="${index}"]`);
            const themeInput = document.querySelector(`input.theme-input[data-index="${index}"]`);
            
            descriptions.push(descInput ? descInput.value.trim() : '');
            categoryIds.push(categorySelect ? categorySelect.value || null : null);
            themes.push(themeInput ? themeInput.value.trim() : '');
        }

        // Add descriptions
        descriptions.forEach(desc => {
            formData.append('descriptions', desc);
        });
        
        // Add category IDs
        categoryIds.forEach(categoryId => {
            formData.append('categoryIds', categoryId || '');
        });
        
        // Add themes
        themes.forEach(theme => {
            formData.append('themes', theme);
        });

        try {
            this.showProgress(true);
            this.updateProgressText('Compressing images...');
            
            // Mobile debugging - log file details
            console.log('Upload attempt:', {
                fileCount: this.selectedFiles.length,
                descriptions: descriptions,
                categoryIds: categoryIds,
                themes: themes,
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
                    <td colspan="9" class="text-center py-8 text-gray-500">
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
                    <div class="readonly-content" data-image-id="${image.id}">
                        ${image.description || '<span class="text-gray-400">No description</span>'}
                    </div>
                    <textarea class="edit-textarea hidden" data-image-id="${image.id}" 
                              data-original-value="${this.escapeHtml(image.description || '')}"
                              placeholder="Enter description..."
                              onkeydown="imageManager.handleTextareaKeydown(event, ${image.id})"
                              onblur="imageManager.handleBlur(${image.id}, 'description', this)">${image.description || ''}</textarea>
                </td>
                <td class="theme-cell" data-image-id="${image.id}">
                    <div class="readonly-content" data-image-id="${image.id}">
                        ${image.theme || '<span class="text-gray-400">No theme</span>'}
                    </div>
                    <input type="text" 
                           class="edit-input hidden text-xs p-1 border border-gray-300 rounded w-full"
                           value="${this.escapeHtml(image.theme || '')}"
                           data-image-id="${image.id}"
                           data-original-value="${this.escapeHtml(image.theme || '')}"
                           placeholder="Enter theme..."
                           onkeydown="imageManager.handleThemeKeydown(event, ${image.id})"
                           onblur="imageManager.handleBlur(${image.id}, 'theme', this)">
                </td>
                <td class="category-cell" data-image-id="${image.id}">
                    <div class="readonly-content" data-image-id="${image.id}">
                        <span class="category-badge" style="background-color: ${image.category_color || '#6b7280'}">
                            ${image.category_name || 'Uncategorized'}
                        </span>
                    </div>
                    <select class="edit-select hidden text-xs p-1 border border-gray-300 rounded w-full" 
                            data-image-id="${image.id}"
                            onchange="imageManager.handleCategoryChange(${image.id}, this)">
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
                    <button class="action-btn edit" onclick="imageManager.toggleEdit(${image.id})" title="Edit Row" data-image-id="${image.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete hidden" onclick="imageManager.deleteRow(${image.id})" title="Delete Row" data-image-id="${image.id}">
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
            // Ctrl/Cmd + Enter to save all changes
            event.preventDefault();
            this.saveAllChanges(imageId);
        } else if (event.key === 'Escape') {
            // Escape to cancel all editing
            event.preventDefault();
            this.cancelAllEditing(imageId);
        }
    }

    handleBlur(imageId, field, element) {
        // Don't auto-save on blur anymore - only save when edit button is clicked
        // This prevents accidental saves when clicking elsewhere
    }

    handleCategoryChange(imageId, select) {
        // Don't auto-save on change - only save when edit button is clicked
        // This allows users to change category without immediately saving
    }

    async saveDescription(imageId, textarea) {
        const cell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const readonly = cell.querySelector('.readonly-content');
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
                
                // Update readonly display
                readonly.innerHTML = description || '<span class="text-gray-400">No description</span>';
                
                // Switch back to readonly mode
                textarea.classList.add('hidden');
                readonly.classList.remove('hidden');
                
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

    cancelAllEditing(imageId) {
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        
        // Reset all fields to original values
        const descTextarea = descCell.querySelector('.edit-textarea');
        const themeInput = themeCell.querySelector('.edit-input');
        const categorySelect = categoryCell.querySelector('.edit-select');
        
        const descOriginal = descTextarea.dataset.originalValue || '';
        const themeOriginal = themeInput.dataset.originalValue || '';
        
        descTextarea.value = descOriginal;
        themeInput.value = themeOriginal;
        
        // Exit edit mode without saving (this will also hide delete button)
        this.exitEditMode(imageId);
    }

    cancelEditing(imageId) {
        const cell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const readonly = cell.querySelector('.readonly-content');
        const textarea = cell.querySelector('.edit-textarea');
        
        if (cell && readonly && textarea) {
            // Reset to original value
            const originalValue = textarea.dataset.originalValue || '';
            textarea.value = originalValue;
            
            // Switch back to readonly mode
            textarea.classList.add('hidden');
            readonly.classList.remove('hidden');
            
            cell.classList.remove('editing', 'saving', 'error');
        }
    }

    toggleEdit(imageId) {
        const editBtn = document.querySelector(`button.action-btn.edit[data-image-id="${imageId}"]`);
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        
        // Check if currently in edit mode
        const isEditing = descCell.classList.contains('editing');
        
        if (isEditing) {
            // Save all changes and exit edit mode
            this.saveAllChanges(imageId);
        } else {
            // Enter edit mode for all fields
            this.enterEditMode(imageId);
        }
    }

    enterEditMode(imageId) {
        const editBtn = document.querySelector(`button.action-btn.edit[data-image-id="${imageId}"]`);
        const deleteBtn = document.querySelector(`button.action-btn.delete[data-image-id="${imageId}"]`);
        
        // Update button appearance
        editBtn.innerHTML = '<i class="fas fa-save"></i>';
        editBtn.title = 'Save Changes';
        editBtn.classList.add('save-mode');
        
        // Show delete button
        deleteBtn.classList.remove('hidden');
        
        // Enable editing for description
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const descReadonly = descCell.querySelector('.readonly-content');
        const descTextarea = descCell.querySelector('.edit-textarea');
        
        descReadonly.classList.add('hidden');
        descTextarea.classList.remove('hidden');
        descCell.classList.add('editing');
        
        // Enable editing for theme
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const themeReadonly = themeCell.querySelector('.readonly-content');
        const themeInput = themeCell.querySelector('.edit-input');
        
        themeReadonly.classList.add('hidden');
        themeInput.classList.remove('hidden');
        themeCell.classList.add('editing');
        
        // Enable editing for category
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        const categoryReadonly = categoryCell.querySelector('.readonly-content');
        const categorySelect = categoryCell.querySelector('.edit-select');
        
        categoryReadonly.classList.add('hidden');
        categorySelect.classList.remove('hidden');
        categoryCell.classList.add('editing');
        
        // Focus on description field
        descTextarea.focus();
        descTextarea.select();
    }

    async saveAllChanges(imageId) {
        const editBtn = document.querySelector(`button.action-btn.edit[data-image-id="${imageId}"]`);
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        
        // Get values
        const descTextarea = descCell.querySelector('.edit-textarea');
        const themeInput = themeCell.querySelector('.edit-input');
        const categorySelect = categoryCell.querySelector('.edit-select');
        
        const description = descTextarea.value.trim();
        const theme = themeInput.value.trim();
        const categoryId = categorySelect.value || null;
        
        try {
            // Show saving state
            editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            editBtn.title = 'Saving...';
            descCell.classList.add('saving');
            themeCell.classList.add('saving');
            categoryCell.classList.add('saving');
            
            // Save all changes in one API call
            const response = await axios.put(`/api/images/${imageId}`, {
                description: description,
                theme: theme,
                category_id: categoryId
            });

            if (response.data.success) {
                // Update all readonly displays
                this.updateReadonlyDisplays(imageId, description, theme, categorySelect);
                
                // Update original values
                descTextarea.dataset.originalValue = this.escapeHtml(description);
                themeInput.dataset.originalValue = this.escapeHtml(theme);
                
                // Exit edit mode
                this.exitEditMode(imageId);
                
                // Refresh category counts if category changed
                this.loadCategories();
                
            } else {
                throw new Error(response.data.error || 'Failed to update');
            }
        } catch (error) {
            console.error('Update error:', error);
            
            // Reset to original values on error
            const descOriginal = descTextarea.dataset.originalValue || '';
            const themeOriginal = themeInput.dataset.originalValue || '';
            descTextarea.value = descOriginal;
            themeInput.value = themeOriginal;
            
            // Show error state
            descCell.classList.add('error');
            themeCell.classList.add('error');
            categoryCell.classList.add('error');
            
            this.showMessage('Failed to save changes. Values reverted.', 'error');
            
            // Remove error state after 3 seconds
            setTimeout(() => {
                descCell.classList.remove('error');
                themeCell.classList.remove('error');
                categoryCell.classList.remove('error');
            }, 3000);
            
            // Reset button
            editBtn.innerHTML = '<i class="fas fa-save"></i>';
            editBtn.title = 'Save Changes';
        } finally {
            descCell.classList.remove('saving');
            themeCell.classList.remove('saving');
            categoryCell.classList.remove('saving');
        }
    }

    updateReadonlyDisplays(imageId, description, theme, categorySelect) {
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        
        // Update description display
        const descReadonly = descCell.querySelector('.readonly-content');
        descReadonly.innerHTML = description || '<span class="text-gray-400">No description</span>';
        
        // Update theme display
        const themeReadonly = themeCell.querySelector('.readonly-content');
        themeReadonly.innerHTML = theme || '<span class="text-gray-400">No theme</span>';
        
        // Update category display
        const categoryReadonly = categoryCell.querySelector('.readonly-content');
        const selectedOption = categorySelect.options[categorySelect.selectedIndex];
        const categoryName = selectedOption.text;
        const categoryColor = selectedOption.dataset.color || '#6b7280';
        categoryReadonly.innerHTML = `<span class="category-badge" style="background-color: ${categoryColor}">${categoryName}</span>`;
    }

    exitEditMode(imageId) {
        const editBtn = document.querySelector(`button.action-btn.edit[data-image-id="${imageId}"]`);
        const deleteBtn = document.querySelector(`button.action-btn.delete[data-image-id="${imageId}"]`);
        const descCell = document.querySelector(`td.description-cell[data-image-id="${imageId}"]`);
        const themeCell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const categoryCell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        
        // Reset button
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.title = 'Edit Row';
        editBtn.classList.remove('save-mode');
        
        // Hide delete button
        deleteBtn.classList.add('hidden');
        
        // Switch all fields back to readonly
        const descReadonly = descCell.querySelector('.readonly-content');
        const descTextarea = descCell.querySelector('.edit-textarea');
        const themeReadonly = themeCell.querySelector('.readonly-content');
        const themeInput = themeCell.querySelector('.edit-input');
        const categoryReadonly = categoryCell.querySelector('.readonly-content');
        const categorySelect = categoryCell.querySelector('.edit-select');
        
        // Description
        descTextarea.classList.add('hidden');
        descReadonly.classList.remove('hidden');
        descCell.classList.remove('editing');
        
        // Theme
        themeInput.classList.add('hidden');
        themeReadonly.classList.remove('hidden');
        themeCell.classList.remove('editing');
        
        // Category
        categorySelect.classList.add('hidden');
        categoryReadonly.classList.remove('hidden');
        categoryCell.classList.remove('editing');
    }

    startEditingTheme(imageId) {
        const cell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        if (cell) {
            cell.classList.add('editing');
            cell.classList.remove('saving', 'error');
        }
    }

    handleThemeKeydown(event, imageId) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            // Ctrl/Cmd + Enter to save all changes
            event.preventDefault();
            this.saveAllChanges(imageId);
        } else if (event.key === 'Escape') {
            // Escape to cancel all editing
            event.preventDefault();
            this.cancelAllEditing(imageId);
        }
    }

    async saveTheme(imageId, input) {
        const cell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const readonly = cell.querySelector('.readonly-content');
        const theme = input.value.trim();
        
        try {
            cell.classList.remove('editing');
            cell.classList.add('saving');
            
            const response = await axios.put(`/api/images/${imageId}`, {
                theme: theme
            });

            if (response.data.success) {
                // Update the original value for future cancellations
                input.dataset.originalValue = this.escapeHtml(theme);
                
                // Update readonly display
                readonly.innerHTML = theme || '<span class="text-gray-400">No theme</span>';
                
                // Switch back to readonly mode
                input.classList.add('hidden');
                readonly.classList.remove('hidden');
                
                cell.classList.remove('saving');
                
                // Show brief success feedback
                setTimeout(() => {
                    cell.classList.remove('saving');
                }, 500);
            } else {
                throw new Error(response.data.error || 'Failed to update');
            }
        } catch (error) {
            console.error('Update theme error:', error);
            cell.classList.remove('saving');
            cell.classList.add('error');
            
            // Reset to original value on error
            const originalValue = input.dataset.originalValue || '';
            input.value = originalValue;
            
            this.showMessage('Failed to update theme. Changes reverted.', 'error');
            
            // Remove error state after 3 seconds
            setTimeout(() => {
                cell.classList.remove('error');
            }, 3000);
        }
    }

    cancelEditingTheme(imageId) {
        const cell = document.querySelector(`td.theme-cell[data-image-id="${imageId}"]`);
        const readonly = cell.querySelector('.readonly-content');
        const input = cell.querySelector('.edit-input');
        
        if (cell && readonly && input) {
            // Reset to original value
            const originalValue = input.dataset.originalValue || '';
            input.value = originalValue;
            
            // Switch back to readonly mode
            input.classList.add('hidden');
            readonly.classList.remove('hidden');
            
            cell.classList.remove('editing', 'saving', 'error');
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
        let options = '<option value="" data-color="#6b7280">Uncategorized</option>';
        this.categories.forEach(category => {
            const selected = category.id == selectedId ? 'selected' : '';
            options += `<option value="${category.id}" data-color="${category.color}" ${selected}>${category.name}</option>`;
        });
        return options;
    }

    async updateCategory(imageId, categoryId) {
        const cell = document.querySelector(`td.category-cell[data-image-id="${imageId}"]`);
        const readonly = cell.querySelector('.readonly-content');
        const select = cell.querySelector('.edit-select');
        
        try {
            cell.classList.add('saving');
            
            const response = await axios.put(`/api/images/${imageId}`, {
                category_id: categoryId || null
            });

            if (response.data.success) {
                // Find the selected category info
                const selectedOption = select.options[select.selectedIndex];
                const categoryName = selectedOption.text;
                const categoryColor = selectedOption.dataset.color || '#6b7280';
                
                // Update readonly display
                readonly.innerHTML = `<span class="category-badge" style="background-color: ${categoryColor}">${categoryName}</span>`;
                
                // Switch back to readonly mode
                select.classList.add('hidden');
                readonly.classList.remove('hidden');
                cell.classList.remove('editing');
                
                // Refresh category counts
                this.loadCategories();
                
                cell.classList.remove('saving');
            } else {
                this.showMessage('Failed to update category', 'error');
                cell.classList.remove('saving');
            }
        } catch (error) {
            console.error('Update category error:', error);
            this.showMessage('Failed to update category', 'error');
            cell.classList.remove('saving');
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