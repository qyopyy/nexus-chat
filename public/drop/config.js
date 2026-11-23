// Optional public overrides. Omit Supabase values to reuse Nexus Pre-save config.
// STUN helps peers connect directly. Add a short-lived TURN credential provider
// through your own backend if transfers across restrictive networks are required.
// Never put a permanent TURN password or service-role key in this public file.
window.NEXUS_DROP_RTC = Object.freeze({
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
});
