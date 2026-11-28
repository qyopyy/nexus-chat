import test from "node:test";
import assert from "node:assert/strict";
import { removedBy } from "./deletedBy.ts";

const base = { deleted_at: "2026-11-28T10:00:00Z", author_id: "a" };
test("staff deletions get a labelled bar", () => {
  assert.equal(removedBy({ ...base, deleted_by: "b", deleted_by_role: "owner" })?.text, "Removed by the founder");
  assert.equal(removedBy({ ...base, deleted_by: "b", deleted_by_role: "admin" })?.text, "Removed by an admin");
  assert.equal(removedBy({ ...base, deleted_by: "b", deleted_by_role: "moderator" })?.text, "Removed by a moderator");
});
test("own deletions, old deletions and live messages stay plain", () => {
  assert.equal(removedBy({ ...base, deleted_by: "a", deleted_by_role: "admin" }), null);
  assert.equal(removedBy({ ...base }), null);
  assert.equal(removedBy({ author_id: "a", deleted_by: "b", deleted_by_role: "admin" }), null);
  assert.equal(removedBy({ ...base, deleted_by: "b", deleted_by_role: "member" }), null);
});
