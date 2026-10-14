import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./users";

/**
 * Session cookie: base64url(JSON payload) + "." + HMAC-SHA256 signature.
 * The proxy checks only the signature and expiry; route handlers also check the user still
 * exists and the session version still matches (see current-user.ts).
 */

export const SESSION_COOKIE = "nm_auth";
export const SESSION_DAYS = 30;

export interface SessionPayload {
  /** user id */
  u: string;
  /** user's sessionVersion when the cookie was issued */
  v: number;
  /** expiry, ms since epoch */
  e: number;
}

let secret: Promise<Buffer> | undefined;

/** AUTH_SECRET from the environment, or a random key generated once into the data dir. */
function getSecret(): Promise<Buffer> {
  secret ??= (async () => {
    if (process.env.AUTH_SECRET) return Buffer.from(process.env.AUTH_SECRET);
    const keyFile = path.join(dataDir(), "session.key");
    try {
      return Buffer.from((await readFile(keyFile, "utf8")).trim(), "hex");
    } catch {
      await mkdir(dataDir(), { recursive: true, mode: 0o700 });
      const key = randomBytes(32).toString("hex");
      try {
        await writeFile(keyFile, key, { flag: "wx", mode: 0o600 });
        return Buffer.from(key, "hex");
      } catch {
        // another request created it first
        return Buffer.from((await readFile(keyFile, "utf8")).trim(), "hex");
      }
    }
  })();
  secret.catch(() => (secret = undefined));
  return secret;
}

const sign = async (data: string) => createHmac("sha256", await getSecret()).update(data).digest();

export async function createToken(userId: string, sessionVersion: number): Promise<{ value: string; expires: Date }> {
  const e = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const data = Buffer.from(JSON.stringify({ u: userId, v: sessionVersion, e } satisfies SessionPayload)).toString("base64url");
  return { value: `${data}.${(await sign(data)).toString("base64url")}`, expires: new Date(e) };
}

/** The payload if the signature is valid and the token hasn't expired. */
export async function readToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = await sign(data);
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    return typeof p.u === "string" && typeof p.v === "number" && p.e > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
