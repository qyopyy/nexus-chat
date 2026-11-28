// Nexus Pass · what a vault item looks like, search, and import/export (JSON and CSV, many formats).

export type ItemKind = "login" | "note" | "totp";
export type PassItem = {
  id: string;
  kind: ItemKind;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  /** a base32 secret or an otpauth:// link */
  totp?: string;
  notes?: string;
  fav?: boolean;
  created: number;
  updated: number;
};

export const KIND_LABEL: Record<ItemKind, string> = { login: "Login", note: "Secure note", totp: "Authenticator" };

export const newId = () => globalThis.crypto.randomUUID();
export function blankItem(kind: ItemKind): PassItem {
  const now = Date.now();
  return { id: newId(), kind, title: "", created: now, updated: now };
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);
/** Anything decrypted from a row or file in → a clean item out (or null). */
export function cleanItem(o: unknown): PassItem | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const kind: ItemKind = r.kind === "note" || r.kind === "totp" ? r.kind : "login";
  const now = Date.now();
  const id = typeof r.id === "string" && /^[0-9a-f-]{36}$/i.test(r.id) ? r.id : newId();
  const title = clip(r.title, 200)?.trim() || "";
  const it: PassItem = { id, kind, title, created: typeof r.created === "number" ? r.created : now, updated: typeof r.updated === "number" ? r.updated : now };
  const u = clip(r.username, 300);
  const p = clip(r.password, 2000);
  const url = clip(r.url, 1000);
  const t = clip(r.totp, 1000);
  const n = clip(r.notes, 20000);
  if (u) it.username = u;
  if (p) it.password = p;
  if (url) it.url = url;
  if (t) it.totp = t;
  if (n) it.notes = n;
  if (r.fav === true) it.fav = true;
  return it;
}

export const hostOf = (url?: string): string => {
  if (!url) return "";
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** Only http(s) links are ever opened or shown as links. */
export const safeUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/** Search title, user name and site. Notes and secrets are not searched on purpose. Pinned first, then A to Z. */
export function filterItems(items: PassItem[], q: string, kind: ItemKind | "all" = "all"): PassItem[] {
  const s = q.trim().toLowerCase();
  const list = items.filter((i) => (kind === "all" || i.kind === kind) && (!s || i.title.toLowerCase().includes(s) || (i.username ?? "").toLowerCase().includes(s) || hostOf(i.url).includes(s)));
  return list.sort((a, b) => Number(!!b.fav) - Number(!!a.fav) || (a.title || hostOf(a.url)).localeCompare(b.title || hostOf(b.url), undefined, { sensitivity: "base" }));
}

// ------------------------------------------------------------------ CSV
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') (cur += '"'), i++;
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") (row.push(cur), (cur = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
/** Spreadsheet formula guard: text that would run as a formula in Excel gets a leading apostrophe. Secrets are never altered. */
const GUARD = /^[=+\-@\t\r]/;
const cell = (v: string | undefined, raw: boolean) => {
  let s = v ?? "";
  if (!raw && GUARD.test(s) && !/^[+-]?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: string[][], rawCols: number[] = []) => rows.map((r) => r.map((c, i) => cell(c, rawCols.includes(i))).join(",")).join("\r\n") + "\r\n";
const unguard = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

const ALIAS: Record<string, string[]> = {
  title: ["name", "title", "item", "account", "site", "label"],
  url: ["url", "login_uri", "website", "web site", "uri", "address"],
  username: ["username", "login_username", "user", "login", "email", "user name", "login name"],
  password: ["password", "login_password", "pass", "pwd"],
  totp: ["totp", "login_totp", "otpauth", "otp", "authenticator", "2fa"],
  notes: ["notes", "note", "extra", "comments", "comment", "secure note"],
  fav: ["favorite", "fav", "favourite"],
  type: ["type"],
};

/** A title alone is not an entry worth keeping. */
const hasContent = (i: PassItem) => !!(i.username || i.password || i.notes || i.totp || i.url);

export type ImportResult = { items: PassItem[]; skipped: number; format: string };

function fromCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], skipped: 0, format: "csv" };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [k, names] of Object.entries(ALIAS)) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) col[k] = i;
  }
  const items: PassItem[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (k: string) => (col[k] !== undefined ? ((k === "password" || k === "totp") ? (r[col[k]] ?? "").trim() : unguard((r[col[k]] ?? "").trim())) : "");
    const type = get("type").toLowerCase();
    const it = cleanItem({
      kind: type === "note" || type === "securenote" ? "note" : !get("password") && !get("username") && get("totp") ? "totp" : !get("password") && !get("username") && !get("url") && get("notes") ? "note" : "login",
      title: get("title") || hostOf(get("url")),
      url: get("url"),
      username: get("username"),
      password: r[col.password ?? -1] ?? "",
      totp: get("totp"),
      notes: get("notes"),
      fav: /^(1|true|yes)$/i.test(get("fav")),
    });
    if (!it || !hasContent(it)) skipped++;
    else items.push(it);
  }
  return { items, skipped, format: col.title !== undefined && head.includes("login_uri") ? "Bitwarden CSV" : head.includes("grouping") ? "LastPass CSV" : "CSV" };
}

