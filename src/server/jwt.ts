import {
  TokenPayload,
  UserMeResponse,
} from "@zombie-defense/shared/ApiSchemas";
import { CloseCode, CloseReason } from "@zombie-defense/shared/CloseCodes";
import { PersistentIdSchema } from "@zombie-defense/shared/WireSchemas";

/**
 * Local identity (docs/LocalMode.md R5).
 *
 * A player is the UUID their browser keeps in `localStorage`, sent as the
 * client token. There is no signature, issuer, audience, expiry, refresh or
 * API lookup: nothing about a join can depend on another host being up.
 *
 * The module keeps its old name and signatures so call sites do not churn;
 * `claims` is always null and `getUserMe` never leaves the process.
 */
export type TokenVerificationResult =
  | {
      type: "success";
      persistentId: string;
      claims: TokenPayload | null;
    }
  | { type: "error"; message: string };

export function verifyClientToken(token: string): TokenVerificationResult {
  if (PersistentIdSchema.safeParse(token).success) {
    return { type: "success", persistentId: token, claims: null };
  }
  return {
    type: "error",
    message: "client token must be the local persistent UUID",
  };
}

// status is the API's HTTP status; unset for network and parse failures.
export type UserMeError = { type: "error"; status?: number; message: string };

/**
 * There is no account backend locally. The type keeps its old shape so the
 * account-only branches compile; every call fails deterministically and
 * callers that actually need it are already gated behind `casualMode()`.
 */
export function getUserMe(
  _token: string,
): Promise<{ type: "success"; response: UserMeResponse } | UserMeError> {
  return Promise.resolve({
    type: "error",
    message: "no account backend in local mode",
  });
}

export function userMeFailureClose(error: UserMeError): {
  code: CloseCode;
  reason: CloseReason;
} {
  if (error.status === 401 || error.status === 403) {
    return { code: CloseCode.Unauthorized, reason: CloseReason.InvalidToken };
  }
  return {
    code: CloseCode.InternalError,
    reason: CloseReason.AccountLookupFailed,
  };
}
