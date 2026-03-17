-- Add avatar_url column to users table for storing Google profile pictures
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
