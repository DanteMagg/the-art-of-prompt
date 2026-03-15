const locks = new Map<string, boolean>();

export function acquireLock(sessionId: string): boolean {
  if (locks.get(sessionId)) return false;
  locks.set(sessionId, true);
  return true;
}

export function releaseLock(sessionId: string): void {
  locks.delete(sessionId);
}
