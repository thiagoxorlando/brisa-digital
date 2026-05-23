# BrisaHub Demo Polish Checklist — 2026-05

Pre-sale / investor presentation readiness checklist. Run in order.

---

## Step 1 — Remove QA / Test Data

**Script:** `202605_clean_demo_data.sql`

Run in Supabase SQL Editor as service role.

- [ ] Section 0 (previews): review before deleting
- [ ] Section 1: delete `[QA seed]` jobs, contracts, disputes, wallet transactions
- [ ] Section 2: delete referral test submissions
- [ ] Section 3: delete QA notifications
- [ ] Section 4: optional manual patterns (review Section 0f output first)
- [ ] Section 5: verify all counts are 0

---

## Step 2 — Persona Seed (named rows)

**Script:** `202605_demo_persona_seed.sql`

Replaces known test-tagged rows with polished professional personas.

- [ ] Section 1: Agencies → BrisaHub Studio, Spark Casting, Nova Produções, Élite Eventos
- [ ] Section 2: Talent profiles → Bianca Martins, Lucas Ferreira, Amanda Rocha, Felipe Alves, Camila Torres, Rodrigo Lima
- [ ] Section 3: Jobs → 10 professional Brazilian campaign titles
- [ ] Section 4: Workspaces → BrisaHub Studio, Spark Workspace, Nova Produções Premium, Élite Casting
- [ ] Section 5: Contracts → professional `job_description` text
- [ ] Section 6: Bookings → professional `job_title` display values
- [ ] Section 7: Disputes → 5 professional Portuguese dispute reasons + resolutions
- [ ] Section 8: Support conversations → 7 professional subject lines
- [ ] Section 9: verification summary query

---

## Step 3 — Broader Content Audit

**Script:** `202605_full_ui_content_audit.sql` (READ ONLY)

Detects all remaining keyboard-mash, placeholder, and ugly strings using broader patterns (`sdf`, `qwe`, `zxc`, repeated chars regex `~ '(.)\1\1'`).

- [ ] Run Parts 1–10 and review each section
- [ ] Note counts in Part 11 summary

---

## Step 4 — Content Normalizer

**Script:** `202605_demo_content_normalizer.sql`

Fixes remaining ugly rows that weren't caught by the persona seed.

- [ ] Section 1: Agencies
- [ ] Section 2: Talent profiles (rotates through 10 Brazilian professional names)
- [ ] Section 3: Jobs (rotates through 10 campaign titles)
- [ ] Section 4: Workspaces
- [ ] Section 5: Contracts
- [ ] Section 6: Bookings
- [ ] Section 7: Disputes
- [ ] Section 8: Support conversations
- [ ] Section 9: verification summary (all statuses should be OK)

---

## Step 5 — Final Healthcheck

**Script:** `202605_demo_final_healthcheck.sql` (READ ONLY)

27 pass/fail checks across 3 categories + platform snapshot.

- [ ] Part A (10 checks): content cleanliness — all must be OK
- [ ] Part B (9 checks): relational integrity — all must be OK, no FAILs
- [ ] Part C (9 checks): demo flow readiness — all must be OK
- [ ] Part D: review platform snapshot numbers (believable volume?)

**Minimum acceptable snapshot for demo:**
| Metric | Minimum |
|---|---|
| Open jobs (open space) | ≥ 2 |
| Talent profiles | ≥ 3 |
| Agencies | ≥ 1 |
| Paid contracts | ≥ 1 |
| Confirmed contracts | ≥ 1 |
| Active premium workspaces | ≥ 1 |
| Disputes (any status) | ≥ 1 |

---

## Platform Code Changes (already applied)

These are code-level fixes applied as part of the demo polish phase:

### Bug Fix: Talent dashboard "0 contratos ativos"
- **File:** `app/talent/dashboard/page.tsx:81`
- **Change:** `acceptedContracts` filter now includes `"sent"` status (was missing it — aligned with workspace dashboard)
- **Before:** `["signed", "confirmed", "paid"]`
- **After:** `["sent", "signed", "confirmed"]`
- **Label:** Changed from `t("action_accept")` → `t("portal_active_contracts")` in `features/talent/TalentDashboard.tsx:159`

### Feature: Admin Control Center — Recent Activity Feed
- **File:** `lib/readModels/adminControlCenter.ts`
- Added `RecentActivityItem` type
- Added 4 parallel DB queries (recent contracts, wallet transactions, disputes, profiles)
- Merged, sorted by `created_at`, capped at 10 items
- **File:** `features/admin/AdminControlCenter.tsx`
- Added Section 5 "Atividade recente" between activity metrics and system health
- Color-coded dots and labels by event type/tone

### UI Polish: Premium Workspace Hero
- **File:** `app/agency/workspace/page.tsx`
- Hero padding reduced: `py-8` → `py-5` (~25% height reduction)
- Flex gap reduced: `gap-5` → `gap-4`
- Logo avatar size: `h-16 w-16` → `h-12 w-12`
- Title font: `text-[1.6rem] sm:text-[2rem]` → `text-[1.4rem] sm:text-[1.75rem]`

### Translation Rename: "Supervisão completa" → "Controle total do workspace"
- `lib/translations/pt.ts:1196`
- `lib/i18n/pt-BR.ts:403`
- `lib/i18n/en.ts:1203` (English: "Full workspace control")

---

## Demo Script Notes

1. **Open Space flow**: Log in as agency → Post a job → Log in as talent → Apply → Back to agency → Send contract → Log in as talent → Sign contract
2. **Escrow flow**: Agency deposits → Contract moves to `confirmed` → Agency releases → Talent wallet credited
3. **Dispute flow**: Agency opens dispute → Admin reviews → Admin resolves → Escrow released
4. **Premium workspace**: Log in as workspace owner → Show dashboard → Show talent roster → Show workspace jobs
5. **Admin control center**: Show alerts, financial ops (active escrow), recent activity feed, platform metrics
