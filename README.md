# Image Chart Manager

## Project Overview
- **Name**: Image Chart Manager  
- **Goal**: Excel-like image management interface with bulk upload, descriptions, and file operations
- **Features**: Drag & drop upload, Excel-style table view, right-click context menus, image preview, bulk operations

## URLs
- **Local Development**: https://3000-ispqsd9yke23vlx3ry47a.e2b.dev
- **API Health Check**: https://3000-ispqsd9yke23vlx3ry47a.e2b.dev/api/images
- **GitHub**: Not yet deployed

## Currently Completed Features
✅ **Bulk Image Upload**
- Drag & drop multiple images
- File browser selection
- Progress tracking during upload
- File validation and preview

✅ **Excel-Like Interface**
- Sortable table with image thumbnails
- Inline description editing
- File information display (size, type, date)
- Row numbering and responsive design

✅ **Image Management**
- Right-click context menu on images
- Download individual images
- Delete images with confirmation
- Real-time table updates

✅ **Data Persistence** 
- Cloudflare D1 SQLite database for metadata
- Cloudflare R2 bucket for image storage
- Local development with --local flag

## Functional Entry URIs

### API Endpoints
| Method | Path | Parameters | Description |
|--------|------|------------|-------------|
| GET | `/api/images` | None | Get all image entries |
| POST | `/api/upload` | FormData: `images[]`, `descriptions[]` | Upload multiple images with descriptions |
| PUT | `/api/images/:id` | JSON: `{description}` | Update image description |
| DELETE | `/api/images/:id` | None | Delete image and metadata |
| GET | `/api/images/:id/file` | None | Get image file for display |
| GET | `/api/images/:id/download` | None | Download image file |

### Frontend Pages
| Path | Description |
|------|-------------|
| `/` | Main application interface |
| `/static/app.js` | Frontend JavaScript |
| `/static/styles.css` | Custom CSS styles |

## Data Architecture

### Data Models
```sql
-- Image entries table
image_entries (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,           -- Generated unique filename
  original_name TEXT NOT NULL,      -- Original uploaded filename  
  file_size INTEGER NOT NULL,       -- File size in bytes
  mime_type TEXT NOT NULL,          -- Image MIME type
  description TEXT DEFAULT '',      -- User description
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  row_order INTEGER NOT NULL       -- Display order
)
```

### Storage Services
- **Cloudflare D1**: SQLite database for image metadata and descriptions
- **Cloudflare R2**: S3-compatible object storage for image files
- **Local Development**: Uses `.wrangler/state/v3/d1` for local SQLite

### Data Flow
1. **Upload**: Files → R2 storage + metadata → D1 database
2. **Display**: D1 metadata → Generate table → R2 URLs for images
3. **Edit**: Description updates → D1 database
4. **Delete**: Remove from R2 storage + D1 metadata

## User Guide

### Uploading Images
1. **Drag & Drop**: Drag multiple image files to the upload area
2. **Browse**: Click upload area to open file browser  
3. **Preview**: Review selected files and add descriptions
4. **Upload**: Click "Upload All Files" to save to cloud storage

### Managing Images  
1. **View Table**: All uploaded images appear in Excel-like table
2. **Edit Descriptions**: Click in description column to edit text
3. **Right-Click Menu**: Right-click any image for options:
   - **Download**: Save original file to computer
   - **Delete**: Remove image (requires confirmation)
4. **Refresh**: Click refresh button to reload table

### Features Not Yet Implemented
❌ **Advanced Sorting**: Column-based sorting controls
❌ **Bulk Operations**: Select multiple images for bulk delete/download
❌ **Image Filters**: Filter by date, size, type
❌ **Reorder Rows**: Drag & drop row reordering
❌ **Export Options**: Export metadata as CSV/Excel
❌ **Search Functionality**: Search descriptions and filenames
❌ **Image Categories**: Tag/category system
❌ **Production Deployment**: Deploy to Cloudflare Pages

## Deployment

### Current Status
- **Platform**: Local Development (Cloudflare Workers/Pages compatible)
- **Status**: ✅ Active (Local)
- **Tech Stack**: Hono + TypeScript + TailwindCSS + Cloudflare D1/R2
- **Last Updated**: August 27, 2025

### Local Development Setup
```bash
# Install dependencies  
npm install

# Apply database migrations
npm run db:migrate:local

# Build project
npm run build

# Start development server
pm2 start ecosystem.config.cjs

# View application
# Visit: https://3000-ispqsd9yke23vlx3ry47a.e2b.dev
```

### Production Deployment (Next Steps)
```bash
# Setup Cloudflare API token
npx wrangler whoami

# Create production database
npx wrangler d1 create image-chart-db

# Create R2 bucket
npx wrangler r2 bucket create image-uploads

# Apply production migrations
npm run db:migrate:prod

# Deploy to Cloudflare Pages
npm run deploy:prod
```

## Recommended Next Steps for Development

### Priority 1: Production Deployment
1. Configure Cloudflare API credentials
2. Create production D1 database and R2 bucket
3. Deploy to Cloudflare Pages
4. Test all functionality in production

### Priority 2: User Experience Enhancements  
1. Add column sorting functionality
2. Implement search/filter capabilities
3. Add bulk selection and operations
4. Improve mobile responsiveness

### Priority 3: Advanced Features
1. Drag & drop row reordering
2. Image categorization system  
3. Export functionality (CSV/Excel)
4. Image editing capabilities
5. User authentication and multi-tenancy

### Priority 4: Performance & Scale
1. Image thumbnail generation
2. Pagination for large datasets
3. CDN optimization for images
4. Background processing for uploads

## Technical Architecture

### Backend (Hono Framework)
- **Image Upload**: Handles multipart form data with progress tracking
- **File Management**: Integrates R2 storage with D1 metadata  
- **API Design**: RESTful endpoints with proper error handling
- **Security**: Input validation and file type restrictions

### Frontend (Vanilla JavaScript)
- **Interactive Table**: Excel-like interface with inline editing
- **Upload UX**: Drag & drop with progress and preview
- **Context Menus**: Right-click operations on images
- **Responsive Design**: Mobile-friendly layout with TailwindCSS

### Data Layer
- **Database**: Cloudflare D1 SQLite for metadata
- **Storage**: Cloudflare R2 for scalable image storage  
- **Local Dev**: Automatic local SQLite database creation
- **Migrations**: Version-controlled schema changes