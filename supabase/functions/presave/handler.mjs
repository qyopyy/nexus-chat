import {
  HttpError, MAX_ADVANCE_DAYS, callbackReturn, configuredPublicUrl, decrypt,
  encrypt, oauthCookie, pkceChallenge, randomToken, readCookie, retryPlan,
  safeReturnUrl, sha256, slug, tokenKey, uuid, validateCampaign,
} from './core.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SECURITY = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS, ...SECURITY, 'Content-Type': 'application/json' },
});
const redirect = (location, cookie) => new Response(null, {
  status: 303, headers: { ...SECURITY, Location: location, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});
const timestamp = () => new Date().toISOString();
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function readJson(req) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Send an application/json request.');
  }
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request is required.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw new HttpError(413, 'This request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid JSON request.');
  return body;
}

function dbError(error) {
  if (!error) return;
  if (error.code === '23505') throw new HttpError(409, 'That link name is already taken. Choose another.', 'slug_taken');
  if (error.code === '23514' && String(error.message).startsWith('Spotify recording is locked')) {
    throw new HttpError(409, 'This Spotify recording already has pre-saves. Duplicate the campaign to use a different recording.', 'recording_locked');
  }
  if (error.code === '23514') throw new HttpError(400, 'The campaign changed or contains invalid details. Reload and check its settings.');
  throw new HttpError(503, 'The pre-save service is temporarily unavailable. Please try again.', 'service_unavailable');
}

