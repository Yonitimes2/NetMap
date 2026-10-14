import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Data dir for keys and uploaded files: $NETMAP_DATA_DIR, default .netmap-data/ in the project (git-ignored). */
export const dataDir = () => process.env.NETMAP_DATA_DIR || path.join(process.cwd(), ".netmap-data");

const cache = new Map<string, Promise<Buffer>>();

/**
 * A 32-byte secret: from the environment variable `env` when set, otherwise generated once into
 * <data dir>/<file> (readable by the app's user only).
 */
export function serverKey(env: string, file: string): Promise<Buffer> {
  let p = cache.get(file);
  if (!p) {
    p = (async () => {
      if (process.env[env]) return Buffer.from(process.env[env]!);
      const keyFile = path.join(/*turbopackIgnore: true*/ dataDir(), file);
      try {
        return Buffer.from((await readFile(/*turbopackIgnore: true*/ keyFile, "utf8")).trim(), "hex");
      } catch {
        await mkdir(/*turbopackIgnore: true*/ dataDir(), { recursive: true, mode: 0o700 });
        const key = randomBytes(32).toString("hex");
        try {
          await writeFile(/*turbopackIgnore: true*/ keyFile, key, { flag: "wx", mode: 0o600 });
          return Buffer.from(key, "hex");
        } catch {
          // another request created it first
          return Buffer.from((await readFile(/*turbopackIgnore: true*/ keyFile, "utf8")).trim(), "hex");
        }
      }
    })();
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}
