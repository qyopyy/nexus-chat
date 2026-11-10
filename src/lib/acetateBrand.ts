/** Acetate — private test pressings. Same Nexus account, separate product. */

export const ACETATE = {
  name: "Acetate",
  tagline: "The cut before the record.",
  description:
    "A private library for works in progress. Upload demos, keep every version, and pass a link when a cut is ready to hear.",
  path: "/acetate",
  app: "/acetate/app",
  admin: "/acetate/admin",
  ink: "#100e0c",
  lacquer: "#1a1612",
  groove: "#2a241c",
  line: "#3c342c",
  cream: "#f3eadf",
  mute: "#a3988c",
  amber: "#e4a15a",
  oxide: "#d4653a",
} as const;

/** Free storage included with every account. Premium is unlimited. */
export const ACETATE_FREE_BYTES = 5 * 1024 * 1024 * 1024;

export function acetateSharePath(token: string) {
  return `/acetate/s/${encodeURIComponent(token)}`;
}

export function acetateShareUrl(token: string) {
  if (typeof window === "undefined") return acetateSharePath(token);
  return `${window.location.origin}${acetateSharePath(token)}`;
}