// Dependencies are injectable so the real request handler can be exercised without
// network credentials. No handler ever trusts a client-provided owner identifier.
export function createPresaveHandler({ db, env, fetchImpl = fetch }) {
  const get = (name) => typeof env === 'function' ? env(name) : env[name];
  const endpoint = `${String(get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/presave`;
  const callback = `${endpoint}?action=callback`;
  const key = () => get('PRESAVE_TOKEN_KEY');

  async function spotifyConfigured() {
    try {
      if (!get('SPOTIFY_CLIENT_ID') || String(get('PRESAVE_CRON_SECRET') ?? '').length < 32 || get('PRESAVE_SCHEDULER_ENABLED') !== 'true') return false;
      configuredPublicUrl(get('PRESAVE_PUBLIC_URL'));
      await tokenKey(key());
      return true;
    } catch { return false; }
  }

  async function requireSpotify() {
    if (!await spotifyConfigured()) throw new HttpError(503, 'Spotify pre-saves are not connected yet. The service owner must finish Spotify and scheduler setup.', 'setup_required');
  }

  async function owner(req) {
    const token = (req.headers.get('Authorization') ?? '').match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new HttpError(401, 'Sign in to your Nexus account first.', 'sign_in_required');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user?.id) throw new HttpError(401, 'Your session expired. Sign in again.', 'sign_in_required');
    // Decode claims only AFTER Supabase has verified this exact token.
    if (data.user.factors?.some((factor) => factor.status === 'verified')) {
      let aal;
      try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        aal = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).aal;
      } catch { /* no valid second factor */ }
      if (aal !== 'aal2') throw new HttpError(403, 'Complete your Nexus two-factor sign-in before managing pre-save links.', 'mfa_required');
    }
    return data.user.id;
  }

  async function activeCampaign(value) {
    const { data, error } = await db.from('presave_campaigns').select('*').eq('slug', slug(value)).eq('published', true).maybeSingle();
    dbError(error);
    if (!data) throw new HttpError(404, 'This pre-save link is unavailable.', 'not_found');
    return data;
  }

  async function rate(req, purpose, limit, seconds) {
    // Trusted reverse-proxy headers are supplied by Supabase's Edge gateway.
    // Raw addresses are never retained in the database or returned to creators.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const digest = await sha256(`${get('PRESAVE_CRON_SECRET') || get('SUPABASE_SERVICE_ROLE_KEY')}:${purpose}:${ip}`);
    const { data, error } = await db.rpc('presave_rate_limit', { p_key: digest, p_limit: limit, p_window_seconds: seconds });
    dbError(error);
    return Boolean(data);
  }

  async function spotifyFetch(url, init = {}) {
    return fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) });
  }

  async function authorize(req, body) {
    await requireSpotify();
    const campaign = await activeCampaign(body.slug);
    if (!campaign.spotify_uri || !campaign.release_at) throw new HttpError(409, 'This campaign does not have a Spotify recording and release time yet.');
    if (Date.parse(campaign.release_at) > Date.now() + MAX_ADVANCE_DAYS * 86400000) {
      throw new HttpError(409, `Spotify pre-saves open ${MAX_ADVANCE_DAYS} days before release. Please come back closer to release day.`, 'release_too_far');
    }
    const returnUrl = safeReturnUrl(body.return_url, get('PRESAVE_PUBLIC_URL'));
    if (!await rate(req, 'authorize', 20, 300)) throw new HttpError(429, 'Too many connection attempts. Please wait a few minutes.', 'rate_limited');
    const ticket = randomToken();
    const ticketHash = await sha256(ticket);
    const verifier = randomToken();
    const { error } = await db.from('presave_oauth_states').insert({
      ticket_hash: ticketHash,
      verifier_ciphertext: await encrypt(verifier, key(), `state:${ticketHash}`),
      campaign_id: campaign.id,
      target_uri: campaign.spotify_uri,
      scheduled_for: new Date(Math.max(Date.now(), Date.parse(campaign.release_at))).toISOString(),
      return_url: returnUrl,
    });
    dbError(error);
    // Establish the HttpOnly cookie during a top-level navigation, not in a
    // cross-origin fetch where browsers may block third-party cookies.
    return json({ url: `${endpoint}?action=connect&ticket=${ticket}` });
  }

  async function connect(req, params) {
    await requireSpotify();
    const ticket = params.get('ticket') ?? '';
    if (!TOKEN.test(ticket)) throw new HttpError(400, 'Invalid authorization link. Return to the release page and try again.');
    const state = randomToken();
    const browser = randomToken();
    const { data: pending, error } = await db.from('presave_oauth_states').update({
      state_hash: await sha256(state), browser_hash: await sha256(browser),
    }).eq('ticket_hash', await sha256(ticket)).is('state_hash', null).gt('expires_at', timestamp()).select('*').maybeSingle();
    dbError(error);
    if (!pending) throw new HttpError(400, 'This authorization link expired or was already used. Return to the release page and try again.');
    const { data: campaign, error: campaignError } = await db.from('presave_campaigns').select('published,spotify_uri').eq('id', pending.campaign_id).maybeSingle();
    dbError(campaignError);
    if (!campaign?.published || campaign.spotify_uri !== pending.target_uri) throw new HttpError(404, 'This campaign changed. Return to the release page and try again.');
    const verifier = await decrypt(pending.verifier_ciphertext, key(), `state:${pending.ticket_hash}`);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({
      client_id: get('SPOTIFY_CLIENT_ID'), response_type: 'code', redirect_uri: callback,
      scope: 'user-library-modify user-read-private', state,
      code_challenge_method: 'S256', code_challenge: await pkceChallenge(verifier),
    }).toString();
    return redirect(url.href, oauthCookie(state, browser));
  }

  async function finishOAuth(req, params) {
    await requireSpotify();
    const state = params.get('state') ?? '';
    if (!TOKEN.test(state)) throw new HttpError(400, 'Invalid Spotify authorization state.');
    const cookie = readCookie(req.headers.get('cookie'), `np_oauth_${state.slice(0, 12)}`) ?? '';
    if (!TOKEN.test(cookie)) throw new HttpError(400, 'Your authorization session expired. Return to the release page and try again in the same browser.');
    // DELETE ... RETURNING atomically consumes a browser-bound, expiring state.
    const { data: pending, error } = await db.from('presave_oauth_states').delete().eq('state_hash', await sha256(state)).eq('browser_hash', await sha256(cookie)).gt('expires_at', timestamp()).select('*').maybeSingle();
    dbError(error);
    if (!pending) throw new HttpError(400, 'Your authorization session expired or was already used.');
    const { data: campaign, error: campaignError } = await db.from('presave_campaigns').select('id,slug,published,spotify_uri').eq('id', pending.campaign_id).maybeSingle();
    dbError(campaignError);
    const clearCookie = oauthCookie(state, '', 0);
    if (!campaign?.published || campaign.spotify_uri !== pending.target_uri) {
      return redirect(callbackReturn(pending.return_url, campaign?.slug ?? 'unavailable', 'error'), clearCookie);
    }
    if (params.has('error')) return redirect(callbackReturn(pending.return_url, campaign.slug, params.get('error') === 'access_denied' ? 'cancelled' : 'error'), clearCookie);
    const code = params.get('code');
    if (!code || code.length > 2048) return redirect(callbackReturn(pending.return_url, campaign.slug, 'error'), clearCookie);
    try {
      const verifier = await decrypt(pending.verifier_ciphertext, key(), `state:${pending.ticket_hash}`);
      const response = await spotifyFetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: get('SPOTIFY_CLIENT_ID'), code, redirect_uri: callback, code_verifier: verifier }),
      });
      const tokens = await response.json();
      if (!response.ok || typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string' || !String(tokens.scope ?? '').split(' ').includes('user-library-modify')) {
        throw new Error('Spotify authorization was not granted');
      }
      const profileResponse = await spotifyFetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileResponse.json();
      // Spotify's immutable account_id is preferred over the legacy mutable id.
      const accountId = profile.account_id || profile.id;
      if (!profileResponse.ok || typeof accountId !== 'string' || !accountId || accountId.length > 256) throw new Error('Spotify account unavailable');
      const userHash = await sha256(`spotify:${get('SPOTIFY_CLIENT_ID')}:${accountId}`);
      const cancelToken = randomToken();
      const { error: acceptError } = await db.rpc('presave_accept_authorization', {
        p_campaign: campaign.id, p_user_hash: userHash, p_target: pending.target_uri,
        p_scheduled_for: pending.scheduled_for,
        p_token: await encrypt(tokens.refresh_token, key(), `spotify:${campaign.id}:${userHash}`),
        p_cancel_hash: await sha256(cancelToken),
      });
      dbError(acceptError);
      return redirect(callbackReturn(pending.return_url, campaign.slug, 'success', cancelToken), clearCookie);
    } catch {
      // Never include provider responses, codes, refresh tokens or keys in logs
      // or URLs. The public page gives a retry action for this neutral status.
      return redirect(callbackReturn(pending.return_url, campaign.slug, 'error'), clearCookie);
    }
  }

  async function changeJob(job, changes) {
    const { error } = await db.from('presave_authorizations').update(changes).eq('id', job.id).eq('claim_token', job.claim_token).eq('status', 'processing');
    dbError(error);
  }

  async function processJob(job) {
    let responseStatus = 0;
    let retryAfter = null;
    let errorCode = 'provider_unavailable';
    let rotatedToken = null;
    try {
      const refreshToken = await decrypt(job.refresh_token_ciphertext, key(), `spotify:${job.campaign_id}:${job.spotify_user_hash}`);
      const tokenResponse = await spotifyFetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: get('SPOTIFY_CLIENT_ID') }),
      });
      const tokens = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || typeof tokens.access_token !== 'string') {
        responseStatus = tokens.error === 'invalid_grant' ? 401 : tokenResponse.status === 429 ? 429 : 503;
        retryAfter = tokenResponse.headers.get('retry-after');
        errorCode = tokens.error === 'invalid_grant' ? 'reauthorization_required' : 'provider_unavailable';
        throw new Error('Token unavailable');
      }
      if (typeof tokens.refresh_token === 'string') {
        rotatedToken = await encrypt(tokens.refresh_token, key(), `spotify:${job.campaign_id}:${job.spotify_user_hash}`);
        // Persist rotation before making another external request, so a worker
        // interruption does not lose a refresh token that superseded the old one.
        await changeJob(job, { refresh_token_ciphertext: rotatedToken });
      }
      const { data: stillActive, error: activeError } = await db.from('presave_authorizations').select('id').eq('id', job.id).eq('claim_token', job.claim_token).eq('status', 'processing').maybeSingle();
      dbError(activeError);
      if (!stillActive) return 'cancelled';
      const { data: campaign, error: campaignError } = await db.from('presave_campaigns').select('published').eq('id', job.campaign_id).maybeSingle();
      dbError(campaignError);
      if (!campaign?.published) {
        await changeJob(job, { status: 'pending', lease_until: null, claim_token: null, next_attempt_at: new Date(Date.now() + 300000).toISOString() });
        return 'paused';
      }
      // Current Spotify library API. Only the exact track/album consented to is saved.
      const response = await spotifyFetch(`https://api.spotify.com/v1/me/library?${new URLSearchParams({ uris: job.target_uri })}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      responseStatus = response.status;
      retryAfter = response.headers.get('retry-after');
      if (!response.ok) {
        errorCode = response.status === 403 ? 'provider_access_denied' : response.status === 401 ? 'reauthorization_required' : response.status === 404 ? 'release_unavailable' : 'provider_unavailable';
        throw new Error('Library write unavailable');
      }
      // If persistence is interrupted after Spotify succeeds, retry the
      // idempotent save rather than permanently failing this authorization.
      responseStatus = 0;
      await changeJob(job, { status: 'saved', saved_at: timestamp(), refresh_token_ciphertext: null, error_code: null, lease_until: null, claim_token: null });
      return 'saved';
    } catch {
      const retry = retryPlan(responseStatus, job.attempts, retryAfter);
      await changeJob(job, {
        status: retry.status, next_attempt_at: retry.next_attempt_at ?? timestamp(),
        error_code: errorCode, lease_until: null, claim_token: null,
        ...(retry.status === 'failed' ? { refresh_token_ciphertext: null } : rotatedToken ? { refresh_token_ciphertext: rotatedToken } : {}),
      });
      return retry.status;
    }
  }

  async function run(req) {
    const secret = String(get('PRESAVE_CRON_SECRET') ?? '');
    const supplied = req.headers.get('x-presave-cron-secret') ?? '';
    // Hashes have a fixed size; compare every character to avoid early exits.
    const [left, right] = await Promise.all([sha256(secret), sha256(supplied)]);
    let different = 0;
    for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i);
    if (secret.length < 32 || different) throw new HttpError(401, 'Scheduler authorization required.');
    await requireSpotify();
    const batchSize = Math.max(1, Math.min(50, Math.trunc(Number(get('PRESAVE_BATCH_SIZE')) || 10)));
    const { data: jobs, error } = await db.rpc('presave_claim_due', { p_limit: batchSize });
    dbError(error);
    const results = await Promise.allSettled((jobs ?? []).map(processJob));
    const counts = {};
    for (const result of results) {
      const status = result.status === 'fulfilled' ? result.value : 'worker_error';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return json({ processed: results.length, results: counts });
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const params = new URL(req.url).searchParams;
      if (req.method === 'GET') {
        if (params.get('action') === 'connect') return await connect(req, params);
        if (params.get('action') === 'callback') return await finishOAuth(req, params);
        throw new HttpError(405, 'Use POST for the pre-save API.');
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      const body = await readJson(req);
      switch (body.action) {
        case 'config': {
          let publicUrl = null;
          try { publicUrl = configuredPublicUrl(get('PRESAVE_PUBLIC_URL')).href; } catch { /* not set up yet */ }
          return json({ spotify_configured: await spotifyConfigured(), public_url: publicUrl, max_advance_days: MAX_ADVANCE_DAYS });
        }
        case 'list': {
          const userId = await owner(req);
          const page = Math.max(1, Math.min(1000000, Math.trunc(Number(body.page) || 1)));
          const pageSize = Math.max(1, Math.min(50, Math.trunc(Number(body.page_size) || 12)));
          const { data, error } = await db.rpc('presave_list', {
            p_owner: userId, p_page: page, p_page_size: pageSize,
            p_search: typeof body.search === 'string' ? body.search.trim().slice(0, 120) : '',
            p_status: ['draft', 'published'].includes(body.status) ? body.status : 'all',
          });
          dbError(error);
          return json(data);
        }
        case 'save': {
          const userId = await owner(req);
          const campaign = validateCampaign(body.campaign);
          const result = body.campaign.id
            ? await db.from('presave_campaigns').update(campaign).eq('id', uuid(body.campaign.id)).eq('owner_id', userId).select('*').maybeSingle()
            : await db.from('presave_campaigns').insert({ ...campaign, owner_id: userId }).select('*').single();
          dbError(result.error);
          if (!result.data) throw new HttpError(404, 'Campaign not found.', 'not_found');
          return json({ campaign: result.data });
        }
        case 'duplicate': {
          const userId = await owner(req);
          const { data: original, error } = await db.from('presave_campaigns').select('*').eq('id', uuid(body.id)).eq('owner_id', userId).maybeSingle();
          dbError(error);
          if (!original) throw new HttpError(404, 'Campaign not found.', 'not_found');
          const campaign = validateCampaign({ ...original, slug: `${original.slug.slice(0, 50).replace(/-$/, '')}-${crypto.randomUUID().slice(0, 8)}`, title: `${original.title.slice(0, 113)} (copy)`, published: false });
          const { data, error: insertError } = await db.from('presave_campaigns').insert({ ...campaign, owner_id: userId }).select('*').single();
          dbError(insertError);
          return json({ campaign: data });
        }
        case 'delete': {
          const userId = await owner(req);
          const { data, error } = await db.from('presave_campaigns').delete().eq('id', uuid(body.id)).eq('owner_id', userId).select('id').maybeSingle();
          dbError(error);
          if (!data) throw new HttpError(404, 'Campaign not found.', 'not_found');
          return json({ ok: true });
        }
        case 'page': {
          const { data, error } = await db.rpc('presave_public', { p_slug: slug(body.slug) });
          dbError(error);
          if (!data) throw new HttpError(404, 'This pre-save link is unavailable.', 'not_found');
          return json({ campaign: data, spotify_configured: await spotifyConfigured(), max_advance_days: MAX_ADVANCE_DAYS });
        }
        case 'authorize': return await authorize(req, body);
        case 'track': {
          const campaign = await activeCampaign(body.slug);
          if (!['view', 'click'].includes(body.kind)) throw new HttpError(400, 'Invalid event.');
          if (body.kind === 'click' && (!Number.isInteger(body.index) || !campaign.links[body.index])) throw new HttpError(400, 'Invalid destination.');
          if (await rate(req, `${campaign.id}:${body.kind}`, body.kind === 'view' ? 1 : 10, 60)) {
            const { error } = await db.rpc('presave_record_event', { p_campaign: campaign.id, p_kind: body.kind });
            dbError(error);
          }
          return json({ ok: true });
        }
        case 'receipt': {
          const missing = () => new HttpError(404, 'Pre-save receipt not found.', 'not_found');
          if (typeof body.token !== 'string' || !TOKEN.test(body.token)) throw missing();
          let campaignSlug;
          try { campaignSlug = slug(body.slug); } catch { throw missing(); }
          if (!await rate(req, 'receipt', 60, 300)) throw new HttpError(429, 'Please wait a few minutes before trying again.', 'rate_limited');
          // The capability is bound to the requested campaign. Unpublished pages
          // still permit their fan to inspect/cancel an existing authorization.
          const { data: campaign, error: campaignError } = await db.from('presave_campaigns').select('id').eq('slug', campaignSlug).maybeSingle();
          dbError(campaignError);
          if (!campaign) throw missing();
          const { data: receipt, error } = await db.from('presave_authorizations')
            .select('status,scheduled_for,saved_at,error_code,token_expires_at')
            .eq('campaign_id', campaign.id).eq('cancel_hash', await sha256(body.token)).maybeSingle();
          dbError(error);
          if (!receipt) throw missing();
          const expired = receipt.error_code === 'authorization_expired'
            || (['pending', 'processing'].includes(receipt.status) && Date.parse(receipt.token_expires_at) <= Date.now());
          const safeErrorCodes = ['authorization_expired', 'release_unavailable', 'reauthorization_required', 'provider_access_denied', 'provider_unavailable'];
          return json({
            status: expired ? 'expired' : receipt.status,
            scheduled_for: receipt.scheduled_for,
            saved_at: receipt.saved_at ?? null,
            ...(safeErrorCodes.includes(receipt.error_code) ? { error_code: receipt.error_code } : {}),
          });
        }
        case 'cancel': {
          if (typeof body.token !== 'string' || !TOKEN.test(body.token)) throw new HttpError(400, 'Invalid cancellation link.');
          if (!await rate(req, 'cancel', 30, 300)) throw new HttpError(429, 'Please wait a few minutes before trying again.', 'rate_limited');
          const { error } = await db.from('presave_authorizations').update({ status: 'cancelled', refresh_token_ciphertext: null, lease_until: null, claim_token: null, error_code: null })
            .eq('cancel_hash', await sha256(body.token)).in('status', ['pending', 'processing', 'failed']);
          dbError(error);
          return json({ ok: true });
        }
        case 'run': return await run(req);
        default: throw new HttpError(400, 'Unknown pre-save action.');
      }
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
      // Do not log thrown fetch/auth/database objects: they may contain tokens.
      return json({ error: 'The pre-save service is temporarily unavailable. Please try again.', code: 'service_unavailable' }, 503);
    }
  };
}
