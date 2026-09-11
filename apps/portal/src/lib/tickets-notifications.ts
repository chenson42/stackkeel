import "server-only";

import { getTicketOperators, type TicketOperator } from "@repo/db";
import { ADMIN_ROLE, FEATURES } from "@/lib/permissions";
import { db } from "@/lib/db";
import { enqueueEmail, escapeHtml } from "@/lib/email";

/**
 * Helpdesk email notifications — five triggers, each with a unique
 * templateKey, ALL through enqueueEmail() (Invariant 12: feature code never
 * talks to the provider). Every user-supplied string is escapeHtml()ed
 * before interpolation — XSS invariant.
 *
 * Bodies are kept to metadata + a short excerpt-free framing: ticket
 * SUBJECTS are included (operators need them to triage from the inbox);
 * message BODIES are deliberately NOT — the thread renders in-app, and
 * keeping bodies out of email also keeps them out of every forwarding
 * chain an inbox grows.
 *
 * Notification failure never fails the user action: callers fire these
 * after the mutation commits, and enqueueEmail failures are logged, not
 * rethrown (the queue itself retries provider failures; this guards
 * enqueue-time errors).
 */

const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001";

function portalTicketUrl(ticketId: string): string {
  return new URL(`/support/${ticketId}`, PORTAL_URL).href;
}

function adminTicketUrl(ticketId: string): string {
  return new URL(`/tickets/${ticketId}`, ADMIN_URL).href;
}

async function operators(): Promise<TicketOperator[]> {
  return getTicketOperators(db, FEATURES.ADMIN_TICKETS, ADMIN_ROLE);
}

async function safeEnqueue(input: Parameters<typeof enqueueEmail>[0]) {
  try {
    await enqueueEmail(input);
  } catch (err) {
    console.error("[tickets-notifications] enqueue failed:", err);
  }
}

export async function notifyOperatorsOfNewTicket(params: {
  ticketId: string;
  subject: string;
  submitterName: string;
}) {
  const safeSubject = escapeHtml(params.subject);
  const safeName = escapeHtml(params.submitterName);
  for (const op of await operators()) {
    await safeEnqueue({
      to: op.email,
      subject: `New support ticket: ${params.subject}`,
      html: [
        `<p><strong>${safeName}</strong> filed a new support ticket.</p>`,
        `<p><strong>Subject:</strong> ${safeSubject}</p>`,
        `<p><a href="${adminTicketUrl(params.ticketId)}">Open in the triage queue</a></p>`,
      ].join("\n"),
      templateKey: "ticket_new",
    });
  }
}

export async function notifySubmitterOfOperatorReply(params: {
  ticketId: string;
  subject: string;
  submitterEmail: string;
}) {
  const safeSubject = escapeHtml(params.subject);
  await safeEnqueue({
    to: params.submitterEmail,
    subject: `Reply to your support ticket: ${params.subject}`,
    html: [
      `<p>Support replied to your ticket <strong>${safeSubject}</strong>.</p>`,
      `<p><a href="${portalTicketUrl(params.ticketId)}">Read the reply</a></p>`,
    ].join("\n"),
    templateKey: "ticket_operator_reply",
  });
}

export async function notifyOperatorsOfSubmitterReply(params: {
  ticketId: string;
  subject: string;
  submitterName: string;
}) {
  const safeSubject = escapeHtml(params.subject);
  const safeName = escapeHtml(params.submitterName);
  for (const op of await operators()) {
    await safeEnqueue({
      to: op.email,
      subject: `Ticket reply from ${params.submitterName}: ${params.subject}`,
      html: [
        `<p><strong>${safeName}</strong> replied on ticket <strong>${safeSubject}</strong>.</p>`,
        `<p><a href="${adminTicketUrl(params.ticketId)}">Open the thread</a></p>`,
      ].join("\n"),
      templateKey: "ticket_submitter_reply",
    });
  }
}

export async function notifySubmitterOfResolution(params: {
  ticketId: string;
  subject: string;
  submitterEmail: string;
  resolvedAs: "resolved" | "declined";
}) {
  const safeSubject = escapeHtml(params.subject);
  const verb = params.resolvedAs === "resolved" ? "resolved" : "closed";
  await safeEnqueue({
    to: params.submitterEmail,
    subject: `Your support ticket was ${verb}: ${params.subject}`,
    html: [
      `<p>Your ticket <strong>${safeSubject}</strong> was ${verb}.</p>`,
      `<p><a href="${portalTicketUrl(params.ticketId)}">View the ticket</a></p>`,
    ].join("\n"),
    templateKey: "ticket_resolved",
  });
}

export async function notifySubmitterOfPromotion(params: {
  ticketId: string;
  subject: string;
  submitterEmail: string;
}) {
  const safeSubject = escapeHtml(params.subject);
  await safeEnqueue({
    to: params.submitterEmail,
    subject: "Your feedback became a support ticket",
    html: [
      `<p>Thanks for your feedback — we opened a support ticket to follow up: <strong>${safeSubject}</strong>.</p>`,
      `<p><a href="${portalTicketUrl(params.ticketId)}">Follow it here</a></p>`,
    ].join("\n"),
    templateKey: "ticket_feedback_promoted",
  });
}
