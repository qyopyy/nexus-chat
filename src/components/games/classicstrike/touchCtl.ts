/** Shared touch / virtual-pad state for Classic & Global Strike (read every frame). */
export type StrikeTouchCtl = {
  /** strafe / forward in -1..1 */
  mx: number;
  my: number;
  /** yaw delta radians to apply this frame */
  look: number;
  fire: boolean;
  reload: boolean;
  plant: boolean;
  defuse: boolean;
  buyToggle: boolean;
  /** pending buy from touch sheet */
  buySlot: number | null;
  armor: boolean;
};

export function freshTouchCtl(): StrikeTouchCtl {
  return {
    mx: 0,
    my: 0,
    look: 0,
    fire: false,
    reload: false,
    plant: false,
    defuse: false,
    buyToggle: false,
    buySlot: null,
    armor: false,
  };
}

/** Phone-aware control sizes (compact phones → slightly smaller pads). */
export function phonePadScale() {
  if (typeof window === "undefined") return 1;
  const w = Math.min(window.innerWidth, window.innerHeight);
  if (w <= 360) return 0.85;
  if (w <= 400) return 0.92;
  if (w >= 430) return 1.08;
  return 1;
}
