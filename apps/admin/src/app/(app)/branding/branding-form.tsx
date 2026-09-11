"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Input, Label, Checkbox } from "@repo/ui";
// @repo/brand's generator is pure (zero runtime imports), so running it in
// the browser for the live preview is safe and keeps preview === saved
// reality: the SAME function the server-side emitter runs.
import {
  generateBrand,
  RAMP_STEPS,
  TYPE_PAIRINGS,
  type GeneratedBrand,
} from "@repo/brand";
import { saveBrandingAction, clearBrandingAction } from "./actions";

const SEED_HEX_RE = /^#[0-9a-f]{6}$/;

const SELECT_CLASSES =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm " +
  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function RampPreview({ scheme, brand }: { scheme: "light" | "dark"; brand: GeneratedBrand }) {
  const ramp = brand[scheme];
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground capitalize">{scheme}</p>
      <div className="mt-1.5 flex overflow-hidden rounded-md border border-border">
        {RAMP_STEPS.map((step) => (
          <div
            key={step}
            className="flex h-12 flex-1 items-end justify-center pb-1"
            style={{ backgroundColor: ramp[step] }}
            title={`${step}: ${ramp[step]}`}
          >
            <span
              className="text-[10px] font-medium"
              style={{ color: step >= 500 !== (scheme === "dark") ? "#ffffff" : "#000000" }}
            >
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BrandingForm({
  initial,
  flagEnabled,
}: {
  initial: { seedHex: string; typePairing: string; lightOnly: boolean } | null;
  flagEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seedHex, setSeedHex] = useState(initial?.seedHex ?? "#3b82f6");
  const [typePairing, setTypePairing] = useState(initial?.typePairing ?? "classic");
  const [lightOnly, setLightOnly] = useState(initial?.lightOnly ?? false);

  const seedValid = SEED_HEX_RE.test(seedHex.trim().toLowerCase());
  const preview = useMemo(() => {
    if (!seedValid) return null;
    try {
      return generateBrand(seedHex.trim().toLowerCase());
    } catch {
      return null;
    }
  }, [seedHex, seedValid]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveBrandingAction({
        seedHex: seedHex.trim().toLowerCase(),
        typePairing,
        lightOnly,
      });
      if (result.ok) {
        toast.success(
          flagEnabled
            ? "Brand saved — live now."
            : "Brand saved. Enable the ui.brand_theming flag to apply it.",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await clearBrandingAction();
      if (result.ok) {
        toast.success("Brand cleared — back to the Starter palette.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="seed-hex">Seed color</Label>
          <div className="flex items-center gap-2">
            {/* The native color input is a picker, not a dialog — allowed. */}
            <input
              type="color"
              aria-label="Pick seed color"
              className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
              value={seedValid ? seedHex.trim().toLowerCase() : "#3b82f6"}
              onChange={(e) => setSeedHex(e.target.value)}
            />
            <Input
              id="seed-hex"
              value={seedHex}
              onChange={(e) => setSeedHex(e.target.value)}
              placeholder="#1a5aa8"
              aria-invalid={!seedValid}
            />
          </div>
          {!seedValid && (
            <p className="text-xs text-destructive">
              Enter a 6-digit hex color like #1a5aa8.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type-pairing">Type pairing</Label>
          <select
            id="type-pairing"
            className={SELECT_CLASSES}
            value={typePairing}
            onChange={(e) => setTypePairing(e.target.value)}
          >
            {TYPE_PAIRINGS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} — {p.heading} / {p.body}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={lightOnly}
          onCheckedChange={(v) => setLightOnly(v === true)}
        />
        Light scheme only (the dark toggle keeps the light brand ramp)
      </label>

      {preview && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Preview</p>
          <RampPreview scheme="light" brand={preview} />
          <RampPreview scheme="dark" brand={preview} />
          {preview.adjustments.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {preview.adjustments.map((a, i) => (
                <li key={i}>• {a.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        {initial ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Clear brand
          </button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || !seedValid}>
          {pending ? "Saving…" : "Save brand"}
        </Button>
      </div>
    </form>
  );
}
