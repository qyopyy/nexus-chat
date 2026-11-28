import type { Gen, IdleConfig, Upg } from "@/lib/sim/idle";

type Def = {
  id: string;
  title: string;
  emoji: string;
  unit: string;
  tapName: string;
  gens: [string, string][]; // [emoji, name]
  prestigeName: string;
  bg: string;
  tag: string;
  desc: string;
  globals: [string, string][]; // [name, desc]
};

function build(d: Def): IdleConfig {
  const gens: Gen[] = d.gens.map(([emoji, name], i) => ({
    id: `g${i}`,
    name,
    emoji,
    baseCost: Math.round(15 * Math.pow(8, i)),
    growth: 1.15,
    rate: Math.round(0.2 * Math.pow(5, i) * 100) / 100,
  }));
  const upgrades: Upg[] = [];
  gens.forEach((g, i) => {
    upgrades.push({ id: `u${i}a`, name: `${g.name} · efficiency`, desc: `${g.name} output ×2 (own 10)`, cost: g.baseCost * 10, mult: 2, gen: g.id, needs: 10 });
    upgrades.push({ id: `u${i}b`, name: `${g.name} · mastery`, desc: `${g.name} output ×2 (own 25)`, cost: g.baseCost * 150, mult: 2, gen: g.id, needs: 25 });
  });
  [2e4, 5e6, 1e9].forEach((cost, i) => upgrades.push({ id: `global${i}`, name: d.globals[i][0], desc: d.globals[i][1], cost, mult: [1.5, 2, 3][i] }));
  return { id: d.id, title: d.title, emoji: d.emoji, unit: d.unit, tapName: d.tapName, tapValue: 1, gens, upgrades, prestigeName: d.prestigeName, prestigeBase: 1e6 };
}

export type IdleDef = { cfg: IdleConfig; bg: string; tag: string; desc: string };

