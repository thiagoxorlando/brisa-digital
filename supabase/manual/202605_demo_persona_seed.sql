-- =============================================================================
-- BrisaHub Demo Persona Seed
-- Purpose  : Polish existing demo data into investor-ready personas.
--            UPDATE ONLY — no new rows, no DELETE, no FK changes.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role
--
-- WHAT THIS DOES
--   - Renames ugly test agencies/contacts to professional Brazilian personas
--   - Polishes talent profile names, bios, cities
--   - Rewrites test job titles and descriptions with realistic campaigns
--   - Renames test premium workspace names (NOT slugs — slugs appear in URLs)
--   - Replaces test job_description in contracts (text only, financial untouched)
--   - Replaces test job_title in bookings (display field only)
--   - Rewrites ugly dispute reasons with professional Portuguese copy
--   - Replaces test support conversation subjects
--
-- WHAT THIS DOES NOT DO
--   - Does NOT change any UUID, foreign key, or relationship
--   - Does NOT change financial amounts (payment_amount, commission_amount, net_amount)
--   - Does NOT change contract status, booking status, or dispute status
--   - Does NOT change workspace slugs (slugs appear in notification links and URLs)
--   - Does NOT touch auth.users, profiles.role, wallet_balance, or escrow logic
--   - Does NOT create new rows
--   - Does NOT delete rows
--
-- RUN ORDER
--   1. 202605_clean_demo_data.sql   (remove [QA seed] / [QA test] tagged rows)
--   2. THIS FILE                    (polish remaining data)
--   3. 202605_demo_health_check.sql (verify)
--
-- IDEMPOTENT
--   Safe to run multiple times. Each block targets ugly patterns — if a row
--   was already polished, it won't match the ILIKE patterns and won't be changed.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — AGENCIES
-- Assigns professional agency names to agencies with ugly/test names.
-- Up to 4 agencies are renamed with distinct personas.
-- =============================================================================

DO $$
DECLARE
  v_companies  text[] := ARRAY[
    'BrisaHub Studio',
    'Spark Casting',
    'Nova Produções',
    'Élite Eventos'
  ];
  v_contacts   text[] := ARRAY[
    'Mariana Costa',
    'Rafael Mendes',
    'Juliana Neves',
    'Carlos Rodrigues'
  ];
  v_cities     text[] := ARRAY[
    'São Paulo',
    'Rio de Janeiro',
    'Belo Horizonte',
    'São Paulo'
  ];
  v_descs      text[] := ARRAY[
    'Agência especializada em campanhas promocionais, eventos corporativos e produções audiovisuais. Atendemos marcas nacionais e internacionais com excelência.',
    'Casting e produção de talentos para campanhas publicitárias, editorial de moda e ativações de marca em todo o Brasil.',
    'Produtora criativa focada em eventos de experiência, lançamentos de produto e campanhas 360° para o varejo.',
    'Especialistas em eventos corporativos de alto padrão, feiras, congressos e produções institucionais.'
  ];
  r            record;
  v_idx        int := 0;
BEGIN
  FOR r IN
    SELECT id FROM agencies
    WHERE company_name ILIKE '%test%'
       OR company_name ILIKE '%asd%'
       OR company_name ILIKE '%qa%'
       OR company_name ILIKE '%seed%'
       OR company_name ILIKE '%lorem%'
       OR company_name ILIKE '%demo%'
       OR company_name ILIKE '%temp%'
       OR company_name IS NULL
       OR company_name = ''
    ORDER BY created_at ASC
    LIMIT 4
  LOOP
    v_idx := v_idx + 1;

    UPDATE agencies SET
      company_name = v_companies[v_idx],
      contact_name = CASE
        WHEN contact_name IS NULL OR contact_name = '' OR contact_name ILIKE '%test%' OR contact_name ILIKE '%asd%'
        THEN v_contacts[v_idx]
        ELSE contact_name
      END,
      city = CASE
        WHEN city IS NULL OR city = '' OR city ILIKE '%test%' OR city ILIKE '%asd%'
        THEN v_cities[v_idx]
        ELSE city
      END,
      description = CASE
        WHEN description IS NULL OR description = '' OR description ILIKE '%test%' OR description ILIKE '%lorem%'
        THEN v_descs[v_idx]
        ELSE description
      END
    WHERE id = r.id;

    RAISE NOTICE 'Agency % → "%"', r.id, v_companies[v_idx];
  END LOOP;
  RAISE NOTICE '--- Section 1: polished % agencies ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 2 — TALENT PROFILES
