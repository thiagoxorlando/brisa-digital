-- ============================================================
-- DEMO JOBS — 32 jobs across all agencies
-- ============================================================

INSERT INTO jobs (id, agency_id, title, description, category, budget,
  deadline, job_date, location, status, number_of_talents_required,
  created_at, deleted_at)
VALUES
  -- ── WAVE CREATIVE (agency 001) — 8 jobs ──────────────────
  ('ddjob001-demo-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001',
   'Campanha Verão 2026 — Moda Praia',
   'Procuramos modelos femininas para campanha de moda praia. Sessão em estúdio e locação na orla de SP. Material para Instagram, site e PDV.',
   'Model',5000.00,'2026-06-15','2026-06-20','São Paulo, SP','open',3,
   now()-interval'5 days', NULL),

  ('ddjob001-demo-0001-0002-000000000002','dd000001-demo-agen-0001-000000000001',
   'UGC para Lançamento de Produto — Tech',
   'Criadores de conteúdo para unboxing e review de novo smartwatch. Formato reels 30–60s para Instagram e TikTok. Briefing completo fornecido.',
   'UGC Creator',1200.00,'2026-06-10','2026-06-18','Remoto','open',5,
   now()-interval'8 days', NULL),

  ('ddjob001-demo-0001-0003-000000000003','dd000001-demo-agen-0001-000000000001',
   'Campanha Institucional — Marca de Cosméticos',
   'Influenciadoras de beleza para campanha de lançamento de linha skincare. Conteúdo para feed, stories e reels. 2 posts + 5 stories por talento.',
   'Influencer',2500.00,'2026-06-08','2026-06-14','São Paulo, SP','in_progress',4,
   now()-interval'12 days', NULL),

  ('ddjob001-demo-0001-0004-000000000004','dd000001-demo-agen-0001-000000000001',
   'Fotografia de Produto — E-commerce',
   'Fotógrafo(a) para sessão de produto de linha de bolsas premium. 80+ SKUs, fundo infinito, entrega em 5 dias úteis.',
   'Photographer',3500.00,'2026-05-30','2026-06-05','São Paulo, SP','open',1,
   now()-interval'3 days', NULL),

  ('ddjob001-demo-0001-0005-000000000005','dd000001-demo-agen-0001-000000000001',
   'Embaixador(a) de Marca — Campanha Anual',
   'Modelo e influenciador(a) para ser embaixador(a) de marca de roupas fitness por 6 meses. 4 ensaios fotográficos + 24 posts mensais.',
   'Brand Ambassador',8000.00,'2026-06-01','2026-06-10','São Paulo, SP','closed',1,
   now()-interval'20 days', NULL),

  ('ddjob001-demo-0001-0006-000000000006','dd000001-demo-agen-0001-000000000001',
   'Cobertura de Evento Corporativo',
   'Videomaker para cobertura completa de lançamento de produto (8h). Entrega: highlights 2min + cut completo + stories.',
   'Videographer',4500.00,'2026-06-22','2026-06-25','São Paulo, SP','open',1,
   now()-interval'2 days', NULL),

  ('ddjob001-demo-0001-0007-000000000007','dd000001-demo-agen-0001-000000000001',
   'Gravação de Comercial TV — 30s',
   'Ator(iz) para comercial de 30 segundos de banco digital. Perfil jovem, 25–35 anos, transmitir confiança e modernidade.',
   'Actor',6000.00,'2026-06-18','2026-06-22','São Paulo, SP','open',2,
   now()-interval'1 day', NULL),

  ('ddjob001-demo-0001-0008-000000000008','dd000001-demo-agen-0001-000000000001',
   'UGC — Campanha de Inverno Alimentação Saudável',
   'Criadores(as) para vídeos curtos de receitas saudáveis usando produtos da marca. Estilo caseiro, autêntico e inspirador.',
   'UGC Creator',850.00,'2026-06-12','2026-06-16','Remoto','open',6,
   now()-interval'6 days', NULL),

  -- ── BLUE HORIZON (agency 002) — 8 jobs ───────────────────
  ('ddjob002-demo-0002-0001-000000000001','dd000001-demo-agen-0002-000000000002',
   'Lookbook Masculino — Coleção Primavera',
   'Modelos masculinos para lookbook de coleção masculina adulta. Fotografia externa, Rio de Janeiro. 2 dias de shooting.',
   'Model',2800.00,'2026-06-14','2026-06-19','Rio de Janeiro, RJ','open',3,
   now()-interval'7 days', NULL),

  ('ddjob002-demo-0002-0002-000000000002','dd000001-demo-agen-0002-000000000002',
   'Parceria Influenciadora — Lançamento App Fintech',
   'Influenciadoras com perfil financeiro/lifestyle para campanha de lançamento. 1 reels + 3 stories por semana por 4 semanas.',
   'Influencer',3200.00,'2026-06-07','2026-06-12','Remoto','in_progress',3,
   now()-interval'15 days', NULL),

  ('ddjob002-demo-0002-0003-000000000003','dd000001-demo-agen-0002-000000000002',
   'Fotografia Editorial — Revista Digital',
   'Modelo feminina para editorial de moda digital. Publicação com 500k leitores mensais. 6h de shooting, 15 looks.',
   'Model',1800.00,'2026-05-28','2026-06-02','Rio de Janeiro, RJ','closed',1,
   now()-interval'25 days', NULL),

  ('ddjob002-demo-0002-0004-000000000004','dd000001-demo-agen-0002-000000000002',
   'UGC Videos — Marca de Suplementos',
   'Atletas e entusiastas fitness para vídeos UGC de suplementos. 3 vídeos por talento, tom descontraído e autêntico.',
   'UGC Creator',600.00,'2026-06-20','2026-06-24','Remoto','open',8,
   now()-interval'4 days', NULL),

  ('ddjob002-demo-0002-0005-000000000005','dd000001-demo-agen-0002-000000000002',
   'Campanha Foto+Vídeo — Destino Turístico',
   'Criadores de conteúdo lifestyle para campanha de turismo em Gramado. Hospedagem inclusa. 3 dias de produção.',
   'UGC Creator',3000.00,'2026-06-25','2026-06-28','Gramado, RS','open',2,
   now()-interval'9 days', NULL),

  ('ddjob002-demo-0002-0006-000000000006','dd000001-demo-agen-0002-000000000002',
   'Embaixadores — Rede de Academias',
   'Atletas/modelos fitness para programa de embaixadores. 12 meses, 2 sessões mensais + conteúdo digital.',
   'Brand Ambassador',5000.00,'2026-06-05','2026-06-10','Rio de Janeiro, RJ','closed',2,
   now()-interval'22 days', NULL),

  ('ddjob002-demo-0002-0007-000000000007','dd000001-demo-agen-0002-000000000002',
   'Ator para Série Web — Drama',
   'Atores para série web dramática de 6 episódios. Plataforma de streaming nacional. Personagem secundário com 3 cenas por episódio.',
   'Actor',4200.00,'2026-06-16','2026-07-15','Rio de Janeiro, RJ','open',3,
   now()-interval'5 days', NULL),

  ('ddjob002-demo-0002-0008-000000000008','dd000001-demo-agen-0002-000000000002',
   'Fotografia de Arquitetura e Interiores',
   'Fotógrafo(a) especializado(a) em interiores para portfólio de incorporadora. 3 imóveis, São Paulo. 2 dias de trabalho.',
   'Photographer',2200.00,'2026-06-28','2026-07-02','São Paulo, SP','open',1,
   now()-interval'3 days', NULL),

  -- ── PRIME TALENT (agency 003) — 8 jobs ───────────────────
  ('ddjob003-demo-0003-0001-000000000001','dd000001-demo-agen-0003-000000000003',
   'Campanha Digital — E-commerce de Moda',
   'Modelos para campanha completa de loja online. Produtos nas categorias casual, festa e trabalho. Shooting em estúdio SP.',
   'Model',4800.00,'2026-06-09','2026-06-13','São Paulo, SP','in_progress',4,
   now()-interval'18 days', NULL),

  ('ddjob003-demo-0003-0002-000000000002','dd000001-demo-agen-0003-000000000003',
   'Vídeos Educativos — Plataforma EAD',
   'Atores(trizes) para gravar módulos de treinamento corporativo. Tom profissional, teleprompter. 4h por módulo, 5 módulos.',
   'Actor',1500.00,'2026-06-11','2026-06-16','São Paulo, SP','open',2,
   now()-interval'6 days', NULL),

  ('ddjob003-demo-0003-0003-000000000003','dd000001-demo-agen-0003-000000000003',
   'Conteúdo Gastronômico — Rede de Restaurantes',
   'Videomakers e fotógrafos para produção de conteúdo de cardápio. 12 pratos por restaurante, 3 restaurantes.',
   'Videographer',2800.00,'2026-06-18','2026-06-22','São Paulo, SP','open',2,
   now()-interval'4 days', NULL),

  ('ddjob003-demo-0003-0004-000000000004','dd000001-demo-agen-0003-000000000003',
   'Influencer Campaign — Black Friday Antecipada',
   'Influenciadores(as) para campanha de Black Friday antecipada. Perfil: lifestyle, moda ou beleza. Engajamento mínimo 3%.',
   'Influencer',1800.00,'2026-06-25','2026-06-28','Remoto','open',6,
   now()-interval'2 days', NULL),

  ('ddjob003-demo-0003-0005-000000000005','dd000001-demo-agen-0003-000000000003',
   'UGC — Produto de Limpeza Premium',
   'Criadores de conteúdo doméstico/lifestyle para demonstração de produto de limpeza. Tom criativo e divertido. 2 vídeos por talento.',
   'UGC Creator',400.00,'2026-06-13','2026-06-17','Remoto','open',10,
   now()-interval'8 days', NULL),

  ('ddjob003-demo-0003-0006-000000000006','dd000001-demo-agen-0003-000000000003',
   'Modelo para Catálogo Jóias',
   'Modelo feminina para catálogo de joalheria de luxo. Tom elegante e sofisticado. Produto de alto valor.',
   'Model',6000.00,'2026-05-25','2026-05-30','São Paulo, SP','closed',1,
   now()-interval'30 days', NULL),

  ('ddjob003-demo-0003-0007-000000000007','dd000001-demo-agen-0003-000000000003',
   'Fotografia de Produto — Linha Infantil',
   'Fotógrafo(a) para linha de roupas infantis. Crianças de 2–8 anos (parentes fornecidos pela família). Fundo branco e externas.',
   'Photographer',2000.00,'2026-07-01','2026-07-05','São Paulo, SP','open',1,
   now()-interval'1 day', NULL),

  ('ddjob003-demo-0003-0008-000000000008','dd000001-demo-agen-0003-000000000003',
   'Embaixador — Marca de Cervejas Artesanais',
   'Influenciador masculino, perfil lifestyle/gastronomia, para ser embaixador de cerveja artesanal por 3 meses.',
   'Brand Ambassador',2400.00,'2026-06-01','2026-06-08','São Paulo, SP','closed',1,
   now()-interval'28 days', NULL),

  -- ── LIGHTHOUSE MEDIA (agency 004) — 4 jobs ───────────────
  ('ddjob004-demo-0004-0001-000000000001','dd000001-demo-agen-0004-000000000004',
   'Cobertura Fotográfica — Casamento Corporativo',
   'Fotógrafo(a) para cobertura fotojornalística de evento de premiação corporativa. 6h, Florianópolis.',
   'Photographer',1800.00,'2026-06-28','2026-07-03','Florianópolis, SC','open',1,
   now()-interval'4 days', NULL),

  ('ddjob004-demo-0004-0002-000000000002','dd000001-demo-agen-0004-000000000004',
   'UGC — Destino Praias do Sul',
   'Criadores de conteúdo para campanha de turismo nas praias de SC. Tom aventureiro e autêntico. Hospedagem fornecida.',
   'UGC Creator',1200.00,'2026-07-05','2026-07-10','Florianópolis, SC','open',3,
   now()-interval'2 days', NULL),

  ('ddjob004-demo-0004-0003-000000000003','dd000001-demo-agen-0004-000000000004',
   'Modelo para Loja de Surf/Skate',
   'Modelos com estilo surf/skate para catálogo de verão. Shooting externo na praia.',
   'Model',900.00,'2026-06-15','2026-06-20','Florianópolis, SC','closed',2,
   now()-interval'20 days', NULL),

  ('ddjob004-demo-0004-0004-000000000004','dd000001-demo-agen-0004-000000000004',
   'Vídeo Corporativo — Empresa de Tecnologia',
   'Videomaker para vídeo institucional de empresa de SaaS. Tom profissional, animação inclusa. Entrega em 10 dias.',
   'Videographer',3200.00,'2026-06-20','2026-06-24','Florianópolis, SC','open',1,
   now()-interval'3 days', NULL),

  -- ── URBAN VISION (agency 005) — 4 jobs ───────────────────
  ('ddjob005-demo-0005-0001-000000000001','dd000001-demo-agen-0005-000000000005',
   'Lookbook Streetwear — Coleção Urbana',
   'Modelos com estilo urbano para lookbook de marca streetwear. Locações nas ruas de BH.',
   'Model',1500.00,'2026-06-16','2026-06-21','Belo Horizonte, MG','in_progress',3,
   now()-interval'14 days', NULL),

  ('ddjob005-demo-0005-0002-000000000002','dd000001-demo-agen-0005-000000000005',
   'Fotografias de Produto — Eletrônicos',
   'Fotógrafo(a) para campanha de produtos eletrônicos (smartphones e acessórios). Fundo branco, lifestyle e detalhes.',
   'Photographer',2600.00,'2026-06-24','2026-06-28','Belo Horizonte, MG','open',1,
   now()-interval'5 days', NULL),

  ('ddjob005-demo-0005-0003-000000000003','dd000001-demo-agen-0005-000000000005',
   'UGC Criativo — Rede de Fast Food',
   'Criadores de conteúdo para campanha criativa de lanche premium. Estilo challenge + review autêntico.',
   'UGC Creator',500.00,'2026-06-19','2026-06-23','Remoto','open',8,
   now()-interval'6 days', NULL),

  ('ddjob005-demo-0005-0004-000000000004','dd000001-demo-agen-0005-000000000005',
   'Modelo Masculino — Marca de Óculos',
   'Modelo masculino para campanha de óculos de sol premium. Locação externa, dia inteiro.',
   'Model',1200.00,'2026-05-20','2026-05-25','Belo Horizonte, MG','closed',1,
   now()-interval'35 days', NULL)

ON CONFLICT (id) DO NOTHING;
