import type { Env, OrganizerIdentity } from "./types";

interface AccessJwtHeader {
  alg: string;
  kid: string;
}

interface AccessJwtPayload {
  aud: string | string[];
  email?: string;
  exp: number;
  iss: string;
  sub: string;
}

interface AccessJwk extends JsonWebKey {
  kid?: string;
}

interface AccessCertsResponse {
  keys: AccessJwk[];
}

let certCache: { expiresAt: number; keys: AccessJwk[] } | undefined;

function decodePart<T>(part: string): T {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(normalized + padding), (character) =>
    character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeSignature(part: string): ArrayBuffer {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(normalized + padding), (character) =>
    character.charCodeAt(0),
  );
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function getSigningKeys(teamDomain: string): Promise<AccessJwk[]> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) return certCache.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Unable to load Access signing keys");

  const body = (await response.json()) as AccessCertsResponse;
  certCache = { keys: body.keys, expiresAt: now + 60 * 60 * 1000 };
  return body.keys;
}

async function verifyAccessToken(token: string, env: Env): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Access token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodePart<AccessJwtHeader>(encodedHeader);
  const payload = decodePart<AccessJwtPayload>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access token");

  const expectedIssuer = `https://${env.TEAM_DOMAIN}`;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.iss !== expectedIssuer) throw new Error("Invalid Access issuer");
  if (!audiences.includes(env.POLICY_AUD)) throw new Error("Invalid Access audience");
  if (payload.exp <= nowSeconds) throw new Error("Expired Access token");
  if (!payload.email) throw new Error("Access identity has no email");

  const keys = await getSigningKeys(env.TEAM_DOMAIN);
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error("Unknown Access signing key");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    decodeSignature(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!valid) throw new Error("Invalid Access signature");
  return payload.email.toLowerCase();
}

export async function resolveOrganizer(
  request: Request,
  env: Env,
): Promise<OrganizerIdentity> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  let email: string;

  if (token) {
    email = await verifyAccessToken(token, env);
  } else if (env.ENVIRONMENT === "development" && env.DEV_ORGANIZER_EMAIL) {
    email = env.DEV_ORGANIZER_EMAIL.toLowerCase();
  } else {
    throw new Error("Authentication required");
  }

  const row = await env.DB.prepare(
    `SELECT id, email, display_name, role
     FROM organizers
     WHERE email = ?1 COLLATE NOCASE AND active = 1`,
  )
    .bind(email)
    .first<{ id: string; email: string; display_name: string; role: "admin" | "organizer" }>();

  if (!row) throw new Error("Organizer access is not enabled");

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}
