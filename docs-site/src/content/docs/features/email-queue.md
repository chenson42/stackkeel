---
title: Queued Email with Retry and Delivery Tracking
description: "Stackkeel's transactional email system: a database-backed queue with retries and backoff, a cron-driven processor, Resend delivery webhooks, an admin queue viewer with manual retry, and What's New release announcements."
---

Feature code in Stackkeel never talks to an email provider. It calls
`enqueueEmail()`, which writes a row to the `email_queue` table, and a cron-driven
processor does the sending. That one rule (Invariant 12) buys durability, retries,
observability, and testability in a single move.

## How the queue works

Each queued email carries an attempt counter (eight attempts by default), a
`next_attempt_at` backoff schedule, and lease-recovery timestamps so a crashed
processor run cannot strand a message in "processing" forever. The processor runs
every five minutes via `/api/cron/email-queue`, authenticated by a bearer
`CRON_SECRET` and returning 503 when unconfigured so a dead cron is loud. Sending
goes through Resend; permanently failed messages write an audit event.

In development with no provider key, the processor logs the message instead of
sending it. The seeded e2e suite exercises this path: filing a support ticket in the
Playwright run visibly drains the operator notification through the dev logger.

## Observability

- The **admin queue viewer** (`/email-queue`) lists pending, processing, sent, and
  failed messages with a manual retry action.
- The **Resend webhook** (`/api/webhooks/resend`) records delivered, opened,
  clicked, bounced, and complained events against the original row, so delivery
  questions are answerable from your own database.

## Who uses it

Everything: verification and password-reset emails, admin invites,
[helpdesk notifications](/features/helpdesk/) (five distinct triggers), and any
email your product adds. New senders inherit retries, dev-mode logging, and the
admin viewer for free.

## What's New announcements

A small companion system for product-to-user communication: admins write plain-text
release announcements at `/whats-new`, members see unseen entries surfaced in the
portal, and seen-state is tracked per user. HTML in the body is rejected outright
rather than sanitized.