const defs: Def[] = [
  {
    id: "beat-empire",
    title: "Beat Empire",
    emoji: "🎧",
    unit: "$",
    tapName: "Make a beat",
    gens: [["🎤", "Bedroom mic"], ["💻", "Laptop DAW"], ["🏠", "Home studio"], ["🎹", "Hit producer"], ["💿", "Record label"], ["📱", "Streaming platform"], ["🎪", "World festival"]],
    prestigeName: "Platinum plaques",
    bg: "linear-gradient(135deg,#7c3aed,#db2777)",
    tag: "Idle · music tycoon",
    desc: "Start in a bedroom, end with a global festival. Tap beats, hire talent, go platinum.",
    globals: [["Viral TikTok", "All income ×1.5"], ["Playlist placement", "All income ×2"], ["Worldwide tour", "All income ×3"]],
  },
  {
    id: "gold-mine",
    title: "Gold Rush Idle",
    emoji: "⛏️",
    unit: "oz",
    tapName: "Swing the pickaxe",
    gens: [["🧔", "Prospector"], ["🛒", "Mine cart"], ["🔩", "Drill rig"], ["🧨", "Dynamite crew"], ["🚜", "Excavator"], ["🏭", "Gold refinery"], ["☄️", "Asteroid miner"]],
    prestigeName: "Gold bars",
    bg: "linear-gradient(135deg,#f59e0b,#78350f)",
    tag: "Idle · mining",
    desc: "Dig deeper every minute. From a lone prospector to asteroid mining.",
    globals: [["Better maps", "All output ×1.5"], ["Union deal", "All output ×2"], ["Motherlode", "All output ×3"]],
  },
  {
    id: "farm-valley",
    title: "Farm Valley",
    emoji: "🌾",
    unit: "$",
    tapName: "Harvest",
    gens: [["🐔", "Chicken coop"], ["🥕", "Veggie patch"], ["🚜", "Tractor"], ["🍎", "Orchard"], ["🐄", "Dairy barn"], ["🌿", "Greenhouse"], ["🏢", "Agri-corp"]],
    prestigeName: "Golden seeds",
    bg: "linear-gradient(135deg,#65a30d,#14532d)",
    tag: "Idle · farming",
    desc: "Grow a chill farm into a produce empire while you're away.",
    globals: [["Sunny season", "All harvests ×1.5"], ["Irrigation network", "All harvests ×2"], ["Organic label", "All harvests ×3"]],
  },
  {
    id: "space-colony",
    title: "Space Colony",
    emoji: "🪐",
    unit: "⚡",
    tapName: "Collect stardust",
    gens: [["🔆", "Solar panel"], ["🏘️", "Habitat"], ["🤖", "Mining drone"], ["⚛️", "Fusion reactor"], ["🛰️", "Orbital station"], ["🌍", "Terraformer"], ["🌟", "Dyson swarm"]],
    prestigeName: "Warp cores",
    bg: "linear-gradient(135deg,#312e81,#020617)",
    tag: "Idle · sci-fi",
    desc: "Settle a new planet, then harvest an entire star.",
    globals: [["Quantum grid", "All output ×1.5"], ["AI foremen", "All output ×2"], ["Warp logistics", "All output ×3"]],
  },
  {
    id: "estate-empire",
    title: "Estate Empire",
    emoji: "🏙️",
    unit: "$",
    tapName: "Collect rent",
    gens: [["🛏️", "Studio flat"], ["🏡", "Duplex"], ["🏢", "Apartment block"], ["🏬", "Office tower"], ["🛍️", "Shopping mall"], ["🏝️", "Resort island"], ["🌆", "Mega city"]],
    prestigeName: "Deeds",
    bg: "linear-gradient(135deg,#0ea5e9,#1e293b)",
    tag: "Idle · real estate",
    desc: "Buy one flat, collect rent, snowball into a skyline.",
    globals: [["Prime locations", "All rent ×1.5"], ["Property managers", "All rent ×2"], ["Zoning wins", "All rent ×3"]],
  },
  {
    id: "sky-builder",
    title: "Skyscraper Builder",
    emoji: "🏗️",
    unit: "m",
    tapName: "Lay bricks",
    gens: [["👷", "Builder crew"], ["🏗️", "Tower crane"], ["🧱", "Concrete plant"], ["📐", "Architect studio"], ["🔥", "Steel mill"], ["🏢", "Construction firm"], ["🗺️", "City planner"]],
    prestigeName: "Blueprints",
    bg: "linear-gradient(135deg,#64748b,#0f172a)",
    tag: "Idle · construction",
    desc: "Raise the tallest tower on Earth — then do it again, faster.",
    globals: [["Cheaper steel", "All output ×1.5"], ["Night shifts", "All output ×2"], ["Prefab modules", "All output ×3"]],
  },
  {
    id: "code-breaker",
    title: "Hacker Idle",
    emoji: "💾",
    unit: "KB",
    tapName: "Run exploit",
    gens: [["👾", "Script kiddie"], ["🕸️", "Botnet"], ["🎣", "Phishing farm"], ["🧪", "Zero-day lab"], ["🗄️", "Data center"], ["🧠", "AI intruder"], ["⚛️", "Quantum cracker"]],
    prestigeName: "Root keys",
    bg: "linear-gradient(135deg,#22c55e,#052e16)",
    tag: "Idle · cyber (fictional)",
    desc: "A made-up terminal game: grow a fictional crew into a quantum juggernaut. No real systems involved.",
    globals: [["Faster uplink", "All output ×1.5"], ["Obfuscation suite", "All output ×2"], ["Shadow network", "All output ×3"]],
  },
  {
    id: "food-truck",
    title: "Food Truck Tycoon",
    emoji: "🌮",
    unit: "$",
    tapName: "Serve a meal",
    gens: [["🌭", "Hot-dog cart"], ["🚚", "Food truck"], ["🍔", "Diner"], ["🍕", "Pizzeria"], ["🍽️", "Restaurant chain"], ["☁️", "Cloud kitchen"], ["🌍", "Franchise empire"]],
    prestigeName: "Michelin stars",
    bg: "linear-gradient(135deg,#ef4444,#7c2d12)",
    tag: "Idle · restaurants",
    desc: "Park a cart, build a chain, franchise the planet.",
    globals: [["Food blogger shout-out", "All sales ×1.5"], ["Delivery apps", "All sales ×2"], ["Celebrity chef", "All sales ×3"]],
  },
];

export const IDLE_DEFS: IdleDef[] = defs.map((d) => ({ cfg: build(d), bg: d.bg, tag: d.tag, desc: d.desc }));
