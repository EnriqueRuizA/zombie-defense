import {
  PublicGameInfoSchema,
  PublicGameTypeSchema,
} from "@zombie-defense/shared/WireSchemas";
import { z } from "zod";

export type InternalGameInfo = z.infer<typeof InternalGameInfoSchema>;
export type InternalPublicGames = z.infer<typeof InternalPublicGamesSchema>;
export type WorkerLobbyList = z.infer<typeof WorkerLobbyListSchema>;
export type WorkerReady = z.infer<typeof WorkerReadySchema>;
export type MasterLobbiesBroadcast = z.infer<
  typeof MasterLobbiesBroadcastSchema
>;
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;

// Master/worker-internal lobby info: PublicGameInfo plus the local creation
// time the master orders the list by. Never sent to browsers —
// WorkerLobbyService.sanitizeGames converts to plain PublicGameInfo first.
export const InternalGameInfoSchema = PublicGameInfoSchema.extend({
  createdAt: z.number().optional(),
});

export const InternalPublicGamesSchema = z.object({
  serverTime: z.number(),
  games: z.partialRecord(PublicGameTypeSchema, z.array(InternalGameInfoSchema)),
});

// --- Worker Messages ---

// Worker tells the master about the lobbies it owns. Entries are deliberately
// not validated here: the master checks each against InternalGameInfoSchema
// and drops bad ones (MasterLobbyService.validLobbies).
const WorkerLobbyListSchema = z.object({
  type: z.literal("lobbyList"),
  lobbies: z.array(z.unknown()),
});

const WorkerReadySchema = z.object({
  type: z.literal("workerReady"),
  workerId: z.number(),
});

export const WorkerMessageSchema = z.discriminatedUnion("type", [
  WorkerLobbyListSchema,
  WorkerReadySchema,
]);

// --- Master Messages ---

// The aggregated local lobby snapshot, sent to every worker after each change
// so each can fan it out to its own browser clients.
const MasterLobbiesBroadcastSchema = z.object({
  type: z.literal("lobbiesBroadcast"),
  publicGames: InternalPublicGamesSchema,
});

export type MasterMessage = z.infer<typeof MasterMessageSchema>;

export const MasterMessageSchema = MasterLobbiesBroadcastSchema;
