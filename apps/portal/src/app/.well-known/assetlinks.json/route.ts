/**
 * GET /.well-known/assetlinks.json — Android App Links. Module `mobile`.
 *
 * Google's verifier fetches this anonymously to bind the shell's Android
 * package to this origin. Derived from ANDROID_PACKAGE_NAME +
 * ANDROID_CERT_SHA256 (the app-signing certificate fingerprint — a public
 * identifier, not a secret). Degrades to an empty array when unconfigured;
 * never 500s and never sits behind a flag (same posture as the AASA route).
 */
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const certSha256 = process.env.ANDROID_CERT_SHA256;

  const statements =
    packageName && certSha256
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: [certSha256],
            },
          },
        ]
      : [];

  return NextResponse.json(statements, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
