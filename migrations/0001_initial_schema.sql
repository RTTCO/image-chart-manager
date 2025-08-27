-- Image chart entries table
CREATE TABLE IF NOT EXISTS image_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  row_order INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_image_entries_row_order ON image_entries(row_order);
CREATE INDEX IF NOT EXISTS idx_image_entries_upload_date ON image_entries(upload_date);