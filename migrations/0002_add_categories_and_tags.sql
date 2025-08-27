-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags table  
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Image-Tag junction table (many-to-many)
CREATE TABLE IF NOT EXISTS image_tags (
  image_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES image_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Add category_id to image_entries table
ALTER TABLE image_entries ADD COLUMN category_id INTEGER DEFAULT NULL;
ALTER TABLE image_entries ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE image_entries ADD COLUMN priority INTEGER DEFAULT 0;

-- Add foreign key constraint (conceptual - SQLite doesn't enforce)
-- FOREIGN KEY (category_id) REFERENCES categories(id)

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_image_entries_category_id ON image_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_image_entries_status ON image_entries(status);
CREATE INDEX IF NOT EXISTS idx_image_tags_image_id ON image_tags(image_id);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_id ON image_tags(tag_id);