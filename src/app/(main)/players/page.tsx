import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import PlayersClient, { type PlayerRow } from "@/components/player/PlayersClient";

export default async function PlayersPage() {
  const uid = headers().get("x-user-id");

  const snap = await adminDb
    .collection("profiles")
    .where("isPrivate", "==", false)
    .orderBy("xp", "desc")
    .limit(48)
    .get();

  const toMs = (v: unknown) =>
    (v as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? Date.now();

  const players: PlayerRow[] = snap.docs.map(d => {
    const data = d.data() as Record<string, unknown>;
    return {
      id:                d.id,
      username:          (data.username           as string)        ?? "",
      displayName:       (data.displayName        as string)        ?? "",
      avatarUrl:         (data.avatarUrl          as string | undefined),
      bio:               (data.bio                as string | undefined),
      country:           (data.country            as string | undefined),
      steamUrl:          (data.steamUrl           as string | undefined),
      xboxGamertag:      (data.xboxGamertag       as string | undefined),
      psnId:             (data.psnId              as string | undefined),
      discordTag:        (data.discordTag         as string | undefined),
      twitchUrl:         (data.twitchUrl          as string | undefined),
      xp:                (data.xp                 as number)        ?? 0,
      tournamentsPlayed: (data.tournamentsPlayed  as number)        ?? 0,
      tournamentsWon:    (data.tournamentsWon     as number)        ?? 0,
      isVerified:        (data.isVerified         as boolean)       ?? false,
      isAdmin:           (data.isAdmin            as boolean)       ?? false,
      isPrivate:         (data.isPrivate          as boolean)       ?? false,
      clanId:            (data.clanId             as string | null) ?? null,
      clanTag:           (data.clanTag            as string | null) ?? null,
      clanSlug:          (data.clanSlug           as string | null) ?? null,
      clanName:          (data.clanName           as string | null) ?? null,
      bannerUrl:         (data.bannerUrl          as string | null) ?? null,
      backgroundId:      (data.backgroundId       as string | null) ?? null,
      accentColour:      (data.accentColour       as string | null) ?? null,
      createdAt:         toMs(data.createdAt),
      updatedAt:         toMs(data.updatedAt),
    };
  });

  let ownIsPrivate = false;
  if (uid) {
    const ownSnap = await adminDb.collection("profiles").doc(uid).get();
    if (ownSnap.exists) {
      ownIsPrivate = (ownSnap.data()?.isPrivate as boolean) ?? false;
    }
  }

  return (
    <PlayersClient
      players={players}
      uid={uid}
      initialIsPrivate={ownIsPrivate}
    />
  );
}
