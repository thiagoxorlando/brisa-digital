# BrisaHub Demo Environment

Marketing/screenshot demo data. Run scripts in order in Supabase SQL Editor.
All IDs use valid hex UUIDs (characters 0-9 and a-f only).

## Password for all accounts
**Demo@BrisaHub2026**

## Run order (copy/paste each file into SQL Editor)

1. `01_demo_auth_users.sql` — auth.users (agencies + talents)
2. `02_demo_profiles_agencies.sql` — profiles + agencies rows
3. `03_demo_talent_profiles.sql` — talent_profiles rows
4. `04_demo_jobs.sql` — 32 jobs
5. `05_demo_submissions_bookings_contracts.sql` — applications, bookings, contracts
6. `06_demo_wallet_notifications.sql` — wallet transactions, notifications, history

## UUID scheme (all valid hex)

| Entity | UUID prefix |
|--------|-------------|
| Agency 1–5 | `a0000001-0000-4000-8000-00000000000{1..5}` |
| Talent 1–20 | `b0000002-0000-4000-8000-0000000000{01..20}` |
| Job 1–32 | `c0000003-0000-4000-8000-0000000000{01..32}` |
| Submission 1–32 | `e0000005-0000-4000-8000-0000000000{01..32}` |
| Booking 1–15 | `d0000004-0000-4000-8000-0000000000{01..15}` |
| Contract 1–13 | `f0000006-0000-4000-8000-0000000000{01..13}` |
| Wallet tx 1–19 | `aa000007-0000-4000-8000-0000000000{01..19}` |
| Notification 1–50 | `bb000008-0000-4000-8000-0000000000{01..50}` |
| Agency history 1–12 | `cc000009-0000-4000-8000-0000000000{01..12}` |

## Demo Accounts

### Agencies
| Email | Company | Plan |
|---|---|---|
| wave@brisahub.demo | Wave Creative Agency | Premium |
| bluehorizon@brisahub.demo | Blue Horizon Casting | Pro |
| prime@brisahub.demo | Prime Talent Group | Pro |
| lighthouse@brisahub.demo | Lighthouse Media | Free |
| urban@brisahub.demo | Urban Vision Studios | Free |

### Key Talents
| Email | Name | Role |
|---|---|---|
| isabella.f@brisahub.demo | Isabella Ferreira | Model/Influencer |
| ana.p@brisahub.demo | Ana Paula Lima | Model/Brand Ambassador |
| mariana.g@brisahub.demo | Mariana Gomes | UGC/Influencer |
| carolina.s@brisahub.demo | Carolina Santos | Model/Influencer |
| lucas.m@brisahub.demo | Lucas Mendes | Actor/UGC |

## Totals
- 5 agencies (1 Premium, 2 Pro, 2 Free)
- 20 talents
- 32 jobs (open / in_progress / closed)
- 32 submissions
- 15 bookings (pending / confirmed / paid)
- 13 contracts (sent / signed / confirmed / paid)
- 19 wallet transactions
- 50 notifications
- 12 agency-talent history entries

## Best screenshot pages
| Page | Login | Why |
|---|---|---|
| /agency/dashboard | wave@brisahub.demo | R$12k wallet, active bookings |
| /agency/finances | wave@brisahub.demo | Deposits + escrow + payouts |
| /agency/contracts | wave@brisahub.demo | 4-stage contract mix |
| /agency/bookings | bluehorizon@brisahub.demo | Multi-stage booking sections |
| /talent/dashboard | ana.p@brisahub.demo | R$4.4k balance, notifications |
| /talent/finances | ana.p@brisahub.demo | Payment history + withdrawals |
| /talent/contracts | isabella.f@brisahub.demo | Active + pending contracts |
| /agency/talent | any agency | 20 talent cards |
