const KEY = "nexus:phone-focus-until";

export function phoneFocusActive() {
  if (typeof window === "undefined") return false;
  const until = Number(localStorage.getItem(KEY) || 0);
  return Number.isFinite(until) && until > Date.now();
}

export function setPhoneFocusUntil(untilMs: number | null) {
  if (typeof window === "undefined") return;
  if (!untilMs || untilMs <= Date.now()) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, String(untilMs));
}
