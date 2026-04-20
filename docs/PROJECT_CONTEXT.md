# 🧠 PROJECT CONTEXT — Hiring Platform

## Overview

This is a hiring platform where **agencies/businesses hire talent** for short-term work (events, shifts, gigs).

The platform replaces WhatsApp-based hiring by providing:

- structured hiring flow
- contracts
- escrow payments
- team history
- automation

---

## 🎯 Core Value

> “Organize hiring, payments, and team management in one place”

---

## 👥 Roles

### Agency (Business)
- creates jobs
- hires talent
- pays through platform
- manages team

### Talent (Worker)
- applies to jobs
- signs contracts
- gets paid (minus commission)

---

## 💰 Business Model

- Agency pays **monthly subscription**
- Talent pays **commission per job**

---

## 📦 Plans

### 🟢 FREE
- 1 active job
- max 3 hires per job
- commission: 20%
- no credit card required

### 🔵 PRO (~R$127/month)
- unlimited jobs
- unlimited hires
- commission: 15%

### 🟣 PREMIUM (~R$297/month)
- unlimited usage
- commission: 10–12%
- private hiring environment (closed talent pool)

---

## 🔁 Booking Lifecycle

Booking status:


- Talent signs contract
- Agency confirms + pays (escrow)
- Platform releases payment

---

## 💳 Financial System

### Escrow
- Agency funds are locked on confirmation
- Stored in platform balance

### Payout
- Talent receives payment when job is completed
- Commission deducted from talent

---

## 🔐 Idempotency (CRITICAL)

Used to prevent double payments:

Tables:
- `wallet_transactions`
- `notifications`

Field:
- `idempotency_key` (UNIQUE)

Used in:
- escrow
- payout

---

## 🔔 Notifications

- in-app notifications
- stored in DB
- idempotent (no duplicates)

---

## 🧠 Core Systems

### 1. Rehire System
- Table: `agency_talent_history`
- Tracks:
  - jobs_count
  - last_worked_at
  - favorites
- Triggered when booking becomes `paid`

---

### 2. Availability System
- Talent sets availability
- Used to filter candidates

---

### 3. Auto-Invite System
- Automatically suggests talents based on:
  - availability
  - history
  - reliability

---

### 4. Reliability System
- Based on real behavior (NOT ratings)

Fields:
- jobs_completed
- jobs_cancelled

Score:


Labels:
- ≥90% → Confiável
- 70–89% → Bom histórico
- <70% → Atenção

---

## 🗄 Database (Supabase)

### Key Tables

#### profiles
- id
- plan (free / pro / premium)

---

#### bookings
- id
- agency_id
- talent_user_id
- status

---

#### contracts
- id
- booking_id
- status

---

#### wallet_transactions
- user_id
- amount
- type
- idempotency_key (UNIQUE)

---

#### notifications
- user_id
- message
- idempotency_key (UNIQUE)

---

#### agency_talent_history
- agency_id
- talent_id
- jobs_count
- last_worked_at
- is_favorite

UNIQUE (agency_id, talent_id)

---

## ⚙️ Backend Rules

- plan is source of truth (from DB)
- no hardcoded plan logic
- all limits enforced in backend

### Limits

FREE:
- max 1 job
- max 3 hires

PRO/PREMIUM:
- unlimited

---

### Commission

- based on plan
- applied during payout
- deducted from talent

---

## 🖥 Frontend Rules

- always fetch `profiles.plan`
- no local plan assumptions
- paywall enforced via plan
- UI reflects DB state

---

## 🚨 Critical Constraints

- bookings.status must support:
  ('pending', 'pending_payment', 'confirmed', 'paid', 'cancelled')

- idempotency_key must be UNIQUE (no partial index)

- agency_talent_history must exist + trigger must work

---

## 🔄 Automation

- triggers update history automatically
- RPC handles financial flows atomically

---

## 🧪 Required System Guarantees

- no double payment
- no duplicate notifications
- consistent booking/contract status
- history always reflects paid work

---

## 🎯 Product Goal

Become the **default system businesses use to hire and manage temporary workers**

---

## 🚀 Current Stage

- Product: functional ✅
- Systems: built ✅
- Monetization: implemented ✅
- Next phase: **user acquisition + real-world validation**

---

## ⚠️ Development Rules

- every new feature must include DB migration
- always verify Supabase schema
- never assume columns exist
- always backfill when needed

