import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const modulePath = process.env.NEXUS_DROP_PGLITE_MODULE || process.env.PRESAVE_PGLITE_MODULE;
let PGlite;
try { ({ PGlite } = require(modulePath || '@electric-sql/pglite')); }
catch (error) { if (modulePath) throw error; }

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const denied = (error) => ['42501', '23514', '23502'].includes(error.code);

async function asUser(db, user, action, role = 'authenticated') {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
  await db.exec(`set role ${role}`);
  try { return await action(); }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function insertDrop(db, extra = {}) {
  const row = { from_user: ALICE, to_user: BOB, name: 'mix.wav', path: `${ALICE}/mix.wav`, bytes: 10, ...extra };
  const columns = Object.keys(row);
  assert.ok(columns.every((column) => /^[a-z_]+$/.test(column)));
  return (await db.query(`insert into public.nexus_drops (${columns.join(',')}) values (${columns.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(row))).rows[0];
}

test('Nexus Drop permissions bind immutable transfers to real sender-owned files', {
  skip: !PGlite && 'Install @electric-sql/pglite in an isolated directory and set NEXUS_DROP_PGLITE_MODULE (or PRESAVE_PGLITE_MODULE).',
}, async (t) => {
  const db = new PGlite();
  try {
    // Stub only the Supabase platform. Exercise the actual original migration,
    // hardening migration, PostgreSQL grants, RLS policies, and trigger code.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create table public.profiles (id uuid primary key);
      create function public.my_tier() returns integer language sql stable as $$ select 2 $$;
      create schema storage;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects (
        id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
        name text not null, owner_id text, owner uuid, metadata jsonb, unique(bucket_id,name)
      );
      create function storage.foldername(text) returns text[] language sql immutable as $$
        select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
      $$;
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated,service_role;
    `);
    await db.query('insert into public.profiles(id) values ($1),($2),($3)', [ALICE, BOB, CAROL]);
    await db.exec(await readFile(new URL('../supabase/migrations/20261110230000_nexus_drop_cloud.sql', import.meta.url), 'utf8'));
    await db.exec('grant select,insert,update,delete on public.nexus_drops to authenticated,service_role');
    for (const [path, owner, size] of [
      [`${ALICE}/mix.wav`, ALICE, 10], [`${ALICE}/expired.wav`, ALICE, 10],
      [`${ALICE}/future.wav`, ALICE, 10], [`${ALICE}/wrong-owner.wav`, CAROL, 10],
      [`${CAROL}/private.wav`, CAROL, 10], [`${ALICE}/oversized.wav`, ALICE, 104857601],
      [`${ALICE}/no-metadata.wav`, ALICE, null], [`${ALICE}/no-owner.wav`, null, 10],
    ]) {
      await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values ($1,$2,$3,$4)',
        ['nexus-drops', path, owner, JSON.stringify({ size, mimetype: 'audio/wav' })]);
    }
    // Existing invalid records must not continue granting cross-owner or
    // indefinitely extended access after the Storage read policy is replaced.
    await insertDrop(db, { path: `${CAROL}/private.wav` });
    const expired = await insertDrop(db, { path: `${ALICE}/expired.wav`, created_at: '2020-01-01T00:00:00Z', expires_at: '2020-01-02T00:00:00Z' });
    await insertDrop(db, { path: `${ALICE}/future.wav`, expires_at: '2099-01-01T00:00:00Z' });
    const migration = await readFile(new URL('../supabase/migrations/20261123130000_nexus_drop_hardening.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Safe when a deployment retries this migration.

    await t.test('the authenticated sender can send a real file, and only its recipient can read it', async () => {
      const drop = await asUser(db, ALICE, () => insertDrop(db, { mime: 'text/html', created_at: '2099-01-01T00:00:00Z' }));
      assert.equal(drop.mime, 'audio/wav');
      assert.ok(Math.abs(Date.now() - new Date(drop.created_at).getTime()) < 10000);
      assert.ok(new Date(drop.expires_at) - new Date(drop.created_at) <= 86400000);
      await asUser(db, BOB, async () => {
        const { rows } = await db.query("select name from storage.objects where bucket_id='nexus-drops' order by name");
        assert.deepEqual(rows.map((row) => row.name), [`${ALICE}/mix.wav`]);
      });
      await asUser(db, CAROL, async () => {
        assert.equal((await db.query('select id from public.nexus_drops')).rows.length, 0);
        assert.equal((await db.query('select name from storage.objects where name=$1', [`${ALICE}/mix.wav`])).rows.length, 0);
      });
      await asUser(db, null, async () => {
        await assert.rejects(db.query('select * from public.nexus_drops'), denied);
        await assert.rejects(insertDrop(db), denied);
        await assert.rejects(db.query('select * from storage.objects'), denied);
      }, 'anon');
    });

    await t.test('direct API inserts reject missing, unowned, oversized, or mismatched storage objects', async () => {
      await asUser(db, ALICE, async () => {
        for (const change of [
          { from_user: BOB }, { path: `${CAROL}/private.wav` }, { path: `${ALICE}/missing.wav` },
          { path: `${ALICE}/wrong-owner.wav` }, { path: `${ALICE}/no-owner.wav` },
          { path: `${ALICE}/no-metadata.wav` }, { bytes: 9 }, { bytes: 0 },
          { path: `${ALICE}/oversized.wav`, bytes: 104857601 },
          { claimed_at: new Date().toISOString() }, { expires_at: 'infinity' },
          { expires_at: '2020-01-01T00:00:00Z' },
          { expires_at: new Date(Date.now() + 2 * 86400000).toISOString(), created_at: '2099-01-01T00:00:00Z' },
        ]) await assert.rejects(insertDrop(db, change), denied, JSON.stringify(change));
      });
      await asUser(db, BOB, () => assert.rejects(insertDrop(db), denied));
    });

    await t.test('legacy owner metadata remains supported without allowing ownerless files', async () => {
      await db.query('insert into storage.objects(bucket_id,name,owner,metadata) values ($1,$2,$3,$4)',
        ['nexus-drops', `${ALICE}/legacy.wav`, ALICE, JSON.stringify({ size: 10, mimetype: 'audio/wav' })]);
      await asUser(db, ALICE, () => insertDrop(db, { path: `${ALICE}/legacy.wav` }));
      await asUser(db, BOB, async () => {
        assert.equal((await db.query('select name from storage.objects where name=$1', [`${ALICE}/legacy.wav`])).rows.length, 1);
      });
    });

    await t.test('recipients cannot rewrite sender, path, ownership, size, expiry, or creation time', async () => {
      const drop = await asUser(db, ALICE, () => insertDrop(db));
      const changes = {
        from_user: CAROL, to_user: CAROL, path: `${CAROL}/private.wav`, bytes: 20,
        name: 'other.wav', mime: 'text/html', from_device: 'forged-device',
        created_at: '2000-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
        id: '44444444-4444-4444-8444-444444444444',
      };
      await asUser(db, BOB, async () => {
        for (const [column, value] of Object.entries(changes)) {
          await assert.rejects(db.query(`update public.nexus_drops set ${column}=$1 where id=$2`, [value, drop.id]), denied, column);
        }
      });
      // The trigger remains a second defense if an admin restores a table-wide
      // UPDATE grant later; service_role currently has that grant in the stub.
      await asUser(db, BOB, async () => {
        for (const [column, value] of Object.entries(changes)) {
          await assert.rejects(db.query(`update public.nexus_drops set ${column}=$1 where id=$2`, [value, drop.id]), denied, column);
        }
      }, 'service_role');
      assert.equal((await db.query('select path from public.nexus_drops where id=$1', [drop.id])).rows[0].path, `${ALICE}/mix.wav`);
    });

    await t.test('only an unexpired recipient can claim once, using the server clock', async () => {
      const drop = await asUser(db, ALICE, () => insertDrop(db));
      for (const user of [ALICE, CAROL]) {
        await asUser(db, user, async () => {
          assert.equal((await db.query('update public.nexus_drops set claimed_at=now() where id=$1 returning id', [drop.id])).rows.length, 0);
        });
      }
      await asUser(db, BOB, async () => {
        await assert.rejects(db.query('update public.nexus_drops set claimed_at=null where id=$1', [drop.id]), denied);
        const claimed = (await db.query("update public.nexus_drops set claimed_at='2099-01-01T00:00:00Z' where id=$1 and claimed_at is null returning *", [drop.id])).rows[0];
        assert.ok(Math.abs(Date.now() - new Date(claimed.claimed_at).getTime()) < 10000);
        assert.equal((await db.query('update public.nexus_drops set claimed_at=null where id=$1 returning id', [drop.id])).rows.length, 0);
        assert.equal((await db.query('update public.nexus_drops set claimed_at=now() where id=$1 returning id', [expired.id])).rows.length, 0);
      });
    });

    await t.test('Drop storage stays private and the migration adds no public read or recipient write access', async () => {
      assert.equal((await db.query("select public from storage.buckets where id='nexus-drops'")).rows[0].public, false);
      await asUser(db, BOB, async () => {
        await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', ['nexus-drops', `${ALICE}/forged.wav`, BOB]), denied);
        assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [`${ALICE}/mix.wav`])).rows.length, 0);
        assert.equal((await db.query("select has_column_privilege(current_user,'public.nexus_drops','claimed_at','UPDATE') allowed")).rows[0].allowed, true);
        assert.equal((await db.query("select has_column_privilege(current_user,'public.nexus_drops','path','UPDATE') allowed")).rows[0].allowed, false);
      });
    });
  } finally { await db.close(); }
});
