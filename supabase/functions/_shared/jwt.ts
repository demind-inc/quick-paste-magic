/**
 * JWT verification for Edge Functions using Supabase's new JWT Signing Keys.
 * Uses JWKS from the project's Auth server so it works with both local and production.
 * See: https://supabase.com/docs/guides/functions/auth
 */
import * as jose from "jsr:@panva/jose@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ??
  (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : undefined);

const SUPABASE_JWT_KEYS = SUPABASE_URL
  ? jose.createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    )
  : null;

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    throw new Error("Auth header must be 'Bearer <token>'");
  }
  return token;
}

/**
 * Verify the request's Bearer JWT and return the payload (includes sub, email, etc.).
 * Returns null if verification fails or env is misconfigured.
 */
export async function verifyRequestJWT(
  req: Request
): Promise<jose.JWTPayload & { sub?: string; email?: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_JWT_ISSUER || !SUPABASE_JWT_KEYS) {
    return null;
  }
  try {
    const token = getAuthToken(req);
    const { payload } = await jose.jwtVerify(token, SUPABASE_JWT_KEYS, {
      issuer: SUPABASE_JWT_ISSUER,
    });
    return payload as jose.JWTPayload & { sub?: string; email?: string };
  } catch {
    return null;
  }
}

/**
 * Returns the authenticated user's id (sub) or null if invalid/missing.
 */
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const payload = await verifyRequestJWT(req);
  return payload?.sub ?? null;
}
