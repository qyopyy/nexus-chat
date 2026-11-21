import { createClient } from './vendor/supabase.mjs';

const config = window.NEXUS_PRESAVE_CONFIG ?? {};
export const configured = Boolean(config.supabaseUrl && config.supabaseKey);
export const client = configured ? createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;

export async function api(action, payload = {}, owner = false) {
  if (!client) throw new Error('The pre-save service has not been configured yet.');
  const headers = { 'Content-Type': 'application/json', apikey: config.supabaseKey };
  if (owner) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('Sign in to your Nexus account to continue.');
    headers.Authorization = 'Bearer ' + data.session.access_token;
  }
  let response;
  try {
    response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/' + (config.functionName || 'presave'), {
      method: 'POST', headers, body: JSON.stringify({ ...payload, action }), signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('The pre-save service could not be reached. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 404 && action !== 'page'
      ? 'The pre-save service is not available yet. You can still customize a preview.'
      : data.error || 'The request could not be completed. Please try again.';
    const error = new Error(typeof message === 'string' ? message : 'The request could not be completed.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export async function needsMfa() {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export async function uploadArtwork(file, userId) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = userId + '/' + crypto.randomUUID() + '.' + extension;
  const { error } = await client.storage.from('presave-artwork').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return client.storage.from('presave-artwork').getPublicUrl(path).data.publicUrl;
}
