import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API Routes

// Get all categories
app.get('/api/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT 
        c.*,
        COUNT(ie.id) as image_count
      FROM categories c
      LEFT JOIN image_entries ie ON c.id = ie.category_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all()
    
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Error fetching categories:', error)
    return c.json({ success: false, error: 'Failed to fetch categories' }, 500)
  }
})

// Create new category
app.post('/api/categories', async (c) => {
  try {
    const { name, color = '#3b82f6', description = '' } = await c.req.json()
    
    const result = await c.env.DB.prepare(`
      INSERT INTO categories (name, color, description)
      VALUES (?, ?, ?)
    `).bind(name, color, description).run()
    
    return c.json({ 
      success: true, 
      data: { 
        id: result.meta.last_row_id,
        name,
        color,
        description
      }
    })
  } catch (error) {
    console.error('Create category error:', error)
    return c.json({ success: false, error: 'Failed to create category' }, 500)
  }
})

// Get all image entries with categories
app.get('/api/images', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '50')
    const category = c.req.query('category')
    const search = c.req.query('search')
    const offset = (page - 1) * limit

    let query = `
      SELECT 
        ie.*,
        c.name as category_name,
        c.color as category_color
      FROM image_entries ie
      LEFT JOIN categories c ON ie.category_id = c.id
    `
    
    let conditions = []
    let params = []
    
    if (category && category !== 'all') {
      conditions.push('c.name = ?')
      params.push(category)
    }
    
    if (search) {
      conditions.push('(ie.description LIKE ? OR ie.original_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }
    
    query += ' ORDER BY ie.upload_date DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM image_entries ie'
    if (category && category !== 'all') {
      countQuery += ' LEFT JOIN categories c ON ie.category_id = c.id WHERE c.name = ?'
    }
    
    const countParams = category && category !== 'all' ? [category] : []
    const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...countParams).all()
    const total = (countResults[0] as any)?.total || 0
    
    return c.json({ 
      success: true, 
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching images:', error)
    return c.json({ success: false, error: 'Failed to fetch images' }, 500)
  }
})

