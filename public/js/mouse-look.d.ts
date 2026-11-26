/** Types for mouse-look.js, so tests import it type-safely. */
export type MouseLookOptions = {
  gain?: number;
  halfLifeMs?: number;
  minOutput?: number;
  rest?: number;
  maxDelta?: number;
};

export declare class MouseLook {
  constructor(options?: MouseLookOptions);
  move(dx: number, dy: number): void;
  sample(now: number): [number, number];
  reset(): void;
}
