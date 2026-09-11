/**
 * POST /api/webhooks/resend — Resend delivery-event receiver.
 *
 * Resend signs webhooks using the Svix scheme. This handler verifies the
 * signature hand-rolled (DECISION-028 / Phase 2 Ruling 2) and routes five
 * event types onto the email_queue row matched by providerMessageId:
 *   email.delivered  → deliveredAt
 *   email.opened     → openedAt
 *   email.clicked    → clickedAt
 *   email.bounced    → bouncedAt + failureReason
 *   email.complained → complainedAt
 *
 * Response contract per DECISION-028:
 *   RESEND_WEBHOOK_SECRET absent → 200 {received:false, note:"Webhook not configured."}
 *   Missing svix headers          → 400 {error:"Missing webhook headers."}
 *   Bad / stale signature         → 400 {error:"Invalid webhook signature."}
 *   Unknown event type            → 200 {received:true, handled:false}
 *   Known type (matched or not)   → 200 {received:true, handled:true}
 *   DB error                      → 500 {error:"Internal server error."}
 *
 * The check:audit tripwire scans only src/app/*** /actions.ts files — this
 * route handler is intentionally outside that scope. "check:audit passes" does
 * NOT mean this file is audit-covered; the route has no audit events to write
 * (delivery events are informational, not security-sensitive mutations).
 *
 * Proxy note: /api/* paths fall through src/proxy.ts without an auth redirect
 * (line 26: `if (pathname.startsWith("/api/")) return NextResponse.next()`).
 * Signature verification is this handler's sole authentication mechanism.
 */

import { NextResponse } from "next/server";
import { recordDeliveryEvent } from "@/lib/email/queue";
import { verifyResendSignature } from "./verify-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string };
  };
};

const HANDLED_TYPES = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
] as const);

type HandledType = "email.delivered" | "email.opened" | "email.clicked" | "email.bounced" | "email.complained";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { received: false, note: "Webhook not configured." },
      { status: 200 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing webhook headers." },
      { status: 400 },
    );
  }

  // Read raw body BEFORE JSON parse — req.json() consumes the stream and
  // the HMAC is computed over the raw bytes, not the parsed object.
  const rawBody = await req.text();

  if (
    !verifyResendSignature(svixId, svixTimestamp, svixSignature, rawBody, secret)
  ) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    return NextResponse.json({ received: true, note: "No email_id on event." });
  }

  if (!HANDLED_TYPES.has(event.type as HandledType)) {
    return NextResponse.json({ received: true, handled: false });
  }

  try {
    const occurredAt =
      event.created_at != null ? new Date(event.created_at) : undefined;
    const failureReason =
      event.type === "email.bounced"
        ? (event.data?.bounce?.message ?? undefined)
        : undefined;

    const { matched } = await recordDeliveryEvent(
      emailId,
      event.type as HandledType,
      { occurredAt, failureReason },
    );

    if (!matched) {
      console.warn("[webhook/resend] no row matched providerMessageId", {
        emailId,
        type: event.type,
      });
    }

    return NextResponse.json({ received: true, handled: true });
  } catch (err) {
    console.error("[webhook/resend] DB error processing event", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