// Upload multiple images
app.post('/api/upload', async (c) => {
  try {
    const body = await c.req.formData()
    const files = body.getAll('images') as File[]
    const descriptions = body.getAll('descriptions') as string[]
    
    if (!files || files.length === 0) {
      return c.json({ success: false, error: 'No files uploaded' }, 400)
    }

    const uploadedFiles = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const description = descriptions[i] || ''
      
      if (!(file instanceof File)) continue

      // Generate unique filename
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(7)
      const ext = file.name.split('.').pop() || 'jpg'
      const filename = `${timestamp}-${randomId}.${ext}`

      // Upload to R2
      const arrayBuffer = await file.arrayBuffer()
      await c.env.R2.put(filename, arrayBuffer, {
        httpMetadata: {
          contentType: file.type || 'image/jpeg'
        }
      })

      // Get next row order
      const { results: maxOrderResult } = await c.env.DB.prepare(
        'SELECT MAX(row_order) as max_order FROM image_entries'
      ).all()
      const nextOrder = ((maxOrderResult[0] as any)?.max_order || 0) + 1

      // Save metadata to D1
      const result = await c.env.DB.prepare(`
        INSERT INTO image_entries (filename, original_name, file_size, mime_type, description, row_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(filename, file.name, file.size, file.type, description, nextOrder).run()

      uploadedFiles.push({
        id: result.meta.last_row_id,
        filename,
        original_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        description,
        row_order: nextOrder
      })
    }

    return c.json({ success: true, data: uploadedFiles })
  } catch (error) {
    console.error('Upload error:', error)
    return c.json({ success: false, error: 'Upload failed' }, 500)
  }
})

// Update image description and category
app.put('/api/images/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { description, category_id, status } = await c.req.json()

    let updateFields = []
    let params = []
    
    if (description !== undefined) {
      updateFields.push('description = ?')
      params.push(description)
    }
    
    if (category_id !== undefined) {
      updateFields.push('category_id = ?')
      params.push(category_id)
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?')
      params.push(status)
    }
    
    if (updateFields.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400)
    }
    
    const query = `UPDATE image_entries SET ${updateFields.join(', ')} WHERE id = ?`
    params.push(id)

    await c.env.DB.prepare(query).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return c.json({ success: false, error: 'Failed to update image' }, 500)
  }
})

// Delete image
app.delete('/api/images/:id', async (c) => {
  try {
    const id = c.req.param('id')

    // Get image info
    const { results } = await c.env.DB.prepare(
      'SELECT filename FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'Image not found' }, 404)
    }

    const image = results[0] as any
    
    // Delete from R2
    await c.env.R2.delete(image.filename)
    
    // Delete from database
    await c.env.DB.prepare(
      'DELETE FROM image_entries WHERE id = ?'
    ).bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return c.json({ success: false, error: 'Failed to delete image' }, 500)
  }
})

// Get image file
app.get('/api/images/:id/file', async (c) => {
  try {
    const id = c.req.param('id')

    // Get image info
    const { results } = await c.env.DB.prepare(
      'SELECT filename, mime_type, original_name FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.notFound()
    }

    const image = results[0] as any
    
    // Get file from R2
    const object = await c.env.R2.get(image.filename)
    if (!object) {
      return c.notFound()
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': image.mime_type || 'image/jpeg',
        'Content-Disposition': `inline; filename="${image.original_name}"`
      }
    })
  } catch (error) {
    console.error('File access error:', error)
    return c.json({ success: false, error: 'Failed to access file' }, 500)
  }
})

// Download image file
app.get('/api/images/:id/download', async (c) => {
  try {
    const id = c.req.param('id')

    // Get image info
    const { results } = await c.env.DB.prepare(
      'SELECT filename, mime_type, original_name FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.notFound()
    }

    const image = results[0] as any
    
    // Get file from R2
    const object = await c.env.R2.get(image.filename)
    if (!object) {
      return c.notFound()
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${image.original_name}"`
      }
    })
  } catch (error) {
    console.error('Download error:', error)
    return c.json({ success: false, error: 'Failed to download file' }, 500)
  }
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Image Chart Manager</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
        <style>
          /* Custom context menu styles */
          .context-menu {
            display: none;
            position: fixed;
            z-index: 1000;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            min-width: 120px;
          }
          .context-menu ul {
            list-style: none;
            margin: 0;
            padding: 4px 0;
          }
          .context-menu li {
            padding: 8px 16px;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          .context-menu li:hover {
            background-color: #f0f0f0;
          }
          .context-menu li.disabled {
            color: #ccc;
            cursor: not-allowed;
          }
          .excel-table {
            border-collapse: collapse;
            width: 100%;
            background: white;
          }
          .excel-table th,
          .excel-table td {
            border: 1px solid #d1d5db;
            padding: 4px 6px;
            text-align: left;
            font-size: 14px;
          }
          .excel-table th {
            background-color: #f3f4f6;
            font-weight: 600;
            position: sticky;
            top: 0;
          }
          .excel-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .excel-table tr:hover {
            background-color: #e5e7eb;
          }
          .image-cell {
            width: 80px;
            text-align: center;
            padding: 2px;
          }
          .image-cell img {
            width: 70px;
            height: 50px;
            object-fit: cover;
            cursor: pointer;
            border-radius: 3px;
            transition: transform 0.2s;
          }
          .image-cell img:hover {
            transform: scale(1.2);
            z-index: 10;
            position: relative;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .description-cell {
            min-width: 250px;
            max-width: 400px;
          }
          .description-cell textarea {
            width: 100%;
            border: none;
            background: transparent;
            resize: none;
            min-height: 40px;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.3;
          }
          .description-cell textarea:focus {
            outline: 2px solid #3b82f6;
            outline-offset: -2px;
            background: white;
          }
          .description-cell.editing {
            background-color: #eff6ff;
          }
          .description-cell.saving {
            background-color: #f0fdf4;
          }
          .description-cell.error {
            background-color: #fef2f2;
          }
          .action-buttons {
            display: flex;
            gap: 4px;
            justify-content: center;
          }
          .action-btn {
            padding: 4px 8px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          }
          .action-btn.edit {
            background: #3b82f6;
            color: white;
          }
          .action-btn.edit:hover {
            background: #2563eb;
          }
          .action-btn.delete {
            background: #ef4444;
            color: white;
          }
          .action-btn.delete:hover {
            background: #dc2626;
          }
          .action-btn.save {
            background: #10b981;
            color: white;
          }
          .action-btn.save:hover {
            background: #059669;
          }
          .action-btn.cancel {
            background: #6b7280;
            color: white;
          }
          .action-btn.cancel:hover {
            background: #4b5563;
          }
          .action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          /* Sidebar Styles */
          .category-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
          }
          .category-item:hover {
            background-color: #f3f4f6;
          }
          .category-item.active {
            background-color: #eff6ff;
            border: 1px solid #3b82f6;
            color: #1d4ed8;
          }
          .category-item .count {
            font-size: 12px;
            background: #e5e7eb;
            color: #374151;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: auto;
          }
          .category-item.active .count {
            background: #dbeafe;
            color: #1d4ed8;
          }
          
          .filter-item {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            color: #6b7280;
          }
          .filter-item:hover {
            background-color: #f9fafb;
            color: #374151;
          }
          
          /* Compact table styles */
          .compact-info {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.2;
          }
          
          /* Category badge */
          .category-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            color: white;
          }
          
          /* Pagination styles */
          .page-btn {
            padding: 6px 12px;
            border: 1px solid #d1d5db;
            background: white;
            color: #374151;
            text-decoration: none;
            border-radius: 4px;
            font-size: 14px;
            transition: all 0.2s;
          }
          .page-btn:hover {
            background: #f9fafb;
          }
          .page-btn.active {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
          }
          .upload-area {
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            background-color: #f9fafb;
            transition: all 0.3s;
            cursor: pointer;
          }
          .upload-area:hover,
          .upload-area.dragover {
            border-color: #3b82f6;
            background-color: #eff6ff;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <div class="flex h-screen">
            <!-- Sidebar -->
            <div class="w-64 bg-white shadow-md p-4 overflow-y-auto">
                <h2 class="text-lg font-semibold mb-4">
                    <i class="fas fa-folder mr-2"></i>
                    Categories
                </h2>
                
                <!-- Category List -->
                <div id="categoryList" class="space-y-2 mb-6">
                    <div class="category-item active" data-category="all">
                        <i class="fas fa-images mr-2"></i>
                        <span>All Images</span>
                        <span class="count ml-auto" id="totalCount">0</span>
                    </div>
                </div>
                
                <!-- Add Category Button -->
                <button id="addCategoryBtn" class="w-full bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 transition-colors">
                    <i class="fas fa-plus mr-2"></i>
                    Add Category
                </button>
                
                <!-- Quick Filters -->
                <div class="mt-6">
                    <h3 class="text-sm font-semibold mb-3 text-gray-600">QUICK FILTERS</h3>
                    <div class="space-y-2 text-sm">
                        <div class="filter-item" data-filter="recent">
                            <i class="fas fa-clock mr-2"></i>
                            Recent (7 days)
                        </div>
                        <div class="filter-item" data-filter="uncategorized">
                            <i class="fas fa-question-circle mr-2"></i>
                            Uncategorized
                        </div>
                        <div class="filter-item" data-filter="draft">
                            <i class="fas fa-edit mr-2"></i>
                            Drafts
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Main Content -->
            <div class="flex-1 flex flex-col overflow-hidden">
                <!-- Header -->
                <div class="bg-white shadow-sm p-4">
                    <div class="flex items-center justify-between">
                        <h1 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-chart-bar mr-2"></i>
                            Image Chart Manager
                        </h1>
                        
                        <!-- Search and Controls -->
                        <div class="flex items-center gap-4">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="searchInput" placeholder="Search descriptions..." 
                                       class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            </div>
                            <select id="viewModeSelect" class="px-3 py-2 border border-gray-300 rounded-lg">
                                <option value="50">50 per page</option>
                                <option value="25">25 per page</option>
                                <option value="100">100 per page</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Content Area -->
                <div class="flex-1 p-4 overflow-hidden">
        <div class="max-w-full">
            <h1 class="text-3xl font-bold text-gray-800 mb-6">
                <i class="fas fa-chart-bar mr-2"></i>
                Image Chart Manager
            </h1>

            <!-- Upload Section -->
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-cloud-upload-alt mr-2"></i>
                    Upload Images
                </h2>
                
                <div id="uploadArea" class="upload-area">
                    <i class="fas fa-images text-4xl text-gray-400 mb-4"></i>
                    <p class="text-lg font-medium text-gray-600">Drop images here or click to browse</p>
                    <p class="text-sm text-gray-500 mt-2">Supports multiple image files (JPG, PNG, GIF, WebP)</p>
                    <input type="file" id="fileInput" multiple accept="image/*" class="hidden">
                </div>
                
                <div id="uploadProgress" class="mt-4 hidden">
                    <div class="bg-blue-50 rounded-lg p-4">
                        <div class="flex items-center">
                            <i class="fas fa-spinner fa-spin mr-2"></i>
                            <span>Uploading images...</span>
                        </div>
                        <div class="mt-2 bg-blue-200 rounded-full h-2">
                            <div id="progressBar" class="bg-blue-600 h-2 rounded-full transition-all" style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <!-- File Preview Area -->
                <div id="filePreview" class="mt-4 hidden">
                    <h3 class="text-lg font-medium mb-3">Files Ready for Upload:</h3>
                    <div id="previewContainer" class="space-y-2"></div>
                    <button id="uploadBtn" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <i class="fas fa-upload mr-2"></i>
                        Upload All Files
                    </button>
                    <button id="clearBtn" class="mt-4 ml-2 bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors">
                        <i class="fas fa-times mr-2"></i>
                        Clear
                    </button>
                </div>
            </div>

            <!-- Image Chart Table -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-xl font-semibold">
                            <i class="fas fa-table mr-2"></i>
                            Image Chart
                        </h2>
                        <p class="text-sm text-gray-600 mt-1">
                            <i class="fas fa-info-circle mr-1"></i>
                            Click descriptions to edit • Right-click images for options • Use Ctrl+Enter to save, Esc to cancel
                        </p>
                    </div>
                    <button id="refreshBtn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                        <i class="fas fa-sync-alt mr-2"></i>
                        Refresh
                    </button>
                </div>

                <div class="overflow-auto" style="max-height: 70vh;">
                    <table class="excel-table">
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th style="width: 80px;">Image</th>
                                <th style="width: auto;">Description</th>
                                <th style="width: 100px;">Category</th>
                                <th style="width: 80px;">Size</th>
                                <th style="width: 100px;">Date</th>
                                <th style="width: 80px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="imageTableBody">
                            <tr>
                                <td colspan="7" class="text-center py-8 text-gray-500">
                                    <i class="fas fa-image text-3xl mb-2"></i>
                                    <p>No images uploaded yet. Upload some images to get started!</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
                </div>
                
                <!-- Pagination -->
                <div class="bg-white border-t p-4">
                    <div class="flex items-center justify-between">
                        <div class="text-sm text-gray-600" id="paginationInfo">
                            Showing 0-0 of 0 images
                        </div>
                        <div class="flex items-center gap-2" id="paginationControls">
                            <button id="prevBtn" class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50" disabled>
                                <i class="fas fa-chevron-left"></i> Previous
                            </button>
                            <span id="pageNumbers" class="flex gap-1"></span>
                            <button id="nextBtn" class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50" disabled>
                                Next <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Category Modal -->
        <div id="categoryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-96">
                <h3 class="text-lg font-semibold mb-4">Add New Category</h3>
                <form id="categoryForm">
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Category Name</label>
                        <input type="text" id="categoryName" class="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Color</label>
                        <input type="color" id="categoryColor" value="#3b82f6" class="w-full h-10 border border-gray-300 rounded-md">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Description (Optional)</label>
                        <textarea id="categoryDescription" class="w-full px-3 py-2 border border-gray-300 rounded-md h-20"></textarea>
                    </div>
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700">
                            Add Category
                        </button>
                        <button type="button" id="cancelCategoryBtn" class="flex-1 bg-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-400">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Context Menu -->
        <div id="contextMenu" class="context-menu">
            <ul>
                <li id="editItem">
                    <i class="fas fa-edit mr-2"></i>
                    Edit Description
                </li>
                <li id="downloadItem">
                    <i class="fas fa-download mr-2"></i>
                    Download Image
                </li>
                <li id="deleteRowItem">
                    <i class="fas fa-trash-alt mr-2"></i>
                    Delete Row
                </li>
            </ul>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app