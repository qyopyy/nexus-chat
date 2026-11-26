/** Types for the browser-shared codec (input-codec.js), so the server imports it type-safely. */
export declare const BUTTON_ORDER: readonly string[];
export declare const INPUT_FRAME_BYTES: number;

export type DecodedInput = {
  buttons: Record<string, boolean>;
  sticks: { lx: number; ly: number; rx: number; ry: number };
  triggers: { l2: number; r2: number };
};

export declare function encodeInput(state: {
  buttons?: Record<string, boolean>;
  sticks?: Partial<DecodedInput['sticks']>;
  triggers?: Partial<DecodedInput['triggers']>;
}): ArrayBuffer;

export declare function decodeInput(input: ArrayBuffer | ArrayBufferView): DecodedInput | null;
