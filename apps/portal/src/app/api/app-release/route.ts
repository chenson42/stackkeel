/**
 * GET /api/app-release — public version-gate policy. Module `mobile`.
 *
 * Deliberately unauthenticated: the policy contains no secrets (two build
 * numbers and operator copy), and the version gate must be able to read it
 * BEFORE a device has registered. Consumers fail open on any error.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReleasePolicy } from "@repo/db";

export async function GET() {
  const policy = await getReleasePolicy(db);
  return NextResponse.json({
    minBuild: policy?.minBuild ?? null,
    latestBuild: policy?.latestBuild ?? null,
    softMessage: policy?.softMessage ?? null,
  });
}
