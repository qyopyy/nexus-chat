import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { THEMES, DESIGN_DEFAULTS, PUBLIC_FIELDS } from '../supabase/functions/presave/core.mjs';

const require = createRequire(import.meta.url);
let PGlite;
try { ({ PGlite } = require(process.env.PRESAVE_PGLITE_MODULE || '@electric-sql/pglite')); }
catch (error) {
  if (process.env.PRESAVE_PGLITE_MODULE) throw error;
}

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const URI = 'spotify:track:0123456789ABCDEFGHIJKL';
const OTHER_URI = 'spotify:album:0123456789ABCDEFGHIJKL';
const denied = (error) => ['42501', '23514'].includes(error.code);
const constraint = (error) => ['23514', '23502', '22007', '22008', '22P02'].includes(error.code);

async function asRole(db, role, user, action, aal = 'aal1') {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [user || '', JSON.stringify({ sub: user, aal })]);
  await db.exec(`set role ${role}`);
  try { return await action(); }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{}', false)");
  }
}

async function createCampaign(db, owner, slug, extra = {}) {
  const record = { owner_id: owner, slug, title: 'Test release', artist: 'Test artist', ...extra };
  const columns = Object.keys(record);
  const values = Object.values(record);
  assert.ok(columns.every((key) => /^[a-z_]+$/.test(key)));
  const { rows } = await db.query(`insert into public.presave_campaigns (${columns.join(',')}) values (${values.map((_, i) => `$${i + 1}`).join(',')}) returning *`, values);
  return rows[0];
}

let authorizationNumber = 0;
async function authorize(db, campaignId, options = {}) {
  authorizationNumber += 1;
  const hash = authorizationNumber.toString(16).padStart(64, '0');
  const { rows } = await db.query(`
    insert into public.presave_authorizations
      (campaign_id, spotify_user_hash, target_uri, scheduled_for, refresh_token_ciphertext,
       cancel_hash, next_attempt_at, token_expires_at, status, lease_until)
    values ($1,$2,$3,now()+($4::text)::interval,$5,$6,
      now()+($7::text)::interval,now()+($8::text)::interval,$9,
      case when $10::text is null then null else now()+($10::text)::interval end)
    returning *`, [campaignId, hash, URI, options.scheduled || '-1 hour',
    options.ciphertext ?? 'v1.encrypted-refresh-token', hash,
    options.next || '-1 minute', options.expiry || '30 days',
    options.status || 'pending', options.lease || null]);
  return rows[0];
}

