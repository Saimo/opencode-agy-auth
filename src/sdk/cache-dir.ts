import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolves the OpenCode cache directory (XDG_CACHE_HOME/opencode on POSIX,
 * LOCALAPPDATA/opencode on Windows) so transient plugin caches never pollute
 * ~/.config/opencode.
 */
export function getAgyCacheDir(): string {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      join(homedir(), "AppData", "Local");
    return join(base, "opencode");
  }
  const xdgCache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdgCache, "opencode");
}
