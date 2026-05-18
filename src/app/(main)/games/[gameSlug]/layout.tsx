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

  return (
    <div className="max-w-6xl mx-auto">
      <GameHubBanner game={game} />
      <GameHubTabs game={game} />
      {children}
    </div>
  );
}

export async function generateMetadata({ params }: { params: { gameSlug: string } }) {
  const game = getGame(params.gameSlug);
  if (!game) return { title: "Game · ClanForge" };
  return { title: `${game.name} · ClanForge` };
}
