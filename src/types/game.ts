export type GameMode = "liar" | "fool" | "spy";

export type PlayerRole = "citizen" | "liar" | "fool" | "spy";

export type VisibleRole = "citizen" | "liar" | "spy";

export type RoomPhase =
  | "lobby"
  | "category_vote"
  | "category_result"
  | "keyword_reveal"
  | "speaking"
  | "discussion"
  | "result";

export type WordPack = {
  category: string;
  words: string[];
};

export type Player = {
  id: string;
  roomId?: string;
  nickname: string;
  isHost: boolean;
  ready: boolean;
  sortOrder: number;
  role?: PlayerRole;
  visibleRole?: VisibleRole;
  word?: string;
  categoryVote?: string;
  voteTargetId?: string;
  voteConfirmed?: boolean;
  voteConfirmedAt?: string;
  usedTimeAdjust?: boolean;
  speakingDone?: boolean;
  lastSeenAt?: string;
  joinedAt?: string;
  connectionStatus?: "connected" | "disconnected" | "left";
};

export type RoomState = {
  id: string;
  code: string;
  name: string;
  hostPlayerId?: string;
  phase: RoomPhase;
  mode: GameMode;
  maxPlayers: number;
  liarCount: number;
  spyCount: number;
  revealSeconds: number;
  speakingSeconds: number;
  talkSeconds: number;
  selectedCategory?: string;
  citizenWord?: string;
  liarWord?: string;
  phaseStartedAt?: string;
  currentSpeakerPlayerId?: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  playerId?: string;
  phase: RoomPhase;
  body: string;
  createdAt: string;
};

export type RoomSnapshot = {
  room: RoomState;
  players: Player[];
  messages: ChatMessage[];
};

export type ClientSession = {
  playerId: string;
  token: string;
};
