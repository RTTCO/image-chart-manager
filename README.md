# imageref - Image Reference Manager

## Project Overview
- **Name**: imageref (Image Reference Manager)
- **Goal**: Excel-like image management application with theme field capability and ultra-safe editing interface
- **Features**: Theme-based organization, bulk upload, safe single-button editing, category management, mobile optimization

## URLs
- **Production**: https://a6910f5b.imageref.pages.dev
- **GitHub**: https://github.com/RTTCO/image-chart-manager
- **API Health Check**: https://a6910f5b.imageref.pages.dev/api/categories

## Currently Completed Features

✅ **Theme Field System**
- Add themes during upload (e.g., "nature", "business", "portrait")
- Theme column in main table with inline editing
- Search functionality includes themes
- Database migration applied to production

✅ **Ultra-Safe Single-Button Edit Interface**
- Only ONE edit button visible by default (prevents accidental edits)
- Delete button only appears when in edit mode (prevents accidental deletions)
- Edit ALL fields together (description, theme, category)
- Click edit → becomes save button (green) + delete button appears
- Click save → saves all changes, returns to read-only mode
- Keyboard shortcuts: Ctrl+Enter saves, Escape cancels

✅ **Bulk Image Upload**
- Drag & drop multiple images with file preview
- Individual description and theme input for each image
- Category selection per image
- Client-side image compression for large iPhone photos
- Progress tracking and error handling

✅ **Excel-Like Interface**
- Sortable table with image thumbnails
- Theme column with inline editing capabilities
- Category badges with color coding
- Read-only display prevents accidental changes

✅ **Enhanced Search & Organization**
- Search across descriptions, filenames, AND themes
- Category system with color-coded badges
- Mobile-responsive design optimized for iPhone
- Pagination for handling thousands of images

✅ **Data Architecture**
- Cloudflare D1 database with theme field
- Base64 image storage in SQLite (no external storage dependencies)
- Category management with color coding
- Robust migration system

## Functional Entry URIs

### API Endpoints
| Method | Path | Parameters | Description |
|--------|------|------------|-------------|
| GET | `/api/images` | `?page=1&limit=50&category=all&search=term` | Get paginated images with theme data |
| POST | `/api/upload` | FormData: `images[]`, `descriptions[]`, `themes[]`, `categoryIds[]` | Upload with themes |
| PUT | `/api/images/:id` | JSON: `{description?, theme?, category_id?}` | Update any field including theme |
| DELETE | `/api/images/:id` | None | Delete image and all metadata |
| GET | `/api/images/:id/file` | None | Get base64 image for display |
| GET | `/api/images/:id/download` | None | Download original image file |
| GET | `/api/categories` | None | Get all categories with image counts |
| POST | `/api/categories` | JSON: `{name, color, description?}` | Create new category |

### Frontend Pages
| Path | Description |
|------|-------------|
| `/` | Main application with ultra-safe edit interface |
| `/static/app.js` | Frontend JavaScript with single-button edit system |
| `/static/styles.css` | Custom CSS with mobile optimization |

## Data Architecture

### Enhanced Data Models
```sql
-- Image entries with theme field
image_entries (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  theme TEXT DEFAULT '',              -- NEW: Theme field for organization
  category_id INTEGER,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  row_order INTEGER NOT NULL,
  image_data TEXT NOT NULL,           -- Base64 encoded image
  status TEXT DEFAULT 'active',
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Categories for organization
categories (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Storage Services
- **Cloudflare D1**: SQLite database for all metadata including themes
- **Base64 Storage**: Images stored directly in database (no external storage)
- **Local Development**: Uses `.wrangler/state/v3/d1` for development SQLite

### Data Flow
1. **Upload**: Images compressed → Base64 encoded → D1 database with themes
2. **Display**: D1 metadata → Generate table with theme column
3. **Edit**: Single-button triggers edit mode for all fields → Save to D1
4. **Search**: Query descriptions, filenames, AND themes

## Ultra-Safe User Interface Guide

### Read-Only Mode (Default)
- **Single Button**: Only blue pencil edit button visible
- **No Accidental Edits**: All fields display as read-only text/badges
- **No Accidental Deletes**: Delete button completely hidden
- **Browse Safely**: Can view thousands of images with zero risk

### Edit Mode (When Edit Button Clicked)
1. **Button Changes**: Blue pencil → Green save icon
2. **Delete Appears**: Red trash button becomes visible
3. **All Fields Editable**: Description, theme, and category all become editable
4. **Visual Feedback**: Light blue background indicates editing state
5. **Auto Focus**: Description field automatically focused

### Saving Changes
- **Click Save Button**: Saves all three fields in one operation
- **Keyboard Shortcut**: Ctrl+Enter from any field saves all changes
- **Automatic Return**: Success automatically returns to safe read-only mode
- **Visual Feedback**: Green flash indicates successful save

### Canceling Changes
- **Escape Key**: Immediately cancels all changes and returns to read-only mode
- **Revert Values**: All fields return to their original values
- **Safe Return**: Delete button disappears, edit mode exits

### Theme Usage Examples
- **Photography**: "portrait", "landscape", "macro", "street"
- **Business**: "marketing", "products", "team", "events"  
- **Personal**: "family", "vacation", "pets", "hobbies"
- **Creative**: "abstract", "minimalist", "colorful", "black-and-white"

## Deployment

### Current Status
- **Platform**: Cloudflare Pages (Production)
- **Status**: ✅ Live & Active
- **Tech Stack**: Hono + TypeScript + TailwindCSS + Cloudflare D1
- **Last Updated**: August 29, 2025
- **Database**: Theme migration applied to production

### Production URLs
- **Main App**: https://a6910f5b.imageref.pages.dev
- **API Test**: https://a6910f5b.imageref.pages.dev/api/categories
- **GitHub**: https://github.com/RTTCO/image-chart-manager

### Local Development Commands
```bash
# Install dependencies
npm install

