/**
 * Resolves the OpenCode cache directory (XDG_CACHE_HOME/opencode on POSIX,
 * LOCALAPPDATA/opencode on Windows) so transient plugin caches never pollute
 * ~/.config/opencode.
 */
export declare function getAgyCacheDir(): string;
