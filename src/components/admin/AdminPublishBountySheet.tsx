"use client";

// ─── AdminPublishBountySheet ─────────────────────────────────────────────────
//
// Right-side slide-over wrapper around PublishBountyForm. Lets mods publish
// a new bounty from intake without leaving /admin/bounties — pairs with the
// existing /admin/bounties/new full-page route which is kept as a deep-link
// backup. Both surfaces render the same PublishBountyForm so there's no
// divergence risk.

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PublishBountyForm } from "./PublishBountyForm";

export function AdminPublishBountySheet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold"
        style={{ background: "var(--accent)", color: "white" }}
      >
        <Plus size={14} /> Publish from intake
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
          style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--border-default)" }}
        >
          <SheetHeader className="mb-4">
            <SheetTitle
              className="font-display font-bold leading-tight"
              style={{ color: "var(--text-primary)", fontSize: 18 }}
            >
              Publish bounty from intake
            </SheetTitle>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Fill these in from the Discord intake ticket after vetting. The bounty goes
              live on the public board immediately.
            </p>
          </SheetHeader>

          <PublishBountyForm />
        </SheetContent>
      </Sheet>
    </>
  );
}