-- Assigns professional Brazilian names, bios, and cities to talent profiles
-- with ugly/test content. Up to 6 profiles are renamed.
-- =============================================================================

DO $$
DECLARE
  v_names  text[] := ARRAY[
    'Bianca Martins',
    'Lucas Ferreira',
    'Amanda Rocha',
    'Felipe Alves',
    'Camila Torres',
    'Rodrigo Lima'
  ];
  v_bios   text[] := ARRAY[
    'Modelo e influenciadora de lifestyle com foco em moda, beleza e bem-estar. Experiência em campanhas editoriais e ações de marca. São Paulo.',
    'Ator e apresentador com ampla experiência em produções publicitárias, eventos corporativos e campanhas digitais para marcas nacionais.',
    'Criadora de conteúdo especializada em campanhas de beleza, lifestyle e moda. Portfólio com marcas como Sephora, Renner e Natura.',
    'Músico e artista visual com atuação em eventos corporativos, produções audiovisuais e campanhas digitais para marcas de lifestyle.',
    'Modelo e atriz com experiência em campanhas de moda, shooting fotográfico e produções para publicidade impressa e digital.',
    'Apresentador e comunicador com vasta experiência em eventos corporativos, feiras setoriais e produções institucionais.'
  ];
  v_cities text[] := ARRAY[
    'São Paulo',
    'Rio de Janeiro',
    'São Paulo',
    'Belo Horizonte',
    'Curitiba',
    'Porto Alegre'
  ];
  r        record;
  v_idx    int := 0;
BEGIN
  FOR r IN
    SELECT id FROM talent_profiles
    WHERE full_name ILIKE '%test%'
       OR full_name ILIKE '%asd%'
       OR full_name ILIKE '%qa%'
       OR full_name ILIKE '%seed%'
       OR full_name ILIKE '%lorem%'
       OR full_name ILIKE '%demo%'
       OR full_name IS NULL
       OR full_name = ''
    ORDER BY created_at ASC
    LIMIT 6
  LOOP
    v_idx := v_idx + 1;

    UPDATE talent_profiles SET
      full_name = v_names[v_idx],
      bio = CASE
        WHEN bio IS NULL OR bio = '' OR bio ILIKE '%test%' OR bio ILIKE '%lorem%' OR bio ILIKE '%seed%'
        THEN v_bios[v_idx]
        ELSE bio
      END,
      city = CASE
        WHEN city IS NULL OR city = '' OR city ILIKE '%test%' OR city ILIKE '%asd%'
        THEN v_cities[v_idx]
        ELSE city
      END
    WHERE id = r.id;

    RAISE NOTICE 'Talent % → "%"', r.id, v_names[v_idx];
  END LOOP;
  RAISE NOTICE '--- Section 2: polished % talent profiles ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 3 — JOBS
-- Replaces test job titles and descriptions with realistic Brazilian
-- campaign/event copy. Up to 10 jobs polished.
-- Financial fields (budget), status, and relationships are NOT touched.
-- =============================================================================

