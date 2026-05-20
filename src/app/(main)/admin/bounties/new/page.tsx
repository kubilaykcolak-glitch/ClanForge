import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PublishBountyForm } from "@/components/admin/PublishBountyForm";

export default function NewBountyPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/admin/bounties"
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronLeft size={12} /> Back
      </Link>
      <div>
        <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
          Publish bounty from intake
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Fill these in from the Discord intake ticket after vetting. The bounty will be live on the public board immediately.
        </p>
      </div>
      <PublishBountyForm />
    </div>
  );
}
