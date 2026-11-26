/** Types for keymap.js, so tests import it type-safely. */
type Axis = 'lx' | 'ly' | 'rx' | 'ry';

export type Layout = {
  name: string;
  buttons: Readonly<Record<string, string>>;
  sticks: Readonly<Record<string, readonly [Axis, number]>>;
  walk: readonly string[];
  mouseLook: boolean;
  actions: Readonly<Record<string, string>>;
  driving: { toggle: string; buttons: Readonly<Record<string, string>> } | null;
};

export declare const LAYOUTS: { generic: Layout; gta: Layout };
export declare const PAD_BUTTONS: readonly string[];

export declare function layoutFor(name: unknown): Layout;

export declare function isLayoutKey(layout: Layout, code: string): boolean;

export declare function mapKeys(
  layout: Layout,
  held: Iterable<string>,
  options?: { driving?: boolean },
): { buttons: Record<string, boolean>; sticks: Record<Axis, number> };

export declare function helpLine(layout: Layout, options?: { driving?: boolean }): string;
