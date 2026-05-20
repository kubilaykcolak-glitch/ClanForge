import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getContentById } from "@/lib/actions/game-content.actions";
import { GameContentForm } from "@/components/admin/GameContentForm";

// Admin auth reads the session cookie — must render dynamically.
export const dynamic = "force-dynamic";

export default async function EditGameContentPage({ params }: { params: { id: string } }) {
  const item = await getContentById(params.id);
  if (!item) notFound();

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
        Edit entry
      </h1>
      <GameContentForm existing={item} />
    </div>
  );
}
