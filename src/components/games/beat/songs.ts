/** A playable Beat Battle entry: URLs for the chart + audio (built-in files, object URLs, or community storage). */
export type Song = {
  id: string;
  title: string;
  credit: string;
  diff: string;
  chart: string;
  inst: string;
  voices?: string;
  color: string;
  ranked: boolean;
  /** community song id — play count */
  communityId?: string;
  /** where it came from (shown as a small tag) */
  source?: "built-in" | "synth" | "mod" | "community" | "device";
};
