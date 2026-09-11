"use client"

// Promoted from a predecessor app
// (2026-09-04-shared-login-component, Increment A — Phase 2's flagged loose
// end: a predecessor app had its own local Label wrapper, Portal used raw <label>
// tags, neither routed through a shared primitive). Byte-identical logic;
// only the `cn` import path changed to this package's relative convention.

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
