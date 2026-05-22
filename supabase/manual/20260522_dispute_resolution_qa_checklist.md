# Admin Dispute Resolution QA Checklist

Run `supabase/manual/20260522_seed_dispute_test.sql` first. It creates QA-tagged jobs, contracts, disputes, and escrow lock wallet transactions without changing real wallet balances.

## Verification SQL

```sql
SELECT id, contract_id, workspace_id, status, reason, created_at
FROM contract_disputes
WHERE reason LIKE '%[QA seed]%'
ORDER BY created_at DESC;
```

```sql
SELECT id, user_id, type, amount, reference_id, idempotency_key, status, created_at
FROM wallet_transactions
WHERE reference_id IN (
  SELECT c.id::text
  FROM contracts c
  JOIN jobs j ON j.id = c.job_id
  WHERE j.title LIKE '%[QA seed]%'
     OR j.description LIKE '%[QA seed]%'
)
ORDER BY created_at DESC;
```

## Manual QA

1. Open `/admin/disputes` and confirm QA rows are visible, clickable, filterable by status, and show escrow amounts.
2. Open one active QA dispute and confirm full context loads: parties, job, contract status, signed-file availability, wallet transactions, payout eligibility, notes, and timeline.
3. Full payout: choose `Liberar custodia ao talento`, enter an admin note, confirm, then verify one `payout` wallet row, contract `status = 'paid'`, dispute `status = 'resolved_release'`.
4. Full refund: rerun the seed, choose `Reembolsar agencia`, enter an admin note, confirm, then verify one `refund` wallet row, contract `status = 'cancelled'`, dispute `status = 'resolved_refund'`.
5. Partial split: rerun the seed, choose `Decisao parcial`, enter talent and agency amounts whose sum is less than or equal to escrow, confirm, then verify one `payout` row and one `refund` row with no duplicate rows.
6. Double-click protection: repeat the same resolution request for a resolved dispute and confirm it returns a conflict and creates no second ledger row.
7. Race attempt: open the same dispute in two tabs and submit two different resolutions. Exactly one should succeed because the RPC locks the dispute row.
8. Payout blocked during dispute: while a QA dispute is `open` or `under_review`, attempt normal contract payout and confirm it is blocked before any payout wallet row is created.

## Cleanup SQL

```sql
DELETE FROM contract_dispute_notes
WHERE dispute_id IN (
  SELECT id
  FROM contract_disputes
  WHERE reason LIKE '%[QA seed]%'
     OR resolution_note LIKE '%[QA seed]%'
);

DELETE FROM contract_disputes
WHERE reason LIKE '%[QA seed]%'
   OR resolution_note LIKE '%[QA seed]%'
   OR contract_id IN (
     SELECT c.id
     FROM contracts c
     JOIN jobs j ON j.id = c.job_id
     WHERE j.title LIKE '%[QA seed]%'
        OR j.description LIKE '%[QA seed]%'
   );

DELETE FROM wallet_transactions
WHERE reference_id IN (
  SELECT c.id::text
  FROM contracts c
  JOIN jobs j ON j.id = c.job_id
  WHERE j.title LIKE '%[QA seed]%'
     OR j.description LIKE '%[QA seed]%'
)
   OR idempotency_key IN (
     SELECT 'escrow_' || c.id::text
     FROM contracts c
     JOIN jobs j ON j.id = c.job_id
     WHERE j.title LIKE '%[QA seed]%'
        OR j.description LIKE '%[QA seed]%'
   );

DELETE FROM contracts
WHERE job_id IN (
  SELECT id
  FROM jobs
  WHERE title LIKE '%[QA seed]%'
     OR description LIKE '%[QA seed]%'
);

DELETE FROM bookings
WHERE job_id IN (
  SELECT id
  FROM jobs
  WHERE title LIKE '%[QA seed]%'
     OR description LIKE '%[QA seed]%'
)
   OR job_title LIKE '%[QA seed]%';

DELETE FROM jobs
WHERE title LIKE '%[QA seed]%'
   OR description LIKE '%[QA seed]%';
```
