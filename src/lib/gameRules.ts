import type { GameMode, Player } from "../types/game";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function pickTwoWords(words: string[]) {
  if (words.length < 2) throw new Error("At least two words are required.");
  const shuffled = shuffle(words);
  return { citizenWord: shuffled[0], liarWord: shuffled[1] };
}

export function splitPlayersForVoteRows<T>(players: T[], maxPerRow = 6): T[][] {
  const rowCount = Math.ceil(players.length / maxPerRow);
  if (rowCount <= 1) return [players];

  const rows: T[][] = [];
  let index = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const remainingPlayers = players.length - index;
    const remainingRows = rowCount - rowIndex;
    const size = Math.min(maxPerRow, Math.ceil(remainingPlayers / remainingRows));
    rows.push(players.slice(index, index + size));
    index += size;
  }

  return rows;
}

export function isActivePlayer(player: Pick<Player, "connectionStatus">) {
  return player.connectionStatus !== "left";
}

export function getActivePlayers<T extends Pick<Player, "connectionStatus">>(players: T[]) {
  return players.filter(isActivePlayer);
}

export function decideCategoryVote(params: {
  players: Pick<Player, "categoryVote">[];
  categoryIds: string[];
  randomId: string;
}) {
  const { players, categoryIds, randomId } = params;
  const existingVotes = players.map((player) => player.categoryVote).filter(Boolean) as string[];
  const fallbackVotes = existingVotes.length ? existingVotes : [randomId];

  const finalVotes = players.map((player) => {
    if (player.categoryVote) return player.categoryVote;
    return fallbackVotes[Math.floor(Math.random() * fallbackVotes.length)];
  });

  const counts = new Map<string, number>();
  finalVotes.forEach((vote) => counts.set(vote, (counts.get(vote) ?? 0) + 1));

  const max = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, count]) => count === max).map(([id]) => id);
  let selected = tied[Math.floor(Math.random() * tied.length)];

  if (selected === randomId) {
    selected = categoryIds[Math.floor(Math.random() * categoryIds.length)];
  }

  return { selected, counts, finalVotes };
}

export function assignRoles(params: {
  players: Player[];
  mode: GameMode;
  liarCount: number;
  spyCount: number;
  citizenWord: string;
  liarWord: string;
}): Player[] {
  const { players, mode, liarCount, spyCount, citizenWord, liarWord } = params;

  if (liarCount < 1) throw new Error("liarCount must be at least 1.");
  if (liarCount + (mode === "spy" ? spyCount : 0) >= players.length) {
    throw new Error("Special role count must be lower than player count.");
  }

  const shuffledIds = shuffle(players.map((player) => player.id));
  const liarIds = new Set(shuffledIds.slice(0, liarCount));
  const spyIds = new Set(mode === "spy" ? shuffledIds.slice(liarCount, liarCount + spyCount) : []);

  return players.map((player) => {
    if (liarIds.has(player.id)) {
      if (mode === "fool") {
        return { ...player, role: "fool", visibleRole: "citizen", word: liarWord };
      }
      return { ...player, role: "liar", visibleRole: "liar", word: undefined };
    }

    if (spyIds.has(player.id)) {
      return { ...player, role: "spy", visibleRole: "spy", word: citizenWord };
    }

    return { ...player, role: "citizen", visibleRole: "citizen", word: citizenWord };
  });
}

export function decideWinner(params: {
  players: Player[];
  voteTargetIds: string[];
}) {
  const { players, voteTargetIds } = params;
  const counts = new Map<string, number>();

  voteTargetIds.filter(Boolean).forEach((targetId) => {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  });

  if (!counts.size) return { winner: "liar" as const, topTargetIds: [] as string[] };

  const max = Math.max(...counts.values());
  const topTargetIds = [...counts.entries()]
    .filter(([, count]) => count === max)
    .map(([id]) => id);

  const citizenWin = topTargetIds.some((id) => players.find((player) => player.id === id)?.role === "liar");

  return {
    winner: citizenWin ? ("citizen" as const) : ("liar" as const),
    topTargetIds,
  };
}
