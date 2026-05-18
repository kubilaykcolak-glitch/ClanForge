// Per-section route. Validates that (gameSlug, sectionSlug) maps to a
// REGISTERED + LIVE section — unknown game, unknown section, or a section
// flagged hidden all 404 here rather than rendering anything. Closes the
// "user crafts a URL for a section we haven't shipped" vector.
//
// The default-section slug also routes here (e.g. /games/league-of-legends/overview)
// so deep links to Overview keep working.

import { notFound } from "next/navigation";
import { getGame, getLiveSection } from "@/lib/games/registry";
import { SectionErrorFallback } from "@/components/games/SectionErrorFallback";
import type { GameSectionProps } from "@/lib/games/types";

interface PageProps {
  params: { gameSlug: string; sectionSlug: string };
}

export default async function GameHubSectionPage({ params }: PageProps) {
  const game    = getGame(params.gameSlug);
  if (!game) notFound();
  const section = getLiveSection(game, params.sectionSlug);
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
