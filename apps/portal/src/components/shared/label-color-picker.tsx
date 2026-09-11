"use client";

import { Button } from "@repo/ui";

/**
 * Fixed color palette for labels (task-mgmt-1a-inc3-labels design doc: "a
 * small fixed palette is fine, doesn't need to be a full color wheel").
 * Brand colors from docs/product/branding.md come first, plus three
 * additional hues so an org with more labels than brand colors can still
 * tell them apart at a glance.
 */
export const LABEL_COLOR_PALETTE = [
  { name: "Ocean", hex: "#2c7ba6" },
  { name: "Sky blue", hex: "#409dcf" },
  { name: "Sky", hex: "#79c9f3" },
  { name: "Coral", hex: "#fd6251" },
  { name: "Gold", hex: "#ffd481" },
  { name: "Green", hex: "#2f9e59" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Slate", hex: "#6b7280" },
] as const;

export function LabelColorPicker({
  value,
  onChange,
  idPrefix = "label-color",
}: {
  value: string;
  onChange: (hex: string) => void;
  idPrefix?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Label color"
      className="flex flex-wrap gap-2"
    >
      {LABEL_COLOR_PALETTE.map((swatch) => {
        const selected = value.toLowerCase() === swatch.hex.toLowerCase();
        return (
          <Button
            key={swatch.hex}
            type="button"
            variant="ghost"
            size="icon"
            role="radio"
            aria-checked={selected}
            id={`${idPrefix}-${swatch.hex.slice(1)}`}
            title={swatch.name}
            onClick={() => onChange(swatch.hex)}
            className={`shrink-0 rounded-full border-2 hover:bg-transparent hover:opacity-90 active:opacity-75 dark:hover:bg-transparent ${
              selected ? "border-foreground" : "border-transparent"
            }`}
          >
            <span
              className="h-6 w-6 rounded-full"
              style={{ backgroundColor: swatch.hex }}
              aria-hidden="true"
            />
            <span className="sr-only">{swatch.name}</span>
          </Button>
        );
      })}
    </div>
  );
}
