/**
 * The labels file re-declares @repo/db's vocabulary arrays (server-only
 * poisoning — see tickets-labels.ts's header). This test IS the mirror
 * guarantee: a CHECK-constraint vocabulary edit that touches one file but
 * not the other fails here, in both apps (admin's copy imports this
 * module's exports? No — admin has its own copy; its own test mirrors it).
 */
import { describe, it, expect } from "vitest";
import * as db from "@repo/db";
import * as labels from "./tickets-labels";

describe("tickets-labels mirrors @repo/db's vocabularies", () => {
  it("arrays are identical", () => {
    expect([...labels.CHANGE_CLASSES]).toEqual([...db.CHANGE_CLASSES]);
    expect([...labels.TICKET_AREAS]).toEqual([...db.TICKET_AREAS]);
    expect([...labels.TICKET_PRIORITIES]).toEqual([...db.TICKET_PRIORITIES]);
    expect([...labels.TICKET_STATUSES]).toEqual([...db.TICKET_STATUSES]);
  });

  it("every vocabulary value has a label and a pill variant where applicable", () => {
    for (const c of db.CHANGE_CLASSES) expect(labels.CHANGE_CLASS_LABELS[c]).toBeTruthy();
    for (const a of db.TICKET_AREAS) expect(labels.TICKET_AREA_LABELS[a]).toBeTruthy();
    for (const p of db.TICKET_PRIORITIES) {
      expect(labels.TICKET_PRIORITY_LABELS[p]).toBeTruthy();
      expect(labels.TICKET_PRIORITY_VARIANT[p]).toBeTruthy();
    }
    for (const s of db.TICKET_STATUSES) {
      expect(labels.TICKET_STATUS_LABELS[s]).toBeTruthy();
      expect(labels.TICKET_STATUS_VARIANT[s]).toBeTruthy();
    }
  });
});
