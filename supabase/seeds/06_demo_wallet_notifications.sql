-- ============================================================
-- DEMO WALLET TRANSACTIONS + NOTIFICATIONS  (run sixth)
--
-- Wallet txns    : aa000007-0000-4000-8000-0000000000{01..19}
-- Notifications  : bb000008-0000-4000-8000-0000000000{01..50}
-- Agency history : cc000009-0000-4000-8000-0000000000{01..12}
-- ============================================================

-- ── WALLET TRANSACTIONS ───────────────────────────────────

INSERT INTO wallet_transactions (id, user_id, type, amount, status,
  description, reference_id, idempotency_key, created_at, processed_at)
VALUES
  -- Wave agency (a0000001-...-001): deposits + escrow + payout
  ('aa000007-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','deposit',15000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_01',now()-interval'40 days',now()-interval'40 days'),
  ('aa000007-0000-4000-8000-000000000002','a0000001-0000-4000-8000-000000000001','deposit', 8000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_02',now()-interval'25 days',now()-interval'25 days'),
  ('aa000007-0000-4000-8000-000000000003','a0000001-0000-4000-8000-000000000001','deposit', 5000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_03',now()-interval'10 days',now()-interval'10 days'),
  ('aa000007-0000-4000-8000-000000000004','a0000001-0000-4000-8000-000000000001','escrow_lock',8000.00,'completed','Custódia: Embaixadora Campanha Anual',NULL,'demo_esc_wave_01',now()-interval'19 days',now()-interval'19 days'),
  ('aa000007-0000-4000-8000-000000000005','b0000002-0000-4000-8000-000000000005','payout',7200.00,'completed','Pagamento ao talento — Embaixadora',NULL,'payout_f0000006-0000-4000-8000-000000000001',now()-interval'10 days',now()-interval'10 days'),

  -- Blue Horizon (a0000001-...-002): deposits + escrow + payouts
  ('aa000007-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000002','deposit',10000.00,'completed','Depósito via PIX — Blue Horizon',NULL,'demo_dep_blue_01',now()-interval'35 days',now()-interval'35 days'),
  ('aa000007-0000-4000-8000-000000000007','a0000001-0000-4000-8000-000000000002','deposit', 6000.00,'completed','Depósito via PIX — Blue Horizon',NULL,'demo_dep_blue_02',now()-interval'15 days',now()-interval'15 days'),
  ('aa000007-0000-4000-8000-000000000008','a0000001-0000-4000-8000-000000000002','escrow_lock',5000.00,'completed','Custódia: Embaixadores Rede Academias',NULL,'demo_esc_blue_01',now()-interval'21 days',now()-interval'21 days'),
  ('aa000007-0000-4000-8000-000000000009','b0000002-0000-4000-8000-000000000019','payout',4500.00,'completed','Pagamento ao talento — Embaixadores Academias',NULL,'payout_f0000006-0000-4000-8000-000000000003',now()-interval'12 days',now()-interval'12 days'),
  ('aa000007-0000-4000-8000-000000000010','a0000001-0000-4000-8000-000000000002','escrow_lock',1800.00,'completed','Custódia: Editorial Revista Digital',NULL,'demo_esc_blue_02',now()-interval'24 days',now()-interval'24 days'),
  ('aa000007-0000-4000-8000-000000000011','b0000002-0000-4000-8000-000000000001','payout',1440.00,'completed','Pagamento ao talento — Editorial Revista',NULL,'payout_f0000006-0000-4000-8000-000000000002',now()-interval'16 days',now()-interval'16 days'),

  -- Prime Talent (a0000001-...-003): deposits + escrow + payouts
  ('aa000007-0000-4000-8000-000000000012','a0000001-0000-4000-8000-000000000003','deposit',12000.00,'completed','Depósito via PIX — Prime Talent',NULL,'demo_dep_prime_01',now()-interval'38 days',now()-interval'38 days'),
  ('aa000007-0000-4000-8000-000000000013','a0000001-0000-4000-8000-000000000003','deposit', 5000.00,'completed','Depósito via PIX — Prime Talent',NULL,'demo_dep_prime_02',now()-interval'18 days',now()-interval'18 days'),
  ('aa000007-0000-4000-8000-000000000014','a0000001-0000-4000-8000-000000000003','escrow_lock',6000.00,'completed','Custódia: Catálogo Joalheria',NULL,'demo_esc_prime_01',now()-interval'29 days',now()-interval'29 days'),
  ('aa000007-0000-4000-8000-000000000015','b0000002-0000-4000-8000-000000000005','payout',5400.00,'completed','Pagamento ao talento — Catálogo Joalheria',NULL,'payout_f0000006-0000-4000-8000-000000000004',now()-interval'18 days',now()-interval'18 days'),

  -- Talent withdrawals
  ('aa000007-0000-4000-8000-000000000016','b0000002-0000-4000-8000-000000000005','withdrawal',5000.00,'paid','Saque via PIX — Ana Paula Lima',NULL,'demo_wdrl_t005_01',now()-interval'14 days',now()-interval'13 days'),
  ('aa000007-0000-4000-8000-000000000017','b0000002-0000-4000-8000-000000000001','withdrawal',1200.00,'paid','Saque via PIX — Isabella Ferreira',NULL,'demo_wdrl_t001_01',now()-interval'12 days',now()-interval'11 days'),
  ('aa000007-0000-4000-8000-000000000018','b0000002-0000-4000-8000-000000000019','withdrawal',3000.00,'paid','Saque via PIX — Carolina Santos',NULL,'demo_wdrl_t019_01',now()-interval'8 days',now()-interval'7 days'),
  ('aa000007-0000-4000-8000-000000000019','b0000002-0000-4000-8000-000000000006','withdrawal',1800.00,'paid','Saque via PIX — Thiago Rocha',NULL,'demo_wdrl_t006_01',now()-interval'13 days',now()-interval'12 days')

ON CONFLICT (id) DO NOTHING;

-- ── NOTIFICATIONS ─────────────────────────────────────────

INSERT INTO notifications (id, user_id, type, message, link, is_read, created_at)
VALUES
  -- Wave agency (a0000001-...-001) — 12 notifications
  ('bb000008-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','booking','Nova reserva criada: Campanha Verão 2026 — Moda Praia','/agency/bookings',false,now()-interval'3 days'),
  ('bb000008-0000-4000-8000-000000000002','a0000001-0000-4000-8000-000000000001','contract','Talento assinou o contrato','/agency/contracts',true,now()-interval'1 day'),
  ('bb000008-0000-4000-8000-000000000003','a0000001-0000-4000-8000-000000000001','booking','Nova reserva criada: UGC para Lançamento de Produto — Tech','/agency/bookings',true,now()-interval'6 days'),
  ('bb000008-0000-4000-8000-000000000004','a0000001-0000-4000-8000-000000000001','payment','Escrow bloqueado: R$ 2.500,00 em garantia','/agency/finances',true,now()-interval'7 days'),
  ('bb000008-0000-4000-8000-000000000005','a0000001-0000-4000-8000-000000000001','booking','Isabella Ferreira se candidatou à "Campanha Verão 2026"','/agency/bookings',true,now()-interval'4 days'),
  ('bb000008-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000001','booking','Ana Paula Lima se candidatou à "Campanha Verão 2026"','/agency/bookings',true,now()-interval'4 days'),
  ('bb000008-0000-4000-8000-000000000007','a0000001-0000-4000-8000-000000000001','contract','Pagamento liberado ao talento: R$ 7.200,00','/agency/finances',true,now()-interval'10 days'),
  ('bb000008-0000-4000-8000-000000000008','a0000001-0000-4000-8000-000000000001','payment','Depósito confirmado: R$ 5.000,00 adicionados à carteira','/agency/finances',true,now()-interval'10 days'),
  ('bb000008-0000-4000-8000-000000000009','a0000001-0000-4000-8000-000000000001','booking','Victor Lima se candidatou à "UGC para Lançamento de Produto"','/agency/bookings',false,now()-interval'7 days'),
  ('bb000008-0000-4000-8000-000000000010','a0000001-0000-4000-8000-000000000001','contract','Novo contrato criado: Campanha Institucional — Marca de Cosméticos','/agency/contracts',true,now()-interval'11 days'),
  ('bb000008-0000-4000-8000-000000000011','a0000001-0000-4000-8000-000000000001','booking','Mariana Gomes se candidatou à "Campanha Institucional"','/agency/bookings',true,now()-interval'11 days'),
  ('bb000008-0000-4000-8000-000000000012','a0000001-0000-4000-8000-000000000001','payment','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'7 days'),

  -- Blue Horizon (a0000001-...-002) — 8 notifications
  ('bb000008-0000-4000-8000-000000000013','a0000001-0000-4000-8000-000000000002','booking','Nova reserva: Lookbook Masculino — Coleção Primavera','/agency/bookings',false,now()-interval'5 days'),
  ('bb000008-0000-4000-8000-000000000014','a0000001-0000-4000-8000-000000000002','contract','Talento assinou o contrato','/agency/contracts',false,now()-interval'2 days'),
  ('bb000008-0000-4000-8000-000000000015','a0000001-0000-4000-8000-000000000002','payment','Pagamento liberado ao talento: R$ 4.500,00','/agency/finances',true,now()-interval'12 days'),
  ('bb000008-0000-4000-8000-000000000016','a0000001-0000-4000-8000-000000000002','booking','Parceria App Fintech — 3 influenciadoras confirmadas','/agency/bookings',true,now()-interval'14 days'),
  ('bb000008-0000-4000-8000-000000000017','a0000001-0000-4000-8000-000000000002','payment','Depósito confirmado: R$ 6.000,00 adicionados à carteira','/agency/finances',true,now()-interval'15 days'),
  ('bb000008-0000-4000-8000-000000000018','a0000001-0000-4000-8000-000000000002','contract','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'10 days'),
  ('bb000008-0000-4000-8000-000000000019','a0000001-0000-4000-8000-000000000002','booking','Lucas Mendes se candidatou ao "Lookbook Masculino"','/agency/bookings',true,now()-interval'6 days'),
  ('bb000008-0000-4000-8000-000000000020','a0000001-0000-4000-8000-000000000002','booking','Diego Vieira se candidatou ao "Lookbook Masculino"','/agency/bookings',true,now()-interval'5 days'),

  -- Prime Talent (a0000001-...-003) — 5 notifications
  ('bb000008-0000-4000-8000-000000000021','a0000001-0000-4000-8000-000000000003','booking','Nova reserva: Campanha Digital — E-commerce de Moda','/agency/bookings',true,now()-interval'17 days'),
  ('bb000008-0000-4000-8000-000000000022','a0000001-0000-4000-8000-000000000003','payment','Pagamento liberado ao talento: R$ 5.400,00','/agency/finances',true,now()-interval'18 days'),
  ('bb000008-0000-4000-8000-000000000023','a0000001-0000-4000-8000-000000000003','payment','Pagamento liberado ao talento: R$ 1.920,00','/agency/finances',true,now()-interval'16 days'),
  ('bb000008-0000-4000-8000-000000000024','a0000001-0000-4000-8000-000000000003','booking','Isabella Ferreira confirmou contrato e-commerce','/agency/bookings',true,now()-interval'15 days'),
  ('bb000008-0000-4000-8000-000000000025','a0000001-0000-4000-8000-000000000003','contract','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'12 days'),

  -- Isabella Ferreira (b0000002-...-001) — 5 notifications
  ('bb000008-0000-4000-8000-000000000026','b0000002-0000-4000-8000-000000000001','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'3 days'),
  ('bb000008-0000-4000-8000-000000000027','b0000002-0000-4000-8000-000000000001','payment','Agência confirmou o contrato e realizou o depósito','/talent/contracts',true,now()-interval'17 days'),
  ('bb000008-0000-4000-8000-000000000028','b0000002-0000-4000-8000-000000000001','payment','Agência liberou seu pagamento de R$ 1.440,00 — a caminho!','/talent/finances',true,now()-interval'16 days'),
  ('bb000008-0000-4000-8000-000000000029','b0000002-0000-4000-8000-000000000001','contract','Novo contrato criado: Campanha Digital — E-commerce de Moda','/talent/contracts',true,now()-interval'17 days'),
  ('bb000008-0000-4000-8000-000000000030','b0000002-0000-4000-8000-000000000001','payment','Saque via PIX concluído: R$ 1.200,00','/talent/finances',true,now()-interval'11 days'),

  -- Ana Paula Lima (b0000002-...-005) — 6 notifications
  ('bb000008-0000-4000-8000-000000000031','b0000002-0000-4000-8000-000000000005','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'2 days'),
  ('bb000008-0000-4000-8000-000000000032','b0000002-0000-4000-8000-000000000005','payment','Agência confirmou o contrato e realizou o depósito','/talent/contracts',true,now()-interval'29 days'),
  ('bb000008-0000-4000-8000-000000000033','b0000002-0000-4000-8000-000000000005','payment','Agência liberou seu pagamento de R$ 7.200,00 — a caminho!','/talent/finances',true,now()-interval'10 days'),
  ('bb000008-0000-4000-8000-000000000034','b0000002-0000-4000-8000-000000000005','payment','Agência liberou seu pagamento de R$ 5.400,00 — a caminho!','/talent/finances',true,now()-interval'18 days'),
  ('bb000008-0000-4000-8000-000000000035','b0000002-0000-4000-8000-000000000005','payment','Saque via PIX concluído: R$ 5.000,00','/talent/finances',true,now()-interval'13 days'),
  ('bb000008-0000-4000-8000-000000000036','b0000002-0000-4000-8000-000000000005','booking','Você foi reservada! Embaixadora Campanha Anual','/talent/bookings',true,now()-interval'19 days'),

  -- Carolina Santos (b0000002-...-019) — 4 notifications
  ('bb000008-0000-4000-8000-000000000037','b0000002-0000-4000-8000-000000000019','payment','Agência liberou seu pagamento de R$ 4.500,00 — a caminho!','/talent/finances',true,now()-interval'12 days'),
  ('bb000008-0000-4000-8000-000000000038','b0000002-0000-4000-8000-000000000019','payment','Saque via PIX concluído: R$ 3.000,00','/talent/finances',true,now()-interval'7 days'),
  ('bb000008-0000-4000-8000-000000000039','b0000002-0000-4000-8000-000000000019','booking','Você foi reservada! Embaixadores Rede de Academias','/talent/bookings',true,now()-interval'21 days'),
  ('bb000008-0000-4000-8000-000000000040','b0000002-0000-4000-8000-000000000019','contract','Contrato assinado com sucesso','/talent/contracts',true,now()-interval'19 days'),

  -- Lucas Mendes (b0000002-...-002) — 3 notifications
  ('bb000008-0000-4000-8000-000000000041','b0000002-0000-4000-8000-000000000002','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'5 days'),
  ('bb000008-0000-4000-8000-000000000042','b0000002-0000-4000-8000-000000000002','booking','Você foi reservado! Lookbook Streetwear — Coleção Urbana','/talent/bookings',true,now()-interval'13 days'),
  ('bb000008-0000-4000-8000-000000000043','b0000002-0000-4000-8000-000000000002','payment','Agência liberou seu pagamento de R$ 960,00 — a caminho!','/talent/finances',true,now()-interval'25 days'),

  -- Mariana Gomes (b0000002-...-009) — 2 notifications
  ('bb000008-0000-4000-8000-000000000044','b0000002-0000-4000-8000-000000000009','booking','Você foi reservada! Campanha Institucional — Cosméticos','/talent/bookings',true,now()-interval'11 days'),
  ('bb000008-0000-4000-8000-000000000045','b0000002-0000-4000-8000-000000000009','contract','Novo contrato recebido: Campanha Institucional','/talent/contracts',false,now()-interval'11 days'),

  -- Thiago Rocha (b0000002-...-006) — 3 notifications
  ('bb000008-0000-4000-8000-000000000046','b0000002-0000-4000-8000-000000000006','payment','Agência liberou seu pagamento de R$ 1.920,00 — a caminho!','/talent/finances',true,now()-interval'16 days'),
  ('bb000008-0000-4000-8000-000000000047','b0000002-0000-4000-8000-000000000006','payment','Saque via PIX concluído: R$ 1.800,00','/talent/finances',true,now()-interval'12 days'),
  ('bb000008-0000-4000-8000-000000000048','b0000002-0000-4000-8000-000000000006','booking','Você foi reservado! Embaixador — Marca de Cervejas Artesanais','/talent/bookings',true,now()-interval'27 days'),

  -- Victor Lima (b0000002-...-016) — 2 notifications
  ('bb000008-0000-4000-8000-000000000049','b0000002-0000-4000-8000-000000000016','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'5 days'),
  ('bb000008-0000-4000-8000-000000000050','b0000002-0000-4000-8000-000000000016','booking','Você foi reservado! UGC para Lançamento de Produto — Tech','/talent/bookings',false,now()-interval'6 days')

ON CONFLICT (id) DO NOTHING;

-- ── AGENCY TALENT HISTORY ─────────────────────────────────

INSERT INTO agency_talent_history (id, agency_id, talent_id, created_at)
VALUES
  ('cc000009-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','b0000002-0000-4000-8000-000000000005',now()-interval'10 days'),
  ('cc000009-0000-4000-8000-000000000002','a0000001-0000-4000-8000-000000000001','b0000002-0000-4000-8000-000000000009',now()-interval'7 days'),
  ('cc000009-0000-4000-8000-000000000003','a0000001-0000-4000-8000-000000000001','b0000002-0000-4000-8000-000000000001',now()-interval'16 days'),
  ('cc000009-0000-4000-8000-000000000004','a0000001-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000001',now()-interval'16 days'),
  ('cc000009-0000-4000-8000-000000000005','a0000001-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000019',now()-interval'12 days'),
  ('cc000009-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000013',now()-interval'10 days'),
  ('cc000009-0000-4000-8000-000000000007','a0000001-0000-4000-8000-000000000003','b0000002-0000-4000-8000-000000000005',now()-interval'18 days'),
  ('cc000009-0000-4000-8000-000000000008','a0000001-0000-4000-8000-000000000003','b0000002-0000-4000-8000-000000000006',now()-interval'16 days'),
  ('cc000009-0000-4000-8000-000000000009','a0000001-0000-4000-8000-000000000003','b0000002-0000-4000-8000-000000000001',now()-interval'12 days'),
  ('cc000009-0000-4000-8000-000000000010','a0000001-0000-4000-8000-000000000005','b0000002-0000-4000-8000-000000000002',now()-interval'25 days'),
  ('cc000009-0000-4000-8000-000000000011','a0000001-0000-4000-8000-000000000005','b0000002-0000-4000-8000-000000000006',now()-interval'13 days'),
  ('cc000009-0000-4000-8000-000000000012','a0000001-0000-4000-8000-000000000005','b0000002-0000-4000-8000-000000000014',now()-interval'13 days')
ON CONFLICT (id) DO NOTHING;