DO $$
DECLARE
  v_titles text[] := ARRAY[
    'Campanha Verão Natura 2026',
    'Evento Corporativo XP Investimentos',
    'Ação Promocional Shopping Leblon',
    'Produção Audiovisual Ambev — Brand Day',
    'Feira Automotiva São Paulo 2026',
    'Lançamento Coleção Renner Outono/Inverno',
    'Campanha Digital Bradesco Seguros',
    'Shooting Editorial Beleza — Vogue Brasil',
    'Evento de Lançamento Samsung Galaxy S26',
    'Festival Gastronômico Abrasel SP'
  ];
  v_descs  text[] := ARRAY[
    'Buscamos talentos para campanha de verão com foco em lifestyle, bem-estar e diversidade. Shooting ao ar livre em São Paulo e Rio de Janeiro. Perfil autêntico, comunicativo e com boa presença visual.',
    'Evento corporativo de alto padrão voltado para o público executivo do mercado financeiro. Necessário excelente apresentação, comunicação clara e experiência em contextos formais.',
    'Ação promocional no Shopping Leblon com abordagem qualificada a clientes, demonstração de produtos e distribuição de materiais. Perfil extrovertido, pontual e comunicativo.',
    'Produção audiovisual para campanha institucional de grande alcance. Shooting em estúdio e locações externas no Rio de Janeiro. Experiência prévia em produções comerciais desejável.',
    'Feira automotiva de grande porte com público de compradores e entusiastas. Promotores para atendimento especializado, demonstração de funcionalidades e geração de leads qualificados.',
    'Shooting fotográfico e video look para nova coleção Outono/Inverno. Modelos com experiência em moda editorial, boa versatilidade e disponibilidade para dois dias de produção.',
    'Campanha digital para divulgação de novos produtos de proteção financeira. Criadores de conteúdo com audiência focada em finanças pessoais, lifestyle e planejamento financeiro.',
    'Editorial de beleza de alta visibilidade para publicação nacional. Modelos e maquiadores com portfólio editorial consistente e experiência em produções de alta exigência técnica.',
    'Lançamento oficial do novo Samsung Galaxy no Brasil. Demonstradores com domínio de tecnologia mobile, ótima dicção e perfil dinâmico para atendimento em stand premium.',
    'Festival gastronômico com mais de 50 expositores renomados. Garçons, promotores e recepcionistas experientes para atendimento em estandes e áreas VIP.'
  ];
  r        record;
  v_idx    int := 0;
BEGIN
  FOR r IN
    SELECT id FROM jobs
    WHERE (
      title ILIKE '%test%'
      OR title ILIKE '%asd%'
      OR title ILIKE '%qa%'
      OR title ILIKE '%seed%'
      OR title ILIKE '%lorem%'
      OR title ILIKE '%pdf%'
      OR title ILIKE '%demo%'
      OR title ILIKE '%temp%'
      OR title ILIKE '%fake%'
      OR description ILIKE '%lorem ipsum%'
      OR description ILIKE '%[QA%'
    )
    AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    v_idx := v_idx + 1;

    UPDATE jobs SET
      title = v_titles[v_idx],
      description = CASE
        WHEN description IS NULL OR description = ''
          OR description ILIKE '%lorem%'
          OR description ILIKE '%test%'
          OR description ILIKE '%seed%'
          OR description ILIKE '%[QA%'
          OR description ILIKE '%asd%'
        THEN v_descs[v_idx]
        ELSE description
      END
    WHERE id = r.id;

    RAISE NOTICE 'Job % → "%"', r.id, v_titles[v_idx];
  END LOOP;
  RAISE NOTICE '--- Section 3: polished % jobs ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 4 — PREMIUM WORKSPACES
-- Renames test workspace names to professional names.
-- IMPORTANT: slug is NOT changed — slugs appear in notification links and URLs.
-- Up to 4 workspaces renamed.
-- =============================================================================

DO $$
DECLARE
  v_names text[] := ARRAY[
    'BrisaHub Studio',
    'Spark Workspace',
    'Nova Produções Premium',
    'Élite Casting'
  ];
  r       record;
  v_idx   int := 0;
BEGIN
  FOR r IN
    SELECT id, name FROM premium_workspaces
    WHERE name ILIKE '%test%'
       OR name ILIKE '%asd%'
       OR name ILIKE '%qa%'
       OR name ILIKE '%seed%'
       OR name ILIKE '%lorem%'
       OR name ILIKE '%demo%'
       OR name IS NULL
       OR name = ''
    ORDER BY created_at ASC
    LIMIT 4
  LOOP
    v_idx := v_idx + 1;

    UPDATE premium_workspaces
    SET name = v_names[v_idx]
    WHERE id = r.id;

    RAISE NOTICE 'Workspace % "%"  → "%"', r.id, r.name, v_names[v_idx];
    RAISE NOTICE '  ^ slug unchanged — update links manually if needed';
  END LOOP;
  RAISE NOTICE '--- Section 4: polished % workspaces ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 5 — CONTRACTS (job_description text field only)
-- Replaces test/ugly job description text.
-- FINANCIAL FIELDS ARE NOT TOUCHED: payment_amount, commission_amount, net_amount.
-- =============================================================================

