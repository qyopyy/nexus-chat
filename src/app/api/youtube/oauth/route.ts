import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Implicit OAuth return for optional YouTube account linking.
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID. Token is handled client-side via hash fragment;
 * this route just serves a tiny bridge page that posts the access token to the opener.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const html = `<!doctype html><html><body style="background:#0b0d12;color:#fff;font:14px system-ui;padding:24px">
<p>Connecting YouTube…</p>
<script>
(function(){
  var h = location.hash.replace(/^#/, '');
  var p = new URLSearchParams(h);
  var token = p.get('access_token');
  if (!token) {
    document.body.innerHTML = '<p>No token — close this window and try again.</p>';
    return;
  }
  fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(function(r){ return r.json(); }).then(function(j){
    var it = (j.items && j.items[0]) || null;
    if (!it) throw new Error('No channel');
    var ch = {
      id: it.id,
      title: (it.snippet && it.snippet.title) || 'YouTube',
      handle: (it.snippet && it.snippet.customUrl) || null,
      thumb: (it.snippet && it.snippet.thumbnails && it.snippet.thumbnails.default && it.snippet.thumbnails.default.url) || null
    };
    try { localStorage.setItem('nexus.youtube.channel', JSON.stringify(ch)); } catch (e) {}
    location.replace(${JSON.stringify(origin)} + '/?yt=linked');
  }).catch(function(e){
    document.body.innerHTML = '<p>Could not load your YouTube channel.</p>';
  });
})();
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
