-- =============================================================================
-- BrisaHub Demo Content Normalizer
-- Purpose  : Replace keyboard-mash, placeholder, and test strings in all
--            user-facing display fields with polished professional content.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role
--
-- STRATEGY
--   All sections use pattern-based ILIKE targeting to replace only ugly rows.
--   Safe to run multiple times — rows already polished will not match.
--   Financial columns are NEVER touched.
--   FKs, IDs, slugs, status columns are NEVER touched.
--
-- RUN ORDER
--   1. 202605_full_ui_content_audit.sql   (identify what needs polish)
--   2. THIS FILE                          (apply the normalizer)
--   3. 202605_demo_health_check.sql       (verify results)
-- =============================================================================


-- =============================================================================
-- SECTION 1 — AGENCIES
-- Targets: company_name, contact_name, city, description
-- =============================================================================

DO $$
DECLARE
  v_rows int;
BEGIN
  -- Agency 1 — first ugly agency gets premium treatment
  UPDATE agencies
  SET
    company_name  = 'BrisaHub Studio',
    contact_name  = 'Mariana Costa',
    city          = 'São Paulo',
    description   = CASE
      WHEN description IS NULL OR trim(description) = '' OR
           description ILIKE '%test%' OR description ILIKE '%asd%' OR
           description ILIKE '%lorem%' OR description ILIKE '%seed%' OR
           description ILIKE '%qwe%' OR description ILIKE '%sdf%'
      THEN 'Agência líder em casting e produção de conteúdo digital, especializada em campanhas para grandes marcas nacionais e internacionais.'
      ELSE description
    END
  WHERE (
    company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
    company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
    company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
    company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
    company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
    company_name ~ '(.)\1\1' OR
    company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
  )
  AND id = (
    SELECT id FROM agencies
    WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
          company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
          company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
          company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
          company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
          company_name ~ '(.)\1\1' OR
          company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
    ORDER BY created_at ASC LIMIT 1
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Agency 1 updated: %', v_rows;

  -- Agency 2
  UPDATE agencies
  SET
    company_name  = 'Spark Casting',
    contact_name  = 'Rafael Mendes',
    city          = 'Rio de Janeiro',
    description   = CASE
      WHEN description IS NULL OR trim(description) = '' OR
           description ILIKE '%test%' OR description ILIKE '%asd%' OR
           description ILIKE '%lorem%' OR description ILIKE '%seed%' OR
           description ILIKE '%qwe%' OR description ILIKE '%sdf%'
      THEN 'Especialistas em recrutamento de talentos criativos para campanhas publicitárias, vídeos institucionais e eventos de alto impacto.'
      ELSE description
    END
  WHERE (
    company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
    company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
    company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
    company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
    company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
    company_name ~ '(.)\1\1' OR
    company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
  )
  AND id = (
    SELECT id FROM agencies
    WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
          company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
          company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
          company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
          company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
          company_name ~ '(.)\1\1' OR
          company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
    ORDER BY created_at ASC OFFSET 1 LIMIT 1
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Agency 2 updated: %', v_rows;

  -- Agency 3
  UPDATE agencies
  SET
    company_name  = 'Nova Produções',
    contact_name  = 'Juliana Neves',
    city          = 'Belo Horizonte',
    description   = CASE
      WHEN description IS NULL OR trim(description) = '' OR
           description ILIKE '%test%' OR description ILIKE '%asd%' OR
           description ILIKE '%lorem%' OR description ILIKE '%seed%'
      THEN 'Produtora com 12 anos de mercado, focada em conteúdo autoral para plataformas de streaming e campanhas de marca para o segmento de moda e beleza.'
      ELSE description
    END
  WHERE (
    company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
    company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
    company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
    company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
    company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
    company_name ~ '(.)\1\1' OR
    company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
  )
  AND id = (
    SELECT id FROM agencies
    WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
          company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
          company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
          company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
          company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
          company_name ~ '(.)\1\1' OR
          company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2
    ORDER BY created_at ASC OFFSET 2 LIMIT 1
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Agency 3 updated: %', v_rows;

  -- Agency 4 — all remaining ugly agencies get generic but polished name
  UPDATE agencies
  SET
    company_name  = 'Élite Eventos',
    contact_name  = COALESCE(
      NULLIF(trim(contact_name), ''),
      'Carlos Rodrigues'
    ),
    city          = COALESCE(NULLIF(trim(city), ''), 'São Paulo'),
    description   = CASE
      WHEN description IS NULL OR trim(description) = '' OR
           description ILIKE '%test%' OR description ILIKE '%asd%' OR
           description ILIKE '%lorem%' OR description ILIKE '%seed%'
      THEN 'Agência especializada em eventos corporativos, produções ao vivo e gestão completa de talentos para grandes marcas.'
      ELSE description
    END
  WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
        company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
        company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
        company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
        company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR
        company_name ~ '(.)\1\1' OR
        company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Remaining agencies updated: %', v_rows;

  RAISE NOTICE '--- Section 1 (Agencies) complete ---';
END $$;


-- =============================================================================
-- SECTION 2 — TALENT PROFILES
-- Targets: full_name, city, bio
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_names text[] := ARRAY[
    'Bianca Martins', 'Lucas Ferreira', 'Amanda Rocha',
    'Felipe Alves', 'Camila Torres', 'Rodrigo Lima',
    'Isabela Carvalho', 'Gabriel Sousa', 'Letícia Pires',
    'Thiago Nascimento'
  ];
  v_cities text[] := ARRAY[
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte',
    'Curitiba', 'Porto Alegre', 'Salvador',
    'Fortaleza', 'Recife', 'Brasília', 'Manaus'
  ];
  v_bios text[] := ARRAY[
    'Modelo e atriz com 7 anos de experiência em publicidade, campanhas de moda e produções audiovisuais. Disponível para projetos nacionais e internacionais.',
    'Ator formado pela EAD-USP, com vasta experiência em comerciais de TV, campanhas digitais e eventos corporativos. Bilíngue (PT/EN).',
    'Influenciadora digital e apresentadora, especializada em conteúdo de lifestyle, beleza e viagem. Audiência engajada no Instagram e YouTube.',
    'Músico e compositor com experiência em trilhas sonoras, jingles publicitários e apresentações ao vivo para eventos de médio e grande porte.',
    'Modelo editorial e comercial, com passagens por agências em São Paulo e Miami. Experiência em editorial de moda e campanhas de beleza.',
    'Ator e locutor com voz grave e versatilidade para personagens dramáticos, comerciais e audiobooks. Estúdio próprio para gravações remotas.',
    'Dançarina profissional com formação em dança contemporânea e jazz. Experiência em videoclipes, shows e campanhas publicitárias.',
    'Fotógrafo e modelo, atuando tanto na frente quanto atrás das câmeras. Especializado em retratos, moda e campanha de lifestyle.',
    'Make-up artist e consultora de imagem, com trabalhos para TV Globo, SBT e grandes anunciantes. Disponível para sets de fotografia e vídeo.',
    'Ator e humorista com experiência em stand-up comedy, programas de TV e criação de conteúdo para plataformas digitais.'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM talent_profiles
    WHERE full_name ILIKE '%test%' OR full_name ILIKE '%asd%' OR
          full_name ILIKE '%sdf%' OR full_name ILIKE '%qwe%' OR
          full_name ILIKE '%lorem%' OR full_name ILIKE '%seed%' OR
          full_name ILIKE '%qa%' OR full_name ILIKE '%demo%' OR
          full_name ILIKE '%fake%' OR full_name ILIKE '%dummy%' OR
          full_name ~ '(.)\1\1' OR
          full_name IS NULL OR trim(full_name) = '' OR length(trim(full_name)) <= 2
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE talent_profiles
    SET
      full_name = v_names[((v_idx - 1) % array_length(v_names, 1)) + 1],
      city      = COALESCE(NULLIF(trim(city), ''), v_cities[((v_idx - 1) % array_length(v_cities, 1)) + 1]),
      bio       = CASE
        WHEN bio IS NULL OR trim(bio) = '' OR
             bio ILIKE '%lorem ipsum%' OR bio ILIKE '%test%' OR
             bio ILIKE '%asd asd%' OR bio ILIKE '%seed%' OR
             bio ILIKE '%[QA%' OR bio ILIKE '%dummy%' OR
             bio ILIKE '%placeholder%' OR bio ~ '(.)\1\1\1'
        THEN v_bios[((v_idx - 1) % array_length(v_bios, 1)) + 1]
        ELSE bio
      END
    WHERE id = v_id;
  END LOOP;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Talent profiles updated: %', v_idx;
  RAISE NOTICE '--- Section 2 (Talent Profiles) complete ---';
END $$;


-- =============================================================================
-- SECTION 3 — JOBS
-- Targets: title, description (not financial, not status, not workspace_id)
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_titles text[] := ARRAY[
    'Campanha Verão Natura 2026',
    'Evento Corporativo XP Investimentos — Keynote',
    'Editorial de Moda Vogue Brasil — Outono/Inverno',
    'Campanha Digital Havaianas — Coleção Limitada',
    'Série Documental Globoplay — Bastidores da Moda',
    'Lançamento Produto Unilever — Vídeo Institucional',
    'Festival de Música Tim — Apresentador Principal',
    'Campanha Redes Sociais iFood — Lifestyle',
    'Ensaio Editorial Revista Elle — Beleza Natural',
    'Evento de Lançamento BMW Série 3 — Host'
  ];
  v_descs text[] := ARRAY[
    'Buscamos modelo feminina para campanha de verão da Natura. A campanha será veiculada em mídia digital, out-of-home e ponto de venda. Experiência com campanhas de beleza é um diferencial.',
    'Apresentador/animador para evento corporativo do XP Investimentos com 800 convidados. Perfil comunicativo, experiência com públicos executivos e facilidade com roteiro semi-improvisado.',
    'Editorial de moda para edição especial da Vogue Brasil. Procuramos modelos com experiência em editorial de alto padrão. Fotógrafo: Mario Testino. Styling: Patricia Melo.',
    'Modelo para campanha digital e OOH da coleção limitada Havaianas × Melissa. Lifestyle descontraído, ao ar livre. Shooting em Salvador e São Paulo.',
    'Apresentador/host para série documental do Globoplay sobre os bastidores da moda nacional. Perfil jornalístico ou artístico com boa desenvoltura em câmera.',
    'Ator para vídeo institucional da Unilever. Roteiro envolve cenas em ambiente doméstico e corporativo. Exige boa dicção e naturalidade em câmera.',
    'Host e animador para o palco principal do festival. Responsável pela apresentação das atrações, interação com o público e condução do roteiro do evento.',
    'Criadores de conteúdo para campanha de estilo de vida do iFood. Conteúdo autêntico mostrando momentos do cotidiano com o app. Perfis com 20k+ seguidores.',
    'Modelo para editorial de beleza natural da Revista Elle. Sem maquiagem pesada, foco em pele, cabelo e expressão natural. Locação: Parque Estadual da Serra do Mar.',
    'Host de evento de lançamento do BMW Série 3 em São Paulo. Perfil sofisticado, bilíngue (PT/EN), experiência com eventos de luxo e lançamentos de produtos.'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM jobs
    WHERE title ILIKE '%test%' OR title ILIKE '%asd%' OR title ILIKE '%sdf%' OR
          title ILIKE '%qwe%' OR title ILIKE '%lorem%' OR title ILIKE '%seed%' OR
          title ILIKE '%[QA%' OR title ILIKE '%demo%' OR title ILIKE '%fake%' OR
          title ILIKE '%temp%' OR title ILIKE '%dummy%' OR title ILIKE '%pdf%' OR
          title ~ '(.)\1\1' OR trim(title) = '' OR length(trim(title)) <= 3
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE jobs
    SET
      title       = v_titles[((v_idx - 1) % array_length(v_titles, 1)) + 1],
      description = CASE
        WHEN description IS NULL OR trim(description) = '' OR
             description ILIKE '%lorem ipsum%' OR description ILIKE '%[QA%' OR
             description ILIKE '%asd%' OR description ILIKE '%test%' OR
             description ILIKE '%dummy%' OR description ILIKE '%placeholder%' OR
             description ~ '(.)\1\1\1'
        THEN v_descs[((v_idx - 1) % array_length(v_descs, 1)) + 1]
        ELSE description
      END
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Jobs updated: %', v_idx;
  RAISE NOTICE '--- Section 3 (Jobs) complete ---';
END $$;


-- =============================================================================
-- SECTION 4 — PREMIUM WORKSPACES
-- Targets: name only (NOT slug — slugs appear in notification links)
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_ws_names text[] := ARRAY[
    'BrisaHub Studio', 'Spark Workspace', 'Nova Produções Premium', 'Élite Casting'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM premium_workspaces
    WHERE name ILIKE '%test%' OR name ILIKE '%asd%' OR name ILIKE '%sdf%' OR
          name ILIKE '%qwe%' OR name ILIKE '%lorem%' OR name ILIKE '%seed%' OR
          name ILIKE '%qa%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR
          name ILIKE '%dummy%' OR name ~ '(.)\1\1' OR
          name IS NULL OR trim(name) = '' OR length(trim(name)) <= 2
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE premium_workspaces
    SET name = v_ws_names[((v_idx - 1) % array_length(v_ws_names, 1)) + 1]
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Workspaces updated: %', v_idx;
  RAISE NOTICE '--- Section 4 (Workspaces) complete ---';
END $$;


-- =============================================================================
-- SECTION 5 — CONTRACTS (job_description and location display fields only)
-- Financial columns are NEVER touched.
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_jds text[] := ARRAY[
    'Campanha publicitária para plataforma de streaming nacional. O talento atuará em vídeo principal e materiais complementares de divulgação.',
    'Editorial fotográfico para marca de moda brasileira. Ensaio em estúdio e locação externa. Contrato inclui direito de uso por 12 meses.',
    'Evento corporativo de grande porte. Apresentação de duas horas com roteiro aprovado, incluindo ensaio técnico no dia anterior.',
    'Produção audiovisual para campanha digital de marca de consumo. Gravação em 1 dia, retake incluído no contrato.',
    'Série de conteúdo para redes sociais da marca. Entrega de 6 peças em formato Reels/TikTok ao longo de 30 dias.',
    'Locução e voz over para campanha de rádio e digital. Gravação em estúdio parceiro, direção remota do cliente.',
    'Cobertura fotográfica de evento de lançamento. Entrega de 300 fotos editadas em até 72 horas após o evento.',
    'Modelo para lookbook digital de coleção primavera/verão. Shooting de 6 horas, 5 ambientes, 12 looks.',
    'Host de cerimônia de premiação corporativa. Roteiro semi-improvisado, bilíngue (PT/EN), duração de 4 horas.',
    'Campanha de e-commerce com 20 produtos. Shooting de tabletop e modelo, entrega em 5 dias úteis.'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM contracts
    WHERE (job_description ILIKE '%test%' OR job_description ILIKE '%asd%' OR
           job_description ILIKE '%sdf%' OR job_description ILIKE '%qwe%' OR
           job_description ILIKE '%lorem%' OR job_description ILIKE '%seed%' OR
           job_description ILIKE '%[QA%' OR job_description ILIKE '%pdf%' OR
           job_description ILIKE '%demo%' OR job_description ILIKE '%dummy%' OR
           job_description ILIKE '%placeholder%' OR job_description ~ '(.)\1\1\1')
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE contracts
    SET job_description = v_jds[((v_idx - 1) % array_length(v_jds, 1)) + 1]
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Contracts job_description updated: %', v_idx;

  -- Fix ugly location values
  v_idx := 0;
  FOR v_id IN (
    SELECT id FROM contracts
    WHERE (location ILIKE '%asd%' OR location ILIKE '%sdf%' OR location ILIKE '%qwe%' OR
           location ILIKE '%zxc%' OR location ILIKE '%dqd%' OR location ILIKE '%test%' OR
           location ILIKE '%lorem%' OR location ILIKE '%seed%' OR location ILIKE '%demo%' OR
           location ILIKE '%dummy%' OR location ~ '(.)\1\1' OR
           (location IS NOT NULL AND length(trim(location)) <= 3 AND location !~ '^\s*$'))
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE contracts
    SET location = (ARRAY[
      'São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG',
      'Curitiba, PR', 'Porto Alegre, RS', 'Salvador, BA',
      'Fortaleza, CE', 'Recife, PE', 'Brasília, DF', 'Campinas, SP'
    ])[((v_idx - 1) % 10) + 1]
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Contracts location updated: %', v_idx;
  RAISE NOTICE '--- Section 5 (Contracts) complete ---';
END $$;


-- =============================================================================
-- SECTION 6 — BOOKINGS (job_title display field only)
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_titles text[] := ARRAY[
    'Campanha Verão Natura 2026',
    'Editorial Vogue Brasil — Outono/Inverno',
    'Evento Corporativo XP Investimentos',
    'Campanha Digital Havaianas',
    'Série Documental Globoplay',
    'Vídeo Institucional Unilever',
    'Festival de Música Tim — Host',
    'Campanha iFood — Lifestyle',
    'Editorial Elle — Beleza Natural',
    'Lançamento BMW Série 3'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM bookings
    WHERE job_title ILIKE '%test%' OR job_title ILIKE '%asd%' OR
          job_title ILIKE '%sdf%' OR job_title ILIKE '%qwe%' OR
          job_title ILIKE '%[QA%' OR job_title ILIKE '%lorem%' OR
          job_title ILIKE '%demo%' OR job_title ILIKE '%dummy%' OR
          job_title ~ '(.)\1\1' OR
          trim(job_title) = '' OR length(trim(job_title)) <= 3
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE bookings
    SET job_title = v_titles[((v_idx - 1) % array_length(v_titles, 1)) + 1]
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Bookings updated: %', v_idx;
  RAISE NOTICE '--- Section 6 (Bookings) complete ---';
END $$;


-- =============================================================================
-- SECTION 7 — DISPUTES (reason and resolution_note)
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_reasons text[] := ARRAY[
    'O talento não compareceu ao shooting na data acordada em contrato, causando prejuízo de produção e reagendamento com custo adicional.',
    'A entrega do material criativo não atendeu aos requisitos técnicos especificados no briefing. As fotos enviadas estavam fora de padrão.',
    'O pagamento não foi liberado no prazo de 5 dias úteis após a conclusão do trabalho, conforme cláusula 8.2 do contrato.',
    'O talento solicitou alteração unilateral de data a menos de 48 horas do evento, em desacordo com a política de cancelamento.',
    'Divergência sobre o escopo de entregáveis: o contrato previa 10 fotos finais editadas, mas apenas 6 foram entregues.'
  ];
  v_resolutions text[] := ARRAY[
    'Caso encerrado após verificação: o talento apresentou comprovante de emergência médica. Reembolso parcial acordado entre as partes.',
    'Administrador revisou os entregáveis. O material estava conforme o briefing. Disputa encerrada sem ônus.',
    'Pagamento confirmado após análise da carteira. Atraso foi erro de sistema, corrigido manualmente. Caso encerrado.',
    'Reagendamento aceito pelo cliente com desconto de 10% sobre o valor do contrato. Acordo firmado entre as partes.',
    'Entregáveis adicionais enviados e aceitos. Contrato cumprido integralmente. Disputa encerrada.'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM contract_disputes
    WHERE reason ILIKE '%test%' OR reason ILIKE '%asd%' OR reason ILIKE '%sdf%' OR
          reason ILIKE '%lorem%' OR reason ILIKE '%seed%' OR reason ILIKE '%[QA%' OR
          reason ILIKE '%demo%' OR reason ILIKE '%dummy%' OR reason ILIKE '%placeholder%' OR
          reason ~ '(.)\1\1\1'
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE contract_disputes
    SET
      reason = v_reasons[((v_idx - 1) % array_length(v_reasons, 1)) + 1],
      resolution_note = CASE
        WHEN resolution_note IS NULL OR trim(resolution_note) = '' OR
             resolution_note ILIKE '%test%' OR resolution_note ILIKE '%lorem%' OR
             resolution_note ILIKE '%[QA%' OR resolution_note ILIKE '%dummy%' OR
             resolution_note ILIKE '%placeholder%' OR resolution_note ~ '(.)\1\1\1'
        THEN v_resolutions[((v_idx - 1) % array_length(v_resolutions, 1)) + 1]
        ELSE resolution_note
      END
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Disputes updated: %', v_idx;
  RAISE NOTICE '--- Section 7 (Disputes) complete ---';
END $$;


-- =============================================================================
-- SECTION 8 — SUPPORT CONVERSATIONS (subject only)
-- =============================================================================

DO $$
DECLARE
  v_rows int;
  v_subjects text[] := ARRAY[
    'Problema no recebimento do pagamento pelo contrato',
    'Dúvida sobre upgrade para plano Pro',
    'Contrato não aparece no painel após assinatura',
    'Solicitação de nota fiscal para serviços prestados',
    'Campanha removida indevidamente — solicito revisão',
    'Pagamento em escrow há mais de 10 dias sem liberação',
    'Erro ao fazer login com Google na plataforma'
  ];
  v_idx int := 0;
  v_id uuid;
BEGIN
  FOR v_id IN (
    SELECT id FROM support_conversations
    WHERE subject ILIKE '%test%' OR subject ILIKE '%asd%' OR subject ILIKE '%sdf%' OR
          subject ILIKE '%qwe%' OR subject ILIKE '%lorem%' OR subject ILIKE '%seed%' OR
          subject ILIKE '%qa%' OR subject ILIKE '%demo%' OR subject ILIKE '%dummy%' OR
          subject ~ '(.)\1\1' OR
          trim(subject) = '' OR length(trim(subject)) <= 3
    ORDER BY created_at ASC
  ) LOOP
    v_idx := v_idx + 1;
    UPDATE support_conversations
    SET subject = v_subjects[((v_idx - 1) % array_length(v_subjects, 1)) + 1]
    WHERE id = v_id;
  END LOOP;

  RAISE NOTICE 'Support conversations updated: %', v_idx;
  RAISE NOTICE '--- Section 8 (Support) complete ---';
END $$;


-- =============================================================================
-- SECTION 9 — FINAL VERIFICATION (run after normalizer to confirm results)
-- =============================================================================

SELECT
  'agencies — ugly name remaining'       AS "check",
  count(*)::int                          AS "count",
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END AS status
FROM agencies
WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR
      company_name ILIKE '%sdf%' OR company_name ILIKE '%qwe%' OR
      company_name ILIKE '%lorem%' OR company_name ILIKE '%seed%' OR
      company_name ILIKE '%qa%' OR company_name ILIKE '%demo%' OR
      company_name ILIKE '%dummy%' OR company_name ~ '(.)\1\1' OR
      company_name IS NULL OR trim(company_name) = ''

UNION ALL SELECT 'talent_profiles — ugly name remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM talent_profiles
WHERE full_name ILIKE '%test%' OR full_name ILIKE '%asd%' OR full_name ILIKE '%sdf%' OR
      full_name ILIKE '%lorem%' OR full_name ILIKE '%seed%' OR full_name ILIKE '%qa%' OR
      full_name ILIKE '%dummy%' OR full_name ~ '(.)\1\1' OR
      full_name IS NULL OR trim(full_name) = ''

UNION ALL SELECT 'jobs — ugly title remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM jobs
WHERE title ILIKE '%test%' OR title ILIKE '%asd%' OR title ILIKE '%sdf%' OR
      title ILIKE '%qwe%' OR title ILIKE '%lorem%' OR title ILIKE '%seed%' OR
      title ILIKE '%[QA%' OR title ILIKE '%demo%' OR title ILIKE '%dummy%' OR
      title ~ '(.)\1\1' OR trim(title) = ''

UNION ALL SELECT 'premium_workspaces — ugly name remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM premium_workspaces
WHERE name ILIKE '%test%' OR name ILIKE '%asd%' OR name ILIKE '%sdf%' OR
      name ILIKE '%lorem%' OR name ILIKE '%seed%' OR name ILIKE '%qa%' OR
      name ILIKE '%demo%' OR name ILIKE '%dummy%' OR name ~ '(.)\1\1' OR
      name IS NULL OR trim(name) = ''

UNION ALL SELECT 'contracts — ugly job_description remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM contracts
WHERE (job_description ILIKE '%test%' OR job_description ILIKE '%asd%' OR
       job_description ILIKE '%lorem%' OR job_description ILIKE '%seed%' OR
       job_description ILIKE '%[QA%' OR job_description ILIKE '%dummy%' OR
       job_description ~ '(.)\1\1\1')
  AND deleted_at IS NULL

UNION ALL SELECT 'bookings — ugly job_title remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM bookings
WHERE job_title ILIKE '%test%' OR job_title ILIKE '%asd%' OR
      job_title ILIKE '%[QA%' OR job_title ILIKE '%lorem%' OR
      job_title ILIKE '%dummy%' OR job_title ~ '(.)\1\1'

UNION ALL SELECT 'disputes — ugly reason remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM contract_disputes
WHERE reason ILIKE '%test%' OR reason ILIKE '%asd%' OR reason ILIKE '%lorem%' OR
      reason ILIKE '%seed%' OR reason ILIKE '%[QA%' OR reason ILIKE '%dummy%' OR
      reason ~ '(.)\1\1\1'

UNION ALL SELECT 'support_conversations — ugly subject remaining', count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — rerun normalizer' END
FROM support_conversations
WHERE subject ILIKE '%test%' OR subject ILIKE '%asd%' OR subject ILIKE '%lorem%' OR
      subject ILIKE '%seed%' OR subject ILIKE '%qa%' OR subject ILIKE '%demo%' OR
      subject ILIKE '%dummy%' OR subject ~ '(.)\1\1'

ORDER BY status, "check";
