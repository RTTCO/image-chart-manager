import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
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

// Update category
app.put('/api/categories/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { name, color, description } = await c.req.json()
    
    await c.env.DB.prepare(`
      UPDATE categories SET name = ?, color = ?, description = ? WHERE id = ?
    `).bind(name, color, description, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Update category error:', error)
    return c.json({ success: false, error: 'Failed to update category' }, 500)
  }
})

// Delete category
app.delete('/api/categories/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Check if category has images
    const { results: imageCheck } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM image_entries WHERE category_id = ?
    `).bind(id).all()
    
    const imageCount = (imageCheck[0] as any)?.count || 0
    if (imageCount > 0) {
      return c.json({ 
        success: false, 
        error: `Cannot delete category with ${imageCount} images. Move or delete images first.` 
      }, 400)
    }
    
    await c.env.DB.prepare(`
      DELETE FROM categories WHERE id = ?
    `).bind(id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Delete category error:', error)
    return c.json({ success: false, error: 'Failed to delete category' }, 500)
  }
})

// Bulk download images
app.post('/api/images/bulk-download', async (c) => {
  try {
    const { imageIds } = await c.req.json()
    
    if (!imageIds || imageIds.length === 0) {
      return c.json({ success: false, error: 'No images selected' }, 400)
    }
    
    // Get all selected images
    const placeholders = imageIds.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(`
      SELECT id, original_name, image_data, mime_type
      FROM image_entries 
      WHERE id IN (${placeholders})
    `).bind(...imageIds).all()
    
    if (results.length === 0) {
      return c.json({ success: false, error: 'No images found' }, 404)
    }
    
    // Create a simple JSON response with base64 data for client-side zip creation
    const images = results.map(image => ({
      id: (image as any).id,
      name: (image as any).original_name,
      data: (image as any).image_data,
      type: (image as any).mime_type
    }))
    
    return c.json({ success: true, images })
  } catch (error) {
    console.error('Bulk download error:', error)
    return c.json({ success: false, error: 'Failed to prepare download' }, 500)
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
    const categoryIds = body.getAll('categoryIds') as string[]
    
    if (!files || files.length === 0) {
      return c.json({ success: false, error: 'No files uploaded' }, 400)
    }

    const uploadedFiles = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const description = descriptions[i] || ''
      const categoryId = categoryIds[i] && categoryIds[i] !== '' ? parseInt(categoryIds[i]) : null
      
      if (!(file instanceof File)) continue

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        console.error(`File too large: ${file.name} (${file.size} bytes)`)
        continue
      }

      // Generate unique filename
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(7)
      const ext = file.name.split('.').pop() || 'jpg'
      const filename = `${timestamp}-${randomId}.${ext}`

      // Convert to base64 for database storage
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Convert to base64 without using spread operator (prevents stack overflow)
      let binaryString = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i])
      }
      const base64Data = btoa(binaryString)

      // Get next row order
      const { results: maxOrderResult } = await c.env.DB.prepare(
        'SELECT MAX(row_order) as max_order FROM image_entries'
      ).all()
      const nextOrder = ((maxOrderResult[0] as any)?.max_order || 0) + 1

      // Save metadata and base64 data to D1
      const result = await c.env.DB.prepare(`
        INSERT INTO image_entries (filename, original_name, file_size, mime_type, description, row_order, image_data, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(filename, file.name, file.size, file.type, description, nextOrder, base64Data, categoryId).run()

      uploadedFiles.push({
        id: result.meta.last_row_id,
        filename,
        original_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        description,
        row_order: nextOrder,
        category_id: categoryId
      })
    }

    return c.json({ success: true, data: uploadedFiles })
  } catch (error) {
    console.error('Upload error:', error)
    return c.json({ success: false, error: `Upload failed: ${error.message}` }, 500)
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

    // Check if image exists
    const { results } = await c.env.DB.prepare(
      'SELECT id FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'Image not found' }, 404)
    }
    
    // Delete from database (image data is stored in the database)
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

    // Get image info and data
    const { results } = await c.env.DB.prepare(
      'SELECT filename, mime_type, original_name, image_data FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.notFound()
    }

    const image = results[0] as any
    
    if (!image.image_data) {
      return c.notFound()
    }

    // Convert base64 back to binary
    const binaryString = atob(image.image_data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': image.mime_type || 'image/jpeg',
        'Content-Disposition': `inline; filename="${image.original_name}"`,
        'Cache-Control': 'public, max-age=31536000'
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

    // Get image info and data
    const { results } = await c.env.DB.prepare(
      'SELECT filename, mime_type, original_name, image_data FROM image_entries WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.notFound()
    }

    const image = results[0] as any
    
    if (!image.image_data) {
      return c.notFound()
    }

    // Convert base64 back to binary
    const binaryString = atob(image.image_data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return new Response(bytes, {
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
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
          
          /* Category management styles */
          .category-item-wrapper {
            position: relative;
          }
          .category-item-wrapper:hover .category-actions {
            opacity: 1 !important;
          }
          .category-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
          }
          .category-actions {
            display: flex;
            gap: 2px;
            opacity: 0;
            transition: opacity 0.2s;
          }
          .category-actions button {
            background: none;
            border: none;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
          }
          .category-actions button:hover {
            background: rgba(0,0,0,0.1);
          }
          
          /* Bulk selection styles */
          .bulk-actions-bar {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
          }
          
          /* File preview styles */
          #previewContainer {
            max-height: 500px;
            overflow-y: auto;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            background: #f9fafb;
          }
          #previewContainer::-webkit-scrollbar {
            width: 8px;
          }
          #previewContainer::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          #previewContainer::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
          }
          #previewContainer::-webkit-scrollbar-thumb:hover {
            background: #a1a1a1;
          }
          .file-preview-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: white;
            margin-bottom: 8px;
          }
          .file-preview-info {
            display: flex;
            align-items: center;
            flex: 1;
          }
          .file-preview-thumbnail {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 6px;
            margin-right: 12px;
          }
          .file-preview-details {
            flex: 1;
          }
          .file-preview-name {
            font-weight: 500;
            font-size: 14px;
            color: #374151;
            margin-bottom: 2px;
          }
          .file-preview-size {
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
          }
          .description-input {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
            resize: vertical;
            min-height: 60px;
          }
          .category-input {
            appearance: auto;
          }
          .remove-file-btn {
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          .remove-file-btn:hover {
            background: #dc2626;
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
          
          /* Mobile Responsive Styles */
          .mobile-menu-btn {
            display: none;
            background: none;
            border: none;
            font-size: 18px;
            color: #374151;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
          }
          .mobile-menu-btn:hover {
            background: #f3f4f6;
          }
          
          @media (max-width: 768px) {
            /* Mobile Layout */
            .mobile-menu-btn {
              display: block;
            }
            
            /* Hide sidebar by default on mobile */
            .mobile-sidebar {
              position: fixed;
              top: 0;
              left: -300px;
              width: 280px;
              height: 100vh;
              z-index: 1000;
              transition: left 0.3s ease;
              background: white;
              box-shadow: 2px 0 10px rgba(0,0,0,0.1);
            }
            .mobile-sidebar.open {
              left: 0;
            }
            
            /* Mobile overlay */
            .mobile-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background: rgba(0,0,0,0.5);
              z-index: 999;
              display: none;
            }
            .mobile-overlay.show {
              display: block;
            }
            
            /* Mobile main content */
            .mobile-main {
              width: 100%;
              margin-left: 0;
            }
            
            /* Mobile header adjustments */
            .mobile-header h1 {
              font-size: 1.5rem;
            }
            .mobile-header .search-controls {
              flex-direction: column;
              gap: 8px;
              width: 100%;
            }
            .mobile-header .search-controls input {
              width: 100%;
            }
            
            /* Mobile upload area */
            .upload-area {
              padding: 20px;
              font-size: 14px;
            }
            .upload-area i {
              font-size: 2rem !important;
            }
            
            /* Mobile file preview */
            #previewContainer {
              max-height: 300px;
            }
            .file-preview-item {
              flex-direction: column;
              align-items: flex-start;
              padding: 16px;
            }
            .file-preview-info {
              width: 100%;
              margin-bottom: 12px;
            }
            .file-preview-thumbnail {
              width: 80px;
              height: 80px;
            }
            .description-input {
              min-height: 80px;
              font-size: 16px; /* Prevents zoom on iOS */
            }
            .category-input {
              font-size: 16px; /* Prevents zoom on iOS */
            }
            
            /* Mobile buttons */
            #uploadBtn, #clearBtn {
              width: 100%;
              margin: 8px 0;
              padding: 12px;
              font-size: 16px;
            }
            
            /* Mobile table - make it horizontally scrollable */
            .table-container {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .excel-table {
              min-width: 800px; /* Ensure table doesn't get too compressed */
            }
            .excel-table th,
            .excel-table td {
              padding: 8px 4px;
              font-size: 12px;
            }
            .image-cell img {
              width: 50px;
              height: 35px;
            }
            .description-cell {
              min-width: 200px;
            }
            .description-cell textarea {
              font-size: 16px; /* Prevents zoom on iOS */
            }
            .action-btn {
              padding: 6px 8px;
              font-size: 11px;
            }
            
            /* Mobile bulk actions */
            .bulk-actions-bar {
              flex-direction: column;
              gap: 8px;
            }
            .bulk-actions-bar > div {
              width: 100%;
            }
            
            /* Mobile pagination */
            #paginationControls {
              flex-direction: column;
              gap: 8px;
            }
            #pageNumbers {
              justify-content: center;
            }
            
            /* Mobile category management */
            #categoryModal > div {
              width: 90vw;
              margin: 20px;
            }
            
            /* Touch improvements */
            .category-item, .filter-item {
              padding: 12px;
              font-size: 16px;
            }
            .action-buttons {
              gap: 8px;
            }
            
            /* Mobile-specific scrolling */
            .mobile-main {
              -webkit-overflow-scrolling: touch;
            }
          }
          
          @media (max-width: 480px) {
            /* Extra small screens (iPhone SE, etc.) */
            .mobile-header h1 {
              font-size: 1.25rem;
            }
            .file-preview-details {
              padding-left: 0;
            }
            .file-preview-name {
              font-size: 13px;
            }
            .excel-table th,
            .excel-table td {
              padding: 6px 3px;
              font-size: 11px;
            }
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Mobile Overlay -->
        <div id="mobileOverlay" class="mobile-overlay"></div>
        
        <div class="flex h-screen">
            <!-- Sidebar -->
            <div id="sidebar" class="w-64 bg-white shadow-md p-4 overflow-y-auto mobile-sidebar">
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
            <div class="flex-1 flex flex-col overflow-hidden mobile-main">
                <!-- Header -->
                <div class="bg-white shadow-sm p-4 mobile-header">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <button id="mobileMenuBtn" class="mobile-menu-btn mr-3">
                                <i class="fas fa-bars"></i>
                            </button>
                            <h1 class="text-2xl font-bold text-gray-800">
                                <i class="fas fa-chart-bar mr-2"></i>
                                Image Chart Manager
                            </h1>
                        </div>
                        
                        <!-- Search and Controls -->
                        <div class="flex items-center gap-4 search-controls">
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
                <div class="flex-1 p-4 overflow-y-auto">
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

                <!-- Bulk Actions Bar -->
                <div id="bulkActionsBar" class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 hidden">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <span id="selectionCount" class="text-sm font-medium text-blue-800">0 images selected</span>
                            <button id="selectAllBtn" class="text-sm text-blue-600 hover:text-blue-800 underline">Select All</button>
                            <button id="deselectAllBtn" class="text-sm text-blue-600 hover:text-blue-800 underline">Deselect All</button>
                        </div>
                        <div class="flex items-center gap-2">
                            <button id="bulkDownloadBtn" class="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700 transition-colors">
                                <i class="fas fa-download mr-2"></i>
                                Download Selected
                            </button>
                            <button id="bulkDeleteBtn" class="bg-red-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-red-700 transition-colors">
                                <i class="fas fa-trash mr-2"></i>
                                Delete Selected
                            </button>
                        </div>
                    </div>
                </div>

                <div class="overflow-auto table-container" style="max-height: 70vh;">
                    <table class="excel-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;">
                                    <input type="checkbox" id="selectAllCheckbox" title="Select All">
                                </th>
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
                                <td colspan="8" class="text-center py-8 text-gray-500">
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

        <!-- Add/Edit Category Modal -->
        <div id="categoryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-96">
                <h3 id="categoryModalTitle" class="text-lg font-semibold mb-4">Add New Category</h3>
                <form id="categoryForm">
                    <input type="hidden" id="categoryId">
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
                        <button type="submit" id="categorySubmitBtn" class="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700">
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
        <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
        <script src="/static/app.js"></script>
        
        <!-- Mobile Menu JavaScript -->
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const mobileMenuBtn = document.getElementById('mobileMenuBtn');
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            
            function toggleMobileMenu() {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('show');
                document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
            }
            
            function closeMobileMenu() {
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
                document.body.style.overflow = '';
            }
            
            mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
            overlay?.addEventListener('click', closeMobileMenu);
            
            // Close menu when clicking sidebar links on mobile
            sidebar?.addEventListener('click', function(e) {
                if (window.innerWidth <= 768 && e.target.closest('.category-item')) {
                    setTimeout(closeMobileMenu, 300);
                }
            });
            
            // Handle window resize
            window.addEventListener('resize', function() {
                if (window.innerWidth > 768) {
                    closeMobileMenu();
                }
            });
        });
        </script>
    </body>
    </html>
  `)
})

export default app