DO $$
DECLARE
  v_descs text[] := ARRAY[
    'Trabalho de modelo para campanha de verão com foco em lifestyle e bem-estar.',
    'Apresentação em evento corporativo de grande porte para público executivo.',
    'Shooting fotográfico para editorial de moda de alta circulação nacional.',
    'Produção audiovisual para campanha institucional de marca líder de mercado.',
    'Ação promocional em ponto de venda com abordagem qualificada ao cliente.',
    'Modelo para lançamento de coleção com shooting em estúdio e locação externa.',
    'Apresentador para evento de tecnologia com público especializado.',
    'Demonstrador para lançamento de produto em feiras e eventos de varejo.'
  ];
  r       record;
  v_idx   int := 0;
BEGIN
  FOR r IN
    SELECT id FROM contracts
    WHERE (
      job_description ILIKE '%test%'
      OR job_description ILIKE '%asd%'
      OR job_description ILIKE '%qa%'
      OR job_description ILIKE '%seed%'
      OR job_description ILIKE '%lorem%'
      OR job_description ILIKE '%pdf%'
      OR job_description ILIKE '%demo%'
    )
    AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 8
  LOOP
    v_idx := v_idx + 1;

    UPDATE contracts
    SET job_description = v_descs[v_idx]
    WHERE id = r.id;

    RAISE NOTICE 'Contract % job_description polished', r.id;
  END LOOP;
  RAISE NOTICE '--- Section 5: polished % contract descriptions ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 6 — BOOKINGS (job_title display field only)
-- Replaces test job_title text in bookings.
-- price, status, agency_id, talent_user_id are NOT touched.
-- =============================================================================

DO $$
DECLARE
  v_titles text[] := ARRAY[
    'Campanha Verão Natura 2026',
    'Evento Corporativo XP Investimentos',
    'Ação Promocional Shopping Leblon',
    'Produção Audiovisual Ambev',
    'Lançamento Coleção Renner',
    'Campanha Digital Bradesco',
    'Shooting Editorial Vogue Brasil',
    'Evento Samsung Galaxy'
  ];
  r        record;
  v_idx    int := 0;
BEGIN
  FOR r IN
    SELECT id FROM bookings
    WHERE job_title ILIKE '%test%'
       OR job_title ILIKE '%asd%'
       OR job_title ILIKE '%qa%'
       OR job_title ILIKE '%seed%'
       OR job_title ILIKE '%lorem%'
       OR job_title ILIKE '%[QA%'
       OR job_title ILIKE '%demo%'
    ORDER BY created_at ASC
    LIMIT 8
  LOOP
    v_idx := v_idx + 1;

    UPDATE bookings
    SET job_title = v_titles[v_idx]
    WHERE id = r.id;

    RAISE NOTICE 'Booking % job_title polished', r.id;
  END LOOP;
  RAISE NOTICE '--- Section 6: polished % booking titles ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 7 — DISPUTES (reason / resolution_note text fields)
-- Replaces test dispute reasons with realistic professional Portuguese copy.
-- contract_id, workspace_id, status, amounts are NOT touched.
-- =============================================================================

DO $$
DECLARE
  v_reasons text[] := ARRAY[
    'Talento não compareceu no horário combinado. Agência solicitou reembolso integral do escrow, alegando prejuízo operacional e contratação emergencial de substituto.',
    'Divergência no valor acordado verbalmente versus o registrado no contrato digital. Talento alega ajuste informal não refletido na plataforma antes da assinatura.',
    'Produção cancelada pela agência 48 horas antes do evento por contingência interna não comunicada. Talento reivindica cumprimento do contrato ou indenização proporcional pelo cancelamento tardio.',
    'Desacordo sobre entregas adicionais fora do escopo original. Agência solicitou conteúdo extra sem formalizar novo contrato. Talento contestou entrega não contratada.',
    'Talento alega escrow retido indevidamente após entrega completa e confirmada do serviço contratado. Solicita liberação imediata dos fundos e esclarecimento da agência.'
  ];
  v_notes  text[] := ARRAY[
    'Após análise das evidências apresentadas por ambas as partes, reembolso integral aprovado. Escrow devolvido à agência conforme política de cancelamento da plataforma.',
    'Mediação concluída. Acordo parcial firmado: pagamento de 60% ao talento pelo trabalho realizado e 40% reembolsado à agência pelo item em disputa.',
    'Resolução administrativa: contrato encerrado sem penalidade para o talento dado o cancelamento tardio pela agência. Escrow liberado ao talento conforme política vigente.',
    'Disputa encerrada após apresentação de comprovantes. Escrow liberado integralmente ao talento mediante confirmação de entrega dentro do escopo contratado.',
    'Análise documental concluída. Pagamento integralmente liberado ao talento. Agência notificada sobre obrigações contratuais e processo de documentação de entregas.'
  ];
  r        record;
  v_idx    int := 0;
