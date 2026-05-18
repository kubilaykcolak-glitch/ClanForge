// Hub root → renders the first live section (Overview by convention).
// We deliberately do NOT redirect to `/games/<slug>/overview` — keeping the
// short URL stable as the canonical landing is better for sharing.

import { notFound } from "next/navigation";
import { getDefaultSection, getGame } from "@/lib/games/registry";
import type { GameSectionProps } from "@/lib/games/types";

interface PageProps {
  params: { gameSlug: string };
}

export default async function GameHubRootPage({ params }: PageProps) {
  const game    = getGame(params.gameSlug);
  if (!game) notFound();
  const section = getDefaultSection(game);
  if (!section) notFound();

  const mod = await section.loader();
  const SectionComponent = mod.default;

  const props: GameSectionProps = {
    gameSlug: game.slug,
    gameName: game.name,
  };

  return <SectionComponent {...props} />;
}
