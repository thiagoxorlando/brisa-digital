-- Create the talent-media storage bucket as PUBLIC.
--
-- Previously this bucket was created manually via the Supabase dashboard
-- (no migration existed), leaving its access policy undefined.
-- Profile photos (avatars/*) are not sensitive and must be publicly
-- accessible so <img> tags load without authentication.
--
-- Safe to rerun: uses ON CONFLICT DO UPDATE.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'talent-media',
  'talent-media',
  true,
  10485760,   -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage INSERT policy: users upload to their own avatar/submission paths ──

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'talent_media_authenticated_insert'
  ) THEN
    CREATE POLICY talent_media_authenticated_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'talent-media'
        AND (
          -- Talent/agency avatar: avatars/<user_id>.<ext>
          name LIKE 'avatars/' || auth.uid()::text || '.%'
          OR
          -- Agency logo: agency-avatars/<user_id>.<ext>
          name LIKE 'agency-avatars/' || auth.uid()::text || '.%'
          OR
          -- Admin profile photo
          name LIKE 'admin-avatars/' || auth.uid()::text || '.%'
          OR
          -- Talent submission media
          name LIKE 'submissions/' || auth.uid()::text || '/%'
        )
      );
  END IF;
END $$;

-- ── Storage UPDATE policy (upsert / replace) ─────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'talent_media_authenticated_update'
  ) THEN
    CREATE POLICY talent_media_authenticated_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'talent-media'
        AND (
          name LIKE 'avatars/' || auth.uid()::text || '.%'
          OR name LIKE 'agency-avatars/' || auth.uid()::text || '.%'
          OR name LIKE 'admin-avatars/' || auth.uid()::text || '.%'
          OR name LIKE 'submissions/' || auth.uid()::text || '/%'
        )
      );
  END IF;
END $$;

-- ── Storage SELECT policy: public bucket — everyone can read ─────────────────
-- Public buckets bypass RLS for SELECT, but adding an explicit policy is
-- recommended so Supabase shows the intent clearly in the dashboard.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'talent_media_public_select'
  ) THEN
    CREATE POLICY talent_media_public_select
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'talent-media');
  END IF;
END $$;
