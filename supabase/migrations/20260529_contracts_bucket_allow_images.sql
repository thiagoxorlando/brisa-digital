-- Allow image MIME types in the contracts storage bucket.
--
-- The receipt upload flow (upload-receipt/route.ts) supports PDF and images,
-- but the bucket was restricted to application/pdf only. Any image upload
-- (PNG/JPEG/WEBP — common for payment screenshots in Brazil) would be
-- rejected by Supabase Storage even through a signed upload URL.
--
-- Run this in Supabase SQL Editor.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]
WHERE id = 'contracts';
