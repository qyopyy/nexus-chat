import { APPEARANCE_KEY, BG_ANIMS, DEFAULT_APPEARANCE, FONTS, THEMES, paint } from "@/lib/theme";

/** Applies the saved theme before first paint (no flash of default colors). */
export default function ThemeBoot() {
  const js =
    `(function(){try{var s=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});if(!s)return;` +
    `var a=Object.assign(${JSON.stringify(DEFAULT_APPEARANCE)},JSON.parse(s));` +
    `(${paint.toString()})(a,${JSON.stringify(THEMES)},${JSON.stringify(FONTS)},${JSON.stringify(BG_ANIMS)});}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
