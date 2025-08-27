-- Add image_data column for base64 storage
ALTER TABLE image_entries ADD COLUMN image_data TEXT DEFAULT NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_image_entries_filename ON image_entries(filename);