BEGIN
  FOR r IN
    SELECT id FROM contract_disputes
    WHERE reason ILIKE '%test%'
       OR reason ILIKE '%asd%'
       OR reason ILIKE '%seed%'
       OR reason ILIKE '%lorem%'
       OR reason ILIKE '%demo%'
       OR reason ILIKE '%qa%'
    ORDER BY created_at ASC
    LIMIT 5
  LOOP
    v_idx := v_idx + 1;

    UPDATE contract_disputes SET
      reason = v_reasons[v_idx],
      resolution_note = CASE
        WHEN resolution_note IS NULL OR resolution_note = ''
          OR resolution_note ILIKE '%test%'
          OR resolution_note ILIKE '%lorem%'
          OR resolution_note ILIKE '%seed%'
        THEN
          CASE WHEN status NOT IN ('open', 'under_review') THEN v_notes[v_idx] ELSE resolution_note END
        ELSE resolution_note
      END
    WHERE id = r.id;

    RAISE NOTICE 'Dispute % reason polished', r.id;
  END LOOP;
  RAISE NOTICE '--- Section 7: polished % disputes ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 8 — SUPPORT CONVERSATIONS (subject line only)
-- Replaces test/ugly subject lines.
-- Messages, user_id, status are NOT touched.
-- =============================================================================

DO $$
DECLARE
  v_subjects text[] := ARRAY[
    'Dúvida sobre pagamento de contrato',
    'Problema com upload de documento contratual',
    'Contrato pendente de assinatura',
    'Saldo de carteira não atualizado',
    'Disputa de contrato — solicitação de análise',
    'Dificuldade no acesso ao portal da agência',
    'Dúvida sobre comissão da plataforma'
  ];
  r          record;
  v_idx      int := 0;
BEGIN
  FOR r IN
    SELECT id FROM support_conversations
    WHERE subject ILIKE '%test%'
       OR subject ILIKE '%asd%'
       OR subject ILIKE '%qa%'
       OR subject ILIKE '%seed%'
       OR subject ILIKE '%lorem%'
       OR subject ILIKE '%demo%'
    ORDER BY created_at ASC
    LIMIT 7
  LOOP
    v_idx := v_idx + 1;

    UPDATE support_conversations
    SET subject = v_subjects[v_idx]
    WHERE id = r.id;

    RAISE NOTICE 'Support conversation % subject polished', r.id;
  END LOOP;
  RAISE NOTICE '--- Section 8: polished % support subjects ---', v_idx;
END $$;


-- =============================================================================
-- SECTION 9 — SUMMARY: What was polished
-- =============================================================================

SELECT
  'agencies (ugly name remaining)'     AS "field",
  count(*)::int                        AS "still_needs_polish"
FROM agencies
WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%'
   OR company_name ILIKE '%qa%' OR company_name ILIKE '%seed%'
   OR company_name IS NULL OR company_name = ''

UNION ALL SELECT
  'talent_profiles (ugly name remaining)', count(*)::int
FROM talent_profiles
WHERE full_name ILIKE '%test%' OR full_name ILIKE '%asd%'
   OR full_name ILIKE '%seed%' OR full_name IS NULL OR full_name = ''

UNION ALL SELECT
  'jobs (ugly title remaining)', count(*)::int
FROM jobs
WHERE (title ILIKE '%test%' OR title ILIKE '%asd%' OR title ILIKE '%seed%'
    OR title ILIKE '%pdf%')
  AND deleted_at IS NULL

UNION ALL SELECT
  'workspaces (ugly name remaining)', count(*)::int
FROM premium_workspaces
WHERE name ILIKE '%test%' OR name ILIKE '%asd%' OR name ILIKE '%seed%'
   OR name IS NULL OR name = ''

UNION ALL SELECT
  'disputes (ugly reason remaining)', count(*)::int
FROM contract_disputes
WHERE reason ILIKE '%test%' OR reason ILIKE '%asd%' OR reason ILIKE '%seed%'

ORDER BY "still_needs_polish" DESC, "field";