# Apply database migrations (with theme field)
npx wrangler d1 migrations apply image-chart-db --local

# Build project
npm run build  

# Start development server
pm2 start ecosystem.config.cjs

# Access at: http://localhost:3000
```

### Production Deployment Commands
```bash
# Build and deploy
npm run build
npx wrangler pages deploy dist --project-name imageref

# Apply database migrations to production  
npx wrangler d1 migrations apply image-chart-db

# Verify deployment
curl https://a6910f5b.imageref.pages.dev/api/categories
```

## Security Features

### Ultra-Safe Interface Design
- **No Accidental Edits**: Fields are read-only by default
- **No Accidental Deletes**: Delete button only appears in edit mode
- **Deliberate Actions**: Must consciously click edit to make changes
- **Visual Confirmation**: Clear visual states for read/edit modes
- **Escape Hatch**: Always can cancel with Escape key

### Data Protection
- **Input Validation**: All uploads validated for image types and size
- **Error Recovery**: Failed saves automatically revert to original values
- **Visual Feedback**: Clear success/error states with color coding
- **Atomic Operations**: All field updates happen in single database transaction

## Mobile Optimization

### iPhone-Specific Features
- **Touch-Friendly**: Large button targets for mobile interaction
- **Image Compression**: Automatic compression prevents upload failures
- **Responsive Layout**: Horizontal scrolling table for mobile screens
- **Font Size**: 16px inputs prevent iOS zoom-in behavior
- **Safe Interaction**: Single-button system perfect for touch interfaces

### Mobile Upload Flow
1. **Touch Upload Area**: Opens camera or photo library
2. **Select Multiple**: Choose multiple photos from library
3. **Add Themes**: Type themes for each image using mobile keyboard
4. **Upload**: Compressed images uploaded with progress tracking
5. **Safe Browsing**: View and organize images with touch-safe interface

## Recommended Next Steps

### Priority 1: Advanced Features
1. **Bulk Operations**: Select multiple images for bulk theme/category changes
2. **ZIP Downloads**: Download selected images as ZIP file
3. **Advanced Search**: Filter by theme combinations, date ranges
4. **Import/Export**: CSV export of image metadata

### Priority 2: Enhanced Organization  
1. **Theme Suggestions**: Auto-suggest themes based on existing data
2. **Smart Categories**: AI-powered category suggestions
3. **Batch Theme Assignment**: Apply themes to multiple images at once
4. **Theme Analytics**: Most used themes, organization insights

### Priority 3: Performance & Scale
1. **Thumbnail Generation**: Generate and cache image thumbnails
2. **Lazy Loading**: Load images as user scrolls through thousands
3. **Search Optimization**: Full-text search across all fields
4. **Backup System**: Automated backup of entire database

## Technical Architecture

### Backend (Hono Framework)
- **Ultra-Safe API**: Single endpoint updates multiple fields atomically
- **Theme Integration**: Search and filter capabilities include theme field
- **Base64 Storage**: Eliminates external storage dependencies
- **Error Handling**: Comprehensive validation and error recovery

### Frontend (Vanilla JavaScript)  
- **Single-Button System**: Prevents accidental edits and deletions
- **State Management**: Clear visual states for read/edit modes
- **Mobile Optimization**: Touch-friendly interface with safe interactions
- **Real-time Feedback**: Immediate visual confirmation of all actions

### Data Layer
- **Enhanced Schema**: Theme field integrated into existing structure
- **Migration System**: Safe database updates with rollback capability
- **Search Optimization**: Multi-field search including themes
- **Atomic Updates**: All field changes happen in single transaction