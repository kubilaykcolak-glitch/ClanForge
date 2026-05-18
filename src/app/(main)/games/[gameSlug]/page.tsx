// Hub root → renders the first live section (Overview by convention).
// We deliberately do NOT redirect to `/games/<slug>/overview` — keeping the
// short URL stable as the canonical landing is better for sharing.

import { notFound } from "next/navigation";
import { getDefaultSection, getGame } from "@/lib/games/registry";
import { SectionErrorFallback } from "@/components/games/SectionErrorFallback";
import type { GameSectionProps } from "@/lib/games/types";

interface PageProps {
  params: { gameSlug: string };
}

export default async function GameHubRootPage({ params }: PageProps) {
  const game    = getGame(params.gameSlug);
  if (!game) notFound();
  const section = getDefaultSection(game);
  if (!section) notFound();

  const props: GameSectionProps = {
    gameSlug: game.slug,
    gameName: game.name,
  };

  try {
    const mod = await section.loader();
    const SectionComponent = mod.default;
    return <SectionComponent {...props} />;
  } catch (err) {
    console.error("[game-hub] failed to render section", { gameSlug: game.slug, section: section.slug, err });
    return <SectionErrorFallback sectionLabel={section.label} gameSlug={game.slug} />;
  }
}
