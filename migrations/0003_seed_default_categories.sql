-- Insert default categories
INSERT OR IGNORE INTO categories (name, color, description) VALUES 
  ('Uncategorized', '#6b7280', 'Images that haven''t been categorized yet'),
  ('Clients', '#3b82f6', 'Client-related images and projects'),
  ('Products', '#10b981', 'Product photos and showcases'),
  ('Events', '#f59e0b', 'Event photography and documentation'),
  ('Marketing', '#ef4444', 'Marketing materials and campaigns'),
  ('Team', '#8b5cf6', 'Team photos and company events'),
  ('Archive', '#64748b', 'Archived or historical images');

-- Insert some default tags
INSERT OR IGNORE INTO tags (name) VALUES 
  ('draft'),
  ('final'),
  ('approved'),
  ('needs-review'),
  ('high-priority'),
  ('featured'),
  ('social-media'),
  ('print'),
  ('web'),
  ('mobile');