"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "@/store/app";
import { updateMyProfile } from "@/lib/data";
import { OPTIONS, PANTS, SHOES, SWATCH, type VAvatar } from "@/lib/vavatar";
import { OUTFIT_LOOKS, applyLook, pieceLabel, wearsLook } from "@/lib/snapOutfits";
import { CUSTOM_SCENE, PANTS_COLORS, PANTS_LABEL, SCENES, SHOES_LABEL, SHOE_COLORS, legsOf } from "@/lib/snapAvatar";
import { cn } from "@/lib/utils";
import { Sheet } from "./SnapUi";

const Sw = ({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {colors.map((c) => (
      <button key={c} type="button" aria-label={c} onClick={() => onPick(c)} className={cn("size-7 rounded-full border-2", value.toLowerCase() === c.toLowerCase() ? "border-white" : "border-white/15")} style={{ background: c }} />
    ))}
  </div>
);
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", on ? "bg-white text-black" : "bg-white/10 text-white/80")}>
    {children}
  </button>
);
const Title = ({ children }: { children: React.ReactNode }) => <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-white/45">{children}</p>;

/** Full-body avatar: pick the standing scene (999 / Ksubi packs, your own picture) and dress the legs. Face, hair and outfit come from your Nexus V-Avatar. */
export default function SnapAvatarEditor({
  cfg,
  onCfg,
  scene,
  onScene,
  hasImage,
  onImage,
  onClearImage,
  onOpenStudio,
  onClose,
}: {
  cfg: VAvatar;
  onCfg: (c: VAvatar) => void;
  scene: string;
  onScene: (k: string) => void;
  hasImage: boolean;
  onImage: (f: File) => void;
  onClearImage: () => void;
  onOpenStudio?: () => void;
  onClose: () => void;
}) {
  const L = legsOf(cfg);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ vavatar: cfg as unknown as Record<string, unknown> }, true);
      toast("Saved to your V-Avatar", "success");
    } catch {
      toast("Couldn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet title="Full-body avatar" onClose={onClose} z="z-50" peek>
      <div className="px-4 pb-5">
        <p className="text-xs text-white/55">Uses the V-Avatar you already have on Nexus. Pick where it stands and what it wears below the waist.</p>
        <Title>Background</Title>
        <div className="grid grid-cols-4 gap-2">
          {SCENES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onScene(s.key)}
              aria-label={s.label}
              className={cn("relative aspect-[3/4] overflow-hidden rounded-xl border-2 text-[10px] font-bold", scene === s.key ? "border-white" : "border-transparent")}
              style={{ background: `linear-gradient(${s.wall[0]} 0%, ${s.wall[1]} 70%, ${s.floor[0]} 70%, ${s.floor[1]} 100%)`, boxShadow: scene === s.key ? `0 0 14px ${s.glow}` : undefined }}
            >
              <span className="absolute inset-x-0 bottom-1 truncate px-1 text-white drop-shadow">{s.label}</span>
            </button>
          ))}
          <label className={cn("relative grid aspect-[3/4] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 bg-white/10 text-[10px] font-bold", scene === CUSTOM_SCENE ? "border-white" : "border-dashed border-white/30")}>
            <span className="grid place-items-center gap-1">
              <ImagePlus className="size-5" />
              {hasImage ? "Change" : "My picture"}
            </span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onImage(f);
              }}
            />
          </label>
        </div>
        {hasImage && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Chip on={scene === CUSTOM_SCENE} onClick={() => onScene(CUSTOM_SCENE)}>
              Use my picture
            </Chip>
            <button type="button" onClick={onClearImage} className="inline-flex items-center gap-1 text-white/50 hover:text-rose-300">
              <Trash2 className="size-3.5" /> Remove picture
            </button>
          </div>
        )}

        <Title>Ready-made outfits</Title>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="list" aria-label="Ready-made outfits">
          {OUTFIT_LOOKS.map((o) => {
            const on = wearsLook(cfg, o);
            return (
              <button
                key={o.key}
                type="button"
                role="listitem"
                onClick={() => onCfg(applyLook(cfg, o))}
                aria-pressed={on}
                className={cn("flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-2xl border-2 bg-white/5 px-1 py-2 text-[10px] font-bold", on ? "border-white" : "border-transparent")}
              >
                <span className="relative grid h-12 w-9 place-items-start justify-items-center" aria-hidden>
                  <span className="size-6 rounded-md" style={{ background: String(o.look.shirtColor ?? "#444") }} />
                  <span className="-mt-0.5 h-4 w-5 rounded-b-md" style={{ background: String(o.look.pantsColor ?? "#444") }} />
                  <span className="absolute bottom-0 h-2 w-7 rounded-full" style={{ background: String(o.look.shoesColor ?? "#fff") }} />
                </span>
                <span aria-hidden>{o.emoji}</span>
                <span className="w-full truncate text-center text-white/85">{o.name}</span>
              </button>
            );
          })}
        </div>

        <Title>Top</Title>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.shirt.map((v) => (
            <Chip key={v} on={cfg.shirt === v} onClick={() => onCfg({ ...cfg, shirt: v })}>
              {pieceLabel(v)}
            </Chip>
          ))}
        </div>
        <Title>Pants</Title>
        <div className="flex flex-wrap gap-1.5">
          {PANTS.map((p) => (
            <Chip key={p} on={L.pants === p} onClick={() => onCfg({ ...cfg, pants: p })}>
              {PANTS_LABEL[p]}
            </Chip>
          ))}
        </div>
        <div className="mt-2">
          <Sw colors={PANTS_COLORS} value={L.pantsColor} onPick={(c) => onCfg({ ...cfg, pantsColor: c })} />
        </div>
        <Title>Shoes</Title>
        <div className="flex flex-wrap gap-1.5">
          {SHOES.map((s) => (
            <Chip key={s} on={L.shoes === s} onClick={() => onCfg({ ...cfg, shoes: s })}>
              {SHOES_LABEL[s]}
            </Chip>
          ))}
        </div>
        <div className="mt-2">
          <Sw colors={SHOE_COLORS} value={L.shoesColor} onPick={(c) => onCfg({ ...cfg, shoesColor: c })} />
        </div>
        <Title>Top colour</Title>
        <Sw colors={SWATCH.cloth} value={cfg.shirtColor} onPick={(c) => onCfg({ ...cfg, shirtColor: c })} />
        <Title>Hat</Title>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.hat.map((v) => (
            <Chip key={v} on={cfg.hat === v} onClick={() => onCfg({ ...cfg, hat: v })}>
              {pieceLabel(v)}
            </Chip>
          ))}
        </div>
        {cfg.hat !== "none" && (
          <div className="mt-2">
            <Sw colors={SWATCH.cloth} value={cfg.hatColor} onPick={(c) => onCfg({ ...cfg, hatColor: c })} />
          </div>
        )}
        <Title>Glasses</Title>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.eyewear.map((v) => (
            <Chip key={v} on={cfg.eyewear === v} onClick={() => onCfg({ ...cfg, eyewear: v })}>
              {pieceLabel(v)}
            </Chip>
          ))}
        </div>
        <Title>Chain</Title>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.chain.map((v) => (
            <Chip key={v} on={cfg.chain === v} onClick={() => onCfg({ ...cfg, chain: v })}>
              {pieceLabel(v)}
            </Chip>
          ))}
        </div>
        <Title>Extras</Title>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.extra.map((v) => (
            <Chip key={v} on={cfg.extra === v} onClick={() => onCfg({ ...cfg, extra: v })}>
              {pieceLabel(v)}
            </Chip>
          ))}
        </div>
        <Title>Hair colour</Title>
        <Sw colors={SWATCH.hair} value={cfg.hairColor} onPick={(c) => onCfg({ ...cfg, hairColor: c })} />

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-50">
            {saving ? "Saving…" : "Save to my avatar"}
          </button>
          {onOpenStudio && (
            <button type="button" onClick={onOpenStudio} className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
              Edit face &amp; outfit
            </button>
          )}
        </div>
        {!onOpenStudio && <p className="mt-3 text-[11px] text-white/40">Face, hair style, outfit and jewellery: Nexus → Settings → V-Avatar.</p>}
      </div>
    </Sheet>
  );
}
