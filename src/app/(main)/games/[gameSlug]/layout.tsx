// Shared chrome for every game-hub route — banner + tab nav. The slug is
// validated here once; the section page assumes it's well-formed.

import { notFound } from "next/navigation";
import { getGame } from "@/lib/games/registry";
import { GameHubBanner } from "@/components/games/GameHubBanner";
import { GameHubTabs } from "@/components/games/GameHubTabs";

interface LayoutProps {
  params:   { gameSlug: string };
  children: React.ReactNode;
}

export default function GameHubLayout({ params, children }: LayoutProps) {
  const game = getGame(params.gameSlug);
  if (!game) notFound();

  // Build a plain-serializable tab list for the client component. Doing the
  // shape transform server-side keeps function refs (icons) out of the RSC
  // payload, which avoids the prod-build "An error occurred in the Server
  // Components render" crash that fires when Lucide refs cross the boundary.
  const liveSections = game.sections.filter(s => s.status === "live");
  const hubTabs = liveSections.map((s, idx) => ({
    slug:  s.slug,
    label: s.label,
    href:  idx === 0 ? `/games/${game.slug}` : `/games/${game.slug}/${s.slug}`,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <GameHubBanner game={game} />
      <GameHubTabs gameSlug={game.slug} accentColor={game.accentColor} tabs={hubTabs} />
      {children}
    </div>
  );
}

export async function generateMetadata({ params }: { params: { gameSlug: string } }) {
  const game = getGame(params.gameSlug);
  if (!game) return { title: "Game · ClanForge" };
  return { title: `${game.name} · ClanForge` };
}
