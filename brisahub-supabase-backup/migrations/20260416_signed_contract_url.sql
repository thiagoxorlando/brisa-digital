-- Add signed contract URL column to contracts table
-- signed_contract_url = version uploaded by talent after signing
alter table contracts
  add column if not exists signed_contract_url text;
