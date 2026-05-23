-- =============================================================================
-- Fix Contract Locations
-- Purpose  : Replace keyboard-mash and blank location fields in contracts
--            with real Brazilian city names based on the job title context.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role
--
-- PREVIEW FIRST — run the SELECT below before running the UPDATE block.
-- =============================================================================

-- PREVIEW: show all contracts with ugly location values
SELECT
  id::text,
  status,
  LEFT(coalesce(job_description, ''), 60) AS job_description_preview,
  location,
  created_at::date
FROM contracts
WHERE location ILIKE '%asd%'
   OR location ILIKE '%sdf%'
   OR location ILIKE '%qwe%'
   OR location ILIKE '%zxc%'
   OR location ILIKE '%xcv%'
   OR location ILIKE '%dqd%'
   OR location ILIKE '%test%'
   OR location ILIKE '%lorem%'
   OR location ILIKE '%seed%'
   OR location ILIKE '%demo%'
   OR location ILIKE '%fake%'
   OR location ILIKE '%dummy%'
   OR location ILIKE '%xxx%'
   OR location ~ '(.)\1\1'
   OR (location IS NOT NULL AND length(trim(location)) <= 3 AND location !~ '^\s*$')
AND deleted_at IS NULL
ORDER BY created_at;


-- FIX: assign real Brazilian city based on job title keywords, fallback to rotating cities
DO $$
DECLARE
  v_cities text[] := ARRAY[
    'São Paulo, SP',
    'Rio de Janeiro, RJ',
    'Belo Horizonte, MG',
    'Curitiba, PR',
    'Porto Alegre, RS',
    'Salvador, BA',
    'Fortaleza, CE',
    'Recife, PE',
    'Brasília, DF',
    'Campinas, SP'
  ];
  v_idx  int := 0;
  v_id   uuid;
  v_title text;
  v_city  text;
BEGIN
  FOR v_id, v_title IN (
    SELECT c.id, COALESCE(j.title, c.job_description, '')
    FROM contracts c
    LEFT JOIN jobs j ON j.id = c.job_id
    WHERE (
      c.location ILIKE '%asd%'
      OR c.location ILIKE '%sdf%'
      OR c.location ILIKE '%qwe%'
      OR c.location ILIKE '%zxc%'
      OR c.location ILIKE '%xcv%'
      OR c.location ILIKE '%dqd%'
      OR c.location ILIKE '%test%'
      OR c.location ILIKE '%lorem%'
      OR c.location ILIKE '%seed%'
      OR c.location ILIKE '%demo%'
      OR c.location ILIKE '%fake%'
      OR c.location ILIKE '%dummy%'
      OR c.location ILIKE '%xxx%'
      OR c.location ~ '(.)\1\1'
      OR (c.location IS NOT NULL AND length(trim(c.location)) <= 3 AND c.location !~ '^\s*$')
    )
    AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
  ) LOOP
    v_idx := v_idx + 1;

    -- Try to infer city from job title keywords
    v_city := CASE
      WHEN v_title ILIKE '%São Paulo%' OR v_title ILIKE '%Sao Paulo%'
        OR v_title ILIKE '%Natura%'    OR v_title ILIKE '%XP Invest%'
        OR v_title ILIKE '%Ambev%'     OR v_title ILIKE '%Unilever%'
        OR v_title ILIKE '%iFood%'     OR v_title ILIKE '%BMW%'
        OR v_title ILIKE '%Vogue%'     OR v_title ILIKE '%ABRASEL%'
        OR v_title ILIKE '%Feira Auto%'
        THEN 'São Paulo, SP'
      WHEN v_title ILIKE '%Rio%'       OR v_title ILIKE '%Globo%'
        OR v_title ILIKE '%Copacabana%'
        THEN 'Rio de Janeiro, RJ'
      WHEN v_title ILIKE '%Salvador%'  OR v_title ILIKE '%Havaianas%'
        OR v_title ILIKE '%Bahia%'
        THEN 'Salvador, BA'
      WHEN v_title ILIKE '%Brasília%'  OR v_title ILIKE '%corporativo%'
        THEN 'Brasília, DF'
      WHEN v_title ILIKE '%Porto Alegre%' OR v_title ILIKE '%RS%'
        THEN 'Porto Alegre, RS'
      WHEN v_title ILIKE '%Recife%'    OR v_title ILIKE '%Pernambuco%'
        THEN 'Recife, PE'
      WHEN v_title ILIKE '%Fortaleza%' OR v_title ILIKE '%Ceará%'
        THEN 'Fortaleza, CE'
      WHEN v_title ILIKE '%Belo Horizonte%' OR v_title ILIKE '%BH%' OR v_title ILIKE '%MG%'
        THEN 'Belo Horizonte, MG'
      ELSE
        -- Rotate through cities for anything unrecognized
        v_cities[((v_idx - 1) % array_length(v_cities, 1)) + 1]
    END;

    UPDATE contracts
    SET location = v_city
    WHERE id = v_id;

  END LOOP;

  RAISE NOTICE 'Contracts with location fixed: %', v_idx;
END $$;


-- VERIFY: confirm no ugly locations remain
SELECT
  count(*)::int AS "ugly_locations_remaining",
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — some locations still need review' END AS status
FROM contracts
WHERE (
  location ILIKE '%asd%' OR location ILIKE '%sdf%' OR location ILIKE '%qwe%' OR
  location ILIKE '%zxc%' OR location ILIKE '%dqd%' OR location ILIKE '%test%' OR
  location ILIKE '%lorem%' OR location ILIKE '%seed%' OR location ILIKE '%demo%' OR
  location ILIKE '%dummy%' OR location ~ '(.)\1\1' OR
  (location IS NOT NULL AND length(trim(location)) <= 3 AND location !~ '^\s*$')
)
AND deleted_at IS NULL;