test('pre-save migration security and scheduler behavior in real PostgreSQL', {
  skip: !PGlite && 'Install @electric-sql/pglite in an isolated directory and set PRESAVE_PGLITE_MODULE to its module path (see tests/README.md).',
}, async (t) => {
  const db = new PGlite();
  try {
    // Only the Supabase platform primitives are stubbed. All campaign schema,
    // RLS, constraints, triggers, and functions come from the actual migration.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table auth.mfa_factors (id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      create schema storage;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.query('insert into auth.users(id) values ($1),($2)', [ALICE, BOB]);
    await db.exec(await readFile(new URL('../supabase/migrations/20261121180000_presave_service.sql', import.meta.url), 'utf8'));
    const legacy = await createCampaign(db, ALICE, 'before-design-migration', { theme: 'paper', published: true });
    await db.exec(await readFile(new URL('../supabase/migrations/20261123120000_presave_design.sql', import.meta.url), 'utf8'));

    await t.test('appearance migration keeps existing campaigns and backfills all defaults', async () => {
      const stored = (await db.query('select * from public.presave_campaigns where id=$1', [legacy.id])).rows[0];
      assert.equal(stored.theme, 'paper');
      assert.equal(stored.published, true);
      assert.equal(stored.slug, legacy.slug);
      for (const [key, value] of Object.entries(DESIGN_DEFAULTS)) assert.equal(stored[key], value, key);
      await asRole(db, 'anon', null, async () => {
        const page = (await db.query('select public.presave_public($1) as page', [legacy.slug])).rows[0].page;
        assert.deepEqual(Object.keys(page).sort(), [...PUBLIC_FIELDS].sort());
        for (const [key, value] of Object.entries(DESIGN_DEFAULTS)) assert.equal(page[key], value, key);
      });
      await db.query('delete from public.presave_campaigns where id=$1', [legacy.id]);
    });

    await t.test('all theme presets and custom designs persist under owner RLS and render only when published', async () => {
      const design = {
        background_url: 'https://images.example/galaxy.webp', background_overlay: 38,
        background_motion: false, background_color: '#112233', text_color: '#ddeeff',
        button_style: 'pill', font_style: 'editorial',
      };
      const created = [];
      await asRole(db, 'authenticated', ALICE, async () => {
        for (const theme of THEMES) {
          const row = await createCampaign(db, ALICE, `theme-${theme}`, { ...design, theme });
          created.push(row);
          for (const [key, value] of Object.entries(design)) assert.equal(row[key], value, key);
        }
      });
      const custom = created.find((row) => row.theme === 'custom');
      await asRole(db, 'authenticated', BOB, async () => {
        assert.equal((await db.query('select * from public.presave_campaigns where id=$1', [custom.id])).rows.length, 0);
        assert.equal((await db.query('update public.presave_campaigns set background_url=$1,background_overlay=0 where id=$2 returning id', ['https://evil.example/image.png', custom.id])).rows.length, 0);
      });
      await asRole(db, 'anon', null, async () => {
        assert.equal((await db.query('select public.presave_public($1) as page', [custom.slug])).rows[0].page, null);
      });
      await asRole(db, 'authenticated', ALICE, async () => {
        await db.query('update public.presave_campaigns set published=true,background_overlay=0 where id=$1', [custom.id]);
      });
      await asRole(db, 'anon', null, async () => {
        const page = (await db.query('select public.presave_public($1) as page', [custom.slug])).rows[0].page;
        assert.equal(page.theme, 'custom');
        assert.equal(page.background_overlay, 0);
        for (const [key, value] of Object.entries(design)) if (key !== 'background_overlay') assert.equal(page[key], value, key);
        assert.deepEqual(Object.keys(page).sort(), [...PUBLIC_FIELDS].sort());
      });
      await asRole(db, 'service_role', null, async () => {
        const listing = (await db.query("select public.presave_list($1,1,50,'theme-','all') as data", [ALICE])).rows[0].data;
        assert.equal(listing.campaigns.length, THEMES.length);
        assert.ok(listing.campaigns.every((row) => row.background_url === design.background_url));
      });
      for (const row of created) await db.query('delete from public.presave_campaigns where id=$1', [row.id]);
    });

    await t.test('authenticated campaign CRUD is isolated by owner, including forged inserts and ownership changes', async () => {
      const alice = await asRole(db, 'authenticated', ALICE, () => createCampaign(db, ALICE, 'alice-private'));
      const bob = await asRole(db, 'authenticated', BOB, () => createCampaign(db, BOB, 'bob-private'));
      await asRole(db, 'authenticated', ALICE, async () => {
        const { rows } = await db.query('select id from public.presave_campaigns order by slug');
        assert.deepEqual(rows.map((row) => row.id), [alice.id]);
        assert.equal((await db.query('update public.presave_campaigns set title=$1 where id=$2 returning id', ['Stolen', bob.id])).rows.length, 0);
        assert.equal((await db.query('delete from public.presave_campaigns where id=$1 returning id', [bob.id])).rows.length, 0);
        await assert.rejects(createCampaign(db, BOB, 'forged-owner'), denied);
        await assert.rejects(db.query('update public.presave_campaigns set owner_id=$1 where id=$2', [BOB, alice.id]), denied);
        await assert.rejects(db.query('update public.presave_campaigns set id=gen_random_uuid() where id=$1', [alice.id]), denied);
        assert.equal((await db.query('update public.presave_campaigns set title=$1 where id=$2 returning title', ['Owned edit', alice.id])).rows[0].title, 'Owned edit');
      });
      assert.equal((await db.query('select title from public.presave_campaigns where id=$1', [bob.id])).rows[0].title, 'Test release');
    });

    await t.test('anonymous visitors get only published public fields and cannot enumerate private campaign rows', async () => {
      const published = await createCampaign(db, ALICE, 'published-public', { published: true });
      await asRole(db, 'anon', null, async () => {
        await assert.rejects(db.query('select * from public.presave_campaigns'), denied);
        assert.equal((await db.query('select public.presave_public($1) as page', ['alice-private'])).rows[0].page, null);
        assert.equal((await db.query('select public.presave_public($1) as page', ['missing-page'])).rows[0].page, null);
        const page = (await db.query('select public.presave_public($1) as page', [published.slug])).rows[0].page;
        assert.equal(page.slug, published.slug);
        for (const key of ['id', 'owner_id', 'published', 'created_at', 'updated_at', 'stats', 'refresh_token_ciphertext']) assert.equal(Object.hasOwn(page, key), false, key);
        await assert.rejects(createCampaign(db, ALICE, 'anonymous-insert'), denied);
      });
      await db.query('update public.presave_campaigns set published=false where id=$1', [published.id]);
      await asRole(db, 'anon', null, async () => assert.equal((await db.query('select public.presave_public($1) as page', [published.slug])).rows[0].page, null));
    });

    await t.test('MFA enrolled accounts cannot bypass second factor through direct campaign or artwork APIs', async () => {
      await db.query("insert into auth.mfa_factors(user_id,status) values ($1,'verified')", [ALICE]);
      await asRole(db, 'authenticated', ALICE, async () => {
        assert.equal((await db.query('select id from public.presave_campaigns')).rows.length, 0);
        await assert.rejects(createCampaign(db, ALICE, 'aal1-bypass'), denied);
        await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['presave-artwork', `${ALICE}/aal1.png`]), denied);
      });
      await asRole(db, 'authenticated', ALICE, async () => {
        assert.ok((await db.query('select id from public.presave_campaigns')).rows.length > 0);
        await createCampaign(db, ALICE, 'aal2-allowed');
      }, 'aal2');
      await db.query('delete from auth.mfa_factors where user_id=$1', [ALICE]);
    });

    await t.test('campaigns have no release-distribution dependency or count quota and slugs stay globally unique', async () => {
      await asRole(db, 'authenticated', ALICE, async () => {
        const { rows } = await db.query(`insert into public.presave_campaigns(owner_id,slug,title,artist)
          select $1,'unlimited-'||i,'Independent release '||i,'Artist' from generate_series(1,125) i returning id`, [ALICE]);
        assert.equal(rows.length, 125);
      });
      await asRole(db, 'authenticated', BOB, async () => {
        await assert.rejects(createCampaign(db, BOB, 'unlimited-1'), (error) => error.code === '23505');
      });
    });

    await t.test('direct database writes cannot bypass URL, JSON, date, slug, and styling constraints', async () => {
      let count = 0;
      await asRole(db, 'authenticated', ALICE, async () => {
        for (const patch of [
          { slug: 'admin' }, { slug: 'bad--slug' }, { title: '   ' },
          { artwork_url: 'javascript:alert(1)' }, { artwork_url: 'https://user:password@example.com' },
          { artwork_url: 'https://' }, { artwork_url: 'https://example.com/a b' },
          { theme: 'arbitrary-css' }, { layout: 'unsafe-layout' }, { accent: 'red;display:none' },
          { background_url: 'javascript:alert(1)' }, { background_url: 'http://example.com/cover.jpg' },
          { background_url: 'https://user:password@example.com/cover.jpg' }, { background_url: 'https://example.com/";display:none' },
          { background_url: 'https://example.com/' + 'a'.repeat(2048) },
          { background_overlay: -1 }, { background_overlay: 91 }, { background_overlay: null },
          { background_overlay: '55.5' }, { background_motion: null },
          { background_color: '#fff' }, { background_color: 'red;display:none' }, { background_color: null },
          { text_color: '#gggggg' }, { text_color: null },
          { button_style: 'round' }, { button_style: null }, { font_style: 'url(https://evil.example)' },
          { links: JSON.stringify({ url: 'https://example.com' }) },
          { links: JSON.stringify([null]) }, { links: JSON.stringify([{ label: 'Listen', url: 'javascript:alert(1)' }]) },
          { links: JSON.stringify([{ label: 'Listen' }]) }, { links: JSON.stringify([{ label: '', url: 'https://example.com' }]) },
          { links: JSON.stringify(Array.from({ length: 13 }, () => ({ label: 'Listen', url: 'https://example.com' }))) },
          { release_at: 'infinity' }, { release_at: 'not-a-date' }, { release_at: '2027-02-30T00:00:00Z' },
          { spotify_uri: URI, release_at: null }, { spotify_uri: 'spotify:track:short' },
        ]) {
          count += 1;
          await assert.rejects(createCampaign(db, ALICE, `invalid-input-${count}`, patch), constraint, JSON.stringify(patch));
        }
      });
    });

    await t.test('unprivileged roles cannot invoke worker/admin RPCs or read fan credentials, OAuth states, counters, and rate buckets', async () => {
      const privileged = [
        ['presave_list(uuid,integer,integer,text,text)', `select public.presave_list('${ALICE}')`],
        ['presave_rate_limit(text,integer,integer)', "select public.presave_rate_limit('forged',1,60)"],
        ['presave_record_event(uuid,text)', "select public.presave_record_event(gen_random_uuid(),'view')"],
        ['presave_claim_due(integer)', 'select * from public.presave_claim_due(50)'],
        ['presave_accept_authorization(uuid,text,text,timestamp with time zone,text,text)', "select public.presave_accept_authorization(gen_random_uuid(),'hash','target',now(),'token','cancel')"],
      ];
      for (const role of ['anon', 'authenticated']) {
        await asRole(db, role, role === 'authenticated' ? ALICE : null, async () => {
          for (const table of ['presave_authorizations', 'presave_oauth_states', 'presave_metrics', 'presave_rate_buckets']) {
            await assert.rejects(db.query(`select * from public.${table}`), denied, table);
          }
          for (const [signature, query] of privileged) {
            assert.equal((await db.query("select has_function_privilege(current_user,$1,'EXECUTE') as allowed", [`public.${signature}`])).rows[0].allowed, false, signature);
            await assert.rejects(db.query(query), denied, signature);
          }
        });
      }
    });

    await t.test('public artwork writes and list operations are limited to each owner path', async () => {
      await asRole(db, 'authenticated', ALICE, async () => {
        await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['presave-artwork', `${ALICE}/cover.png`]);
        await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['presave-artwork', `${BOB}/forged.png`]), denied);
        await assert.rejects(db.query('update storage.objects set name=$1 where name=$2', [`${BOB}/moved.png`, `${ALICE}/cover.png`]), denied);
      });
      await asRole(db, 'authenticated', BOB, async () => {
        assert.equal((await db.query('select id from storage.objects')).rows.length, 0);
        assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
      });
      const config = (await db.query("select file_size_limit,allowed_mime_types from storage.buckets where id='presave-artwork'")).rows[0];
      assert.equal(Number(config.file_size_limit), 5242880);
      assert.deepEqual(config.allowed_mime_types.sort(), ['image/jpeg', 'image/png', 'image/webp']);
    });

    await t.test('fan consent locks the target recording and campaign deletion removes credentials', async () => {
      const campaign = await createCampaign(db, ALICE, 'consent-bound', { spotify_uri: URI, release_at: new Date().toISOString(), published: true });
      const auth = await authorize(db, campaign.id);
      await asRole(db, 'authenticated', ALICE, async () => {
        await assert.rejects(db.query('update public.presave_campaigns set spotify_uri=$1 where id=$2', [OTHER_URI, campaign.id]), constraint);
        await db.query("update public.presave_campaigns set release_at=now()+interval '3 days',title='New title' where id=$1", [campaign.id]);
      });
      assert.equal(new Date((await db.query('select scheduled_for from public.presave_authorizations where id=$1', [auth.id])).rows[0].scheduled_for).toISOString(), new Date(auth.scheduled_for).toISOString());
      await db.query('delete from public.presave_campaigns where id=$1', [campaign.id]);
      assert.equal((await db.query('select id from public.presave_authorizations where id=$1', [auth.id])).rows.length, 0);
    });

    await t.test('owner listings paginate and filter without treating search strings as SQL', async () => {
      await asRole(db, 'service_role', null, async () => {
        const result = (await db.query("select public.presave_list($1,2,10,'unlimited','all') as data", [ALICE])).rows[0].data;
        assert.equal(result.total, 125);
        assert.equal(result.campaigns.length, 10);
        assert.ok(result.campaigns.every((campaign) => campaign.owner_id === ALICE));
        const malicious = (await db.query("select public.presave_list($1,1,10,$2,'all') as data", [ALICE, "' OR 1=1 --"])).rows[0].data;
        assert.equal(malicious.total, 0);
        assert.equal(malicious.campaigns.length, 0);
        const bounded = (await db.query("select public.presave_list($1,0,999,'unlimited','all') as data", [ALICE])).rows[0].data;
        assert.equal(bounded.page, 1);
        assert.equal(bounded.page_size, 50);
        assert.equal(bounded.campaigns.length, 50);
      });
    });

    await t.test('authorization acceptance rejects unpublished or changed targets, deduplicates fans, and never repeats a completed save', async () => {
      const campaign = await createCampaign(db, ALICE, 'callback-live', { spotify_uri: URI, release_at: new Date().toISOString(), published: true });
      const draft = await createCampaign(db, ALICE, 'callback-draft', { spotify_uri: URI, release_at: new Date().toISOString() });
      const fan = 'a'.repeat(64);
      const cancellation = 'b'.repeat(64);
      const accept = async (id, target = URI, token = 'encrypted-token', cancel = cancellation) => (
        await db.query('select public.presave_accept_authorization($1,$2,$3,now(),$4,$5) as status', [id, fan, target, token, cancel])
      ).rows[0].status;
      await asRole(db, 'service_role', null, async () => {
        await assert.rejects(accept(draft.id), constraint);
        await assert.rejects(accept(campaign.id, OTHER_URI), constraint);
        assert.equal(await accept(campaign.id), 'pending');
        assert.equal(await accept(campaign.id, URI, 'replacement-token', 'c'.repeat(64)), 'pending');
        const jobs = (await db.query('select * from public.presave_authorizations where campaign_id=$1', [campaign.id])).rows;
        assert.equal(jobs.length, 1);
        assert.equal(jobs[0].refresh_token_ciphertext, 'replacement-token');
        assert.equal(jobs[0].cancel_hash, 'c'.repeat(64));
        await db.query("update public.presave_authorizations set status='saved',refresh_token_ciphertext=null,saved_at=now() where campaign_id=$1", [campaign.id]);
        assert.equal(await accept(campaign.id, URI, 'must-not-retain', 'd'.repeat(64)), 'saved');
        const saved = (await db.query('select status,refresh_token_ciphertext,saved_at from public.presave_authorizations where campaign_id=$1', [campaign.id])).rows[0];
        assert.equal(saved.status, 'saved');
        assert.equal(saved.refresh_token_ciphertext, null);
        assert.ok(saved.saved_at);
        await db.query('update public.presave_campaigns set published=false where id=$1', [campaign.id]);
        await assert.rejects(accept(campaign.id), constraint);
      });
    });

    await t.test('rate limits allow a bounded burst, do not grow without bound, and isolate keys and windows', async () => {
      await asRole(db, 'service_role', null, async () => {
        const decisions = [];
        for (let i = 0; i < 7; i += 1) decisions.push((await db.query("select public.presave_rate_limit('visitor-a',3,86400) as ok")).rows[0].ok);
        assert.deepEqual(decisions, [true, true, true, false, false, false, false]);
        assert.equal((await db.query("select hits from public.presave_rate_buckets where key='visitor-a'")).rows[0].hits, 4);
        assert.equal((await db.query("select public.presave_rate_limit('visitor-b',3,86400) as ok")).rows[0].ok, true);
        await db.query("update public.presave_rate_buckets set bucket=bucket-interval '1 day' where key='visitor-a'");
        assert.equal((await db.query("select public.presave_rate_limit('visitor-a',3,86400) as ok")).rows[0].ok, true);
        await assert.rejects(db.query("select public.presave_rate_limit('bad',0,60)"));
      });
    });

    await t.test('scheduler claims only eligible jobs, keeps active leases exclusive, and renews expired leases with new tokens', async () => {
      const published = await createCampaign(db, ALICE, 'worker-live', { published: true });
      const draft = await createCampaign(db, ALICE, 'worker-draft');
      const due = await authorize(db, published.id);
      const future = await authorize(db, published.id, { scheduled: '2 days' });
      const backoff = await authorize(db, published.id, { next: '1 hour' });
      const hidden = await authorize(db, draft.id);
      const expired = await authorize(db, published.id, { expiry: '-1 hour' });
      const stale = await authorize(db, published.id, { scheduled: '-8 days' });
      const cancelled = await authorize(db, published.id, { status: 'cancelled' });
      await asRole(db, 'service_role', null, async () => {
        const first = (await db.query('select * from public.presave_claim_due(10)')).rows;
        assert.deepEqual(first.map((job) => job.id), [due.id]);
        assert.equal(first[0].status, 'processing');
        assert.equal(first[0].attempts, 1);
        assert.ok(first[0].claim_token);
        assert.ok(new Date(first[0].lease_until).getTime() > Date.now());
        assert.equal((await db.query('select * from public.presave_claim_due(10)')).rows.length, 0);
        await db.query("update public.presave_authorizations set lease_until=now()-interval '1 second' where id=$1", [due.id]);
        const renewed = (await db.query('select * from public.presave_claim_due(10)')).rows;
        assert.deepEqual(renewed.map((job) => job.id), [due.id]);
        assert.equal(renewed[0].attempts, 2);
        assert.notEqual(renewed[0].claim_token, first[0].claim_token);
      });
      for (const id of [future.id, backoff.id, hidden.id]) assert.equal((await db.query('select status from public.presave_authorizations where id=$1', [id])).rows[0].status, 'pending');
      assert.equal((await db.query('select status from public.presave_authorizations where id=$1', [cancelled.id])).rows[0].status, 'cancelled');
      for (const [id, code] of [[expired.id, 'authorization_expired'], [stale.id, 'release_unavailable']]) {
        const row = (await db.query('select status,refresh_token_ciphertext,error_code from public.presave_authorizations where id=$1', [id])).rows[0];
        assert.deepEqual(row, { status: 'failed', refresh_token_ciphertext: null, error_code: code });
      }
    });

    await t.test('view and click events count only published campaigns and validate event type', async () => {
      const live = await createCampaign(db, BOB, 'metrics-live', { published: true });
      const draft = await createCampaign(db, BOB, 'metrics-draft');
      await asRole(db, 'service_role', null, async () => {
        for (const kind of ['view', 'view', 'click']) await db.query('select public.presave_record_event($1,$2)', [live.id, kind]);
        await db.query('select public.presave_record_event($1,$2)', [draft.id, 'view']);
        await assert.rejects(db.query('select public.presave_record_event($1,$2)', [live.id, 'fake-kind']));
        const metrics = (await db.query('select views,clicks from public.presave_metrics where campaign_id=$1', [live.id])).rows[0];
        assert.equal(Number(metrics.views), 2);
        assert.equal(Number(metrics.clicks), 1);
        assert.equal((await db.query('select * from public.presave_metrics where campaign_id=$1', [draft.id])).rows.length, 0);
      });
    });
  } finally { await db.close(); }
});
