const DEBUG_LOGS_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS === "true";

type DebugMethod = "log" | "warn" | "error" | "info";

function writeDebug(method: DebugMethod, ...args: unknown[]) {
  if (!DEBUG_LOGS_ENABLED) {
    return;
  }

  console[method](...args);
}

export function debugLog(...args: unknown[]) {
  writeDebug("log", ...args);
}

export function debugWarn(...args: unknown[]) {
  writeDebug("warn", ...args);
}

export function debugError(...args: unknown[]) {
  writeDebug("error", ...args);
}

export function debugInfo(...args: unknown[]) {
  writeDebug("info", ...args);
}
