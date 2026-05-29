# BrisaHub Demo Environment

Marketing/screenshot demo data. Run scripts in order in Supabase SQL Editor.

## Login credentials
All demo accounts: **Demo@BrisaHub2026**

## Run order

1. `01_demo_auth_users.sql` — Creates auth users (needs pgcrypto)
2. `02_demo_profiles_agencies.sql` — Profiles + agency records
3. `03_demo_talent_profiles.sql` — All 20 talent profiles
4. `04_demo_jobs.sql` — 32 jobs across all agencies
5. `05_demo_submissions_bookings_contracts.sql` — Applications, bookings, contracts
6. `06_demo_wallet_notifications.sql` — Financial history + notifications

## Demo Accounts

### Agencies
| Email | Company | Plan | Password |
|---|---|---|---|
| wave@brisahub.demo | Wave Creative Agency | Premium | Demo@BrisaHub2026 |
| bluehorizon@brisahub.demo | Blue Horizon Casting | Pro | Demo@BrisaHub2026 |
| prime@brisahub.demo | Prime Talent Group | Pro | Demo@BrisaHub2026 |
| lighthouse@brisahub.demo | Lighthouse Media | Free | Demo@BrisaHub2026 |
| urban@brisahub.demo | Urban Vision Studios | Free | Demo@BrisaHub2026 |

### Key Talents (for screenshots)
| Email | Name | Type |
|---|---|---|
| isabella.f@brisahub.demo | Isabella Ferreira | Model / Influencer |
| ana.p@brisahub.demo | Ana Paula Lima | Model / Brand Ambassador |
| camila.s@brisahub.demo | Camila Souza | Photographer / UGC |
| mariana.g@brisahub.demo | Mariana Gomes | Influencer / UGC |
| carolina.s@brisahub.demo | Carolina Santos | Model / Influencer |

## Best Screenshot Pages

| Page | Account | Why |
|---|---|---|
| /agency/dashboard | wave@brisahub.demo | 3 confirmed + 2 pending bookings, R$12k wallet |
| /agency/contracts | wave@brisahub.demo | Mix of paid/confirmed/sent contracts |
| /agency/finances | wave@brisahub.demo | Rich transaction history, positive wallet |
| /agency/bookings | bluehorizon@brisahub.demo | Active bookings at multiple stages |
| /talent/dashboard | ana.p@brisahub.demo | 5 notifications, paid + active contracts |
| /talent/contracts | isabella.f@brisahub.demo | Awaiting signature + active contract |
| /talent/finances | ana.p@brisahub.demo | R$4.4k balance, withdrawal history |
| /agency/talent | wave@brisahub.demo | 20 talent cards with avatars |

## Totals
- 5 agencies (2 Free, 2 Pro, 1 Premium)
- 20 talents (models, actors, influencers, photographers, videographers)
- 32 jobs (open/in-progress/closed)
- 40+ applications (submissions)
- 15 bookings (pending/confirmed/paid)
- 13 contracts (sent/signed/confirmed/paid)
- 20 wallet transactions
- 50+ notifications
