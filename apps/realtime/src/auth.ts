import jwt from "jsonwebtoken";
import { interviewTokenClaimsSchema, type InterviewTokenClaims } from "@interviewhub/types";

export function verifyInterviewToken(token: string): InterviewTokenClaims {
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) throw new Error("REALTIME_JWT_SECRET is not set");

  // Signature + expiry are enforced by jwt.verify; the schema parse then
  // guarantees the payload shape before any handler trusts it. The algorithm
  // is pinned rather than inferred from the token's own header, so a caller
  // cannot pick the algorithm used to validate their own token.
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  return interviewTokenClaimsSchema.parse(decoded);
}
