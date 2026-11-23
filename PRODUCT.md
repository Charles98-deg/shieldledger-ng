# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: an accounts-payable clerk at a mid-size Nigerian company (manufacturer, agro-processor or Free Trade Zone enterprise) reviewing a supplier payment batch **before** it is released. Desktop, office setting. (Confirmed 2026-11-23.)

Current evaluation audience: TCC'26 hackathon judges, who see the product as a **screen recording** (demo video, roughly 1400×900 at 110% zoom). The interface must stay legible after video compression and read as a credible AP/audit tool. (Confirmed 2026-11-23.)

## Product Purpose

The product checks a batch of supplier invoices before payment. The checks are:

- 3-way match (PO / goods-received note / invoice), plus duplicate and split-PO checks;
- supplier TIN against a taxpayer registry;
- VAT validity under the Nigeria Tax Act 2025;
- WHT computed under the 2024 WHT Regulations.

Each invoice gets a recommendation: release, release partial, hold, blocked or needs human review. Every recommendation carries an evidence trail. A second screen monitors a Free Zone enterprise's share of sales into the customs territory against the 25% line. Success means the clerk trusts each recommendation because every naira of it traces to a rule.

## Positioning

The LLM transcribes and Python decides: tax math and decisions run as deterministic Decimal code. Every number carries a rule ID, a citation, an honesty label (SECONDARY_VERIFIED, CONFLICTING, BRIEF_ONLY, UNVERIFIED or BUYER_POLICY, never "verified primary") and the exact text read from the document. The conservation check `net + WHT + held = gross` is proven to the kobo on every decision.

## Operating Context

- The work is a payment run: a batch of PDF invoices, with ERP master data (vendors, POs, GRNs) and a taxpayer registry.
- Three screens: Payment Run (decision table plus evidence drawer), Exposure Summary, and FTZ Monitor. A Statutory Register drawer and a Policies panel sit alongside them.
- An append-only, SHA-256 hash-chained audit log.
- The demo follows a timed click path in `docs/DEMO_SCRIPT.md`.

## Capabilities and Constraints

- Read-only: no payments, no ERP write-back.
- Money is Decimal on the server and arrives as strings. The UI formats it with BigInt kobo and does no float math.
- Frontend: React 18, TypeScript, Vite and Tailwind. No UI kit and no chart library. The JS bundle must stay under 200 KB gzip.
- Must work at 375 px with no horizontal scroll.
- Scope is fixed by the hackathon spec: do not add features.

## Brand Commitments

- Name in code and docs: "ShieldLedger NG". The user referred to it as "Tollgate" on 2026-11-23; a rename has **not** been confirmed.
- Tagline: "check before you pay". Built in Calabar for TCC'26.

## Evidence on Hand

- All demo data is fictional: 12 invoice PDFs in `demo/pack/` and seed data in `backend/seed/`.
- Golden numbers are in `backend/tests/golden/pack_expected.json`.
- There are no real customers, testimonials or field-validation quotes (`backend/seed/field_validation.json` is empty). None may be fabricated.

## Product Principles

1. Evidence or it didn't happen: every figure links to its rule and source text.
2. Say what is not verified: honesty labels are first-class content, never hidden.
3. Exact to the kobo: numbers are never rounded for looks.
4. Recommend, never act: the human releases the payment.

## Accessibility & Inclusion

- Must stay legible in a compressed screen recording: adequate type size and contrast, no meaning carried by hairline-thin strokes or subtle tints alone.
- Keyboard focus is visible, and status is never conveyed by color alone.
