import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GameContentForm } from "@/components/admin/GameContentForm";

export default function NewGameContentPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/admin/game-content"
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronLeft size={12} /> Back
      </Link>
      <h1 className="font-display font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
        New entry
      </h1>
      <GameContentForm />
    </div>
  );
}
