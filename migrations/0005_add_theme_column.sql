-- Add theme column to image_entries table
ALTER TABLE image_entries ADD COLUMN theme TEXT DEFAULT '';

-- Create index on theme for better performance
CREATE INDEX IF NOT EXISTS idx_images_theme ON image_entries(theme);