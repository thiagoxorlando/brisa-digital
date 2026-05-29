create table if not exists platform_settings (
  key          text primary key,
  value        jsonb not null,
  description  text null,
  updated_by   uuid null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

insert into platform_settings (key, value, description) values
  ('platform_name',                      '"BrisaHub"',  'Nome da plataforma'),
  ('support_email',                      'null',        'Email de suporte ao usuário'),
  ('new_agency_signup_enabled',          'true',        'Permite novos cadastros de agências'),
  ('new_talent_signup_enabled',          'true',        'Permite novos cadastros de talentos'),
  ('referrals_enabled',                  'true',        'Habilita sistema de indicações'),
  ('public_job_sharing_enabled',         'true',        'Permite compartilhamento público de vagas'),
  ('premium_plan_enabled',               'false',       'Habilita plano Premium (informativo)'),
  ('automatic_pix_withdrawals_enabled',  'false',       'Habilita saques PIX automáticos'),
  ('minimum_withdrawal_amount',          '1',           'Valor mínimo de saque em reais'),
  ('automatic_withdrawal_limit',         '0',           'Limite de valor para saque automático (0 = desativado)'),
  ('max_withdrawals_per_day',            '3',           'Máximo de saques por dia por usuário'),
  ('maintenance_mode_enabled',           'false',       'Modo de manutenção da plataforma'),
  ('require_terms_acceptance',           'true',        'Exige aceite dos termos de uso no cadastro')
on conflict (key) do nothing;
