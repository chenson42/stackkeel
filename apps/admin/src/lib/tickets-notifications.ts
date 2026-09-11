import "server-only";

import { enqueueEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escape-html";

/**
 * Operator-side helpdesk notifications (submitter-facing). Mirrors the
 * portal's tickets-notifications.ts posture: unique templateKey per
 * trigger, everything through enqueueEmail (Invariant 12), every
 * user-supplied string escapeHtml()ed, ticket subjects in email but never
 * message BODIES, and enqueue failure never fails the mutation
 * (enqueueEmail is already non-throwing here).
 *
 * The operator-facing triggers (new ticket, submitter reply) live in the
 * PORTAL's copy — they fire from portal actions; this file carries only
 * what admin actions fire.
 */

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";

function portalTicketUrl(ticketId: string): string {
  // NEXT_PUBLIC_PORTAL_URL may point at a deep link (e.g. /home); resolve
  // against its origin so the path composes cleanly.
  return new URL(`/support/${ticketId}`, PORTAL_URL).href;
}

export async function notifySubmitterOfOperatorReply(params: {
  ticketId: string;
  subject: string;
  submitterEmail: string;
}) {
  const safeSubject = escapeHtml(params.subject);
  await enqueueEmail({
    to: params.submitterEmail,
    subject: `Reply to your support ticket: ${params.subject}`,
    html: [
      `<p>Support replied to your ticket <strong>${safeSubject}</strong>.</p>`,
      `<p><a href="${portalTicketUrl(params.ticketId)}">Read the reply</a></p>`,
    ].join("\n"),
    templateKey: "ticket_operator_reply",
  });
}

export async function notifySubmitterOfResolution(params: {
  ticketId: string;
  subject: string;
  submitterEmail: string;
  resolvedAs: "resolved" | "declined";
}) {
  const safeSubject = escapeHtml(params.subject);
  const verb = params.resolvedAs === "resolved" ? "resolved" : "closed";
  await enqueueEmail({
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
  await enqueueEmail({
    to: params.submitterEmail,
    subject: "Your feedback became a support ticket",
    html: [
      `<p>Thanks for your feedback — we opened a support ticket to follow up: <strong>${safeSubject}</strong>.</p>`,
      `<p><a href="${portalTicketUrl(params.ticketId)}">Follow it here</a></p>`,
    ].join("\n"),
    templateKey: "ticket_feedback_promoted",
  });
}