function fromJson(text: string): ImportResult {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return { items: [], skipped: 0, format: "unknown" };
  }
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const items: PassItem[] = [];
  let skipped = 0;
  const push = (x: PassItem | null) => (x && hasContent(x) ? items.push(x) : skipped++);
  if (o.format === "nexus-pass" && Array.isArray(o.items)) {
    for (const x of o.items) push(cleanItem({ ...(x as object), id: undefined }));
    return { items, skipped, format: "Nexus Pass JSON" };
  }
  if (Array.isArray(o.items) && o.items.some((x) => !!x && typeof x === "object" && ("login" in (x as object) || "type" in (x as object)))) {
    // Bitwarden JSON: type 1 login, 2 secure note
    for (const x of o.items as Record<string, unknown>[]) {
      const login = (x.login ?? {}) as Record<string, unknown>;
      const uris = Array.isArray(login.uris) ? (login.uris as { uri?: string }[]) : [];
      if (x.type === 2) push(cleanItem({ kind: "note", title: x.name, notes: x.notes, fav: x.favorite }));
      else if (x.type === 1) push(cleanItem({ kind: "login", title: x.name, username: login.username, password: login.password, url: uris[0]?.uri, totp: login.totp, notes: x.notes, fav: x.favorite }));
      else skipped++;
    }
    return { items, skipped, format: "Bitwarden JSON" };
  }
  if (Array.isArray(j)) {
    for (const x of j) push(cleanItem({ ...(x as object), id: undefined }));
    return { items, skipped, format: "JSON list" };
  }
  return { items: [], skipped: 0, format: "unknown" };
}

/** Detects JSON or CSV and understands Nexus Pass, Bitwarden, Chrome, 1Password and LastPass exports. */
export function importAny(text: string): ImportResult {
  const t = text.trim();
  const r = t.startsWith("{") || t.startsWith("[") ? fromJson(t) : fromCsv(t);
  for (const it of r.items) if (it.totp && !/^otpauth:\/\/totp\//i.test(it.totp) && !/^[A-Za-z2-7\s-]{10,}=*$/.test(it.totp)) delete it.totp;
  return r;
}

export const exportJson = (items: PassItem[]) => JSON.stringify({ format: "nexus-pass", version: 1, exported: new Date().toISOString(), items }, null, 2);
export const exportCsv = (items: PassItem[]) =>
  toCsv([["name", "url", "username", "password", "totp", "note", "type", "favorite"], ...items.map((i) => [i.title, i.url ?? "", i.username ?? "", i.password ?? "", i.totp ?? "", i.notes ?? "", i.kind, i.fav ? "1" : ""])], [3, 4]);

/** Drop items that are already in the vault (same title + user + site). */
export function dedupe(existing: PassItem[], incoming: PassItem[]): { fresh: PassItem[]; dupes: number } {
  const key = (i: PassItem) => [i.kind, i.title.toLowerCase(), (i.username ?? "").toLowerCase(), hostOf(i.url), i.password ?? "", i.totp ?? ""].join("|");
  const seen = new Set(existing.map(key));
  const fresh: PassItem[] = [];
  for (const i of incoming) {
    const k = key(i);
    if (!seen.has(k)) (seen.add(k), fresh.push(i));
  }
  return { fresh, dupes: incoming.length - fresh.length };
}
