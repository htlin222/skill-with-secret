// The demo console: one self-contained page served at `/` behind Access.
// Vanilla fetch, no build step. It proves the whole loop in a browser —
// download your skill, see your key + version, rotate it, and read/write the
// protected KV resource live. Kept as a TS string so the FS-less Worker can
// serve it with zero extra wrangler config.
export const CONSOLE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>skill-with-secret · console</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; max-width: 680px;
         margin: 6vh auto; padding: 0 20px; }
  h1 { font: 600 24px/1.2 ui-serif, Georgia, serif; }
  .card { border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
          border-radius: 12px; padding: 18px 20px; margin: 18px 0; }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; cursor: pointer;
           border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
           background: color-mix(in srgb, currentColor 6%, transparent); }
  button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  input { font: inherit; padding: 7px 10px; border-radius: 8px;
          border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .key { word-break: break-all; opacity: .85; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .out { white-space: pre-wrap; min-height: 1.2em; opacity: .9; }
  .muted { opacity: .6; font-size: 13px; }
</style>
</head>
<body>
<h1>skill-with-secret</h1>
<p class="muted">You're signed in via Cloudflare Access. Everything below is scoped to your verified email — no key is ever typed in by hand.</p>

<div class="card">
  <strong>Your minted skill</strong>
  <p>Identity: <span class="mono" id="email">…</span> · key version <span id="ver">…</span></p>
  <p class="key mono" id="key">…</p>
  <div class="row">
    <a id="dl"><button class="primary">⬇ Download stash.skill</button></a>
    <button id="rotate">↻ Rotate key (revokes old skill)</button>
  </div>
  <p class="muted">Unzip the download into <code>~/.claude/skills/</code>. The baked <code>.env</code> means any agent can use it immediately.</p>
</div>

<div class="card">
  <strong>Try the protected resource (live)</strong>
  <p class="muted">These calls hit <code>/api/kv</code> with your bearer key — the same path your minted skill uses.</p>
  <div class="row">
    <input id="k" placeholder="key" value="demo" size="10" />
    <input id="v" placeholder="value" value="it works" />
    <button id="put">put</button>
    <button id="get">get</button>
    <button id="ls">ls</button>
  </div>
  <p class="out mono" id="out"></p>
</div>

<script>
let KEY = null, EMAIL = null;
const $ = (id) => document.getElementById(id);
const out = (x) => { $('out').textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2); };

async function loadKey() {
  const r = await fetch('/api/me/key');
  const j = await r.json();
  KEY = j.key; EMAIL = j.email;
  $('email').textContent = j.email;
  $('ver').textContent = j.version;
  $('key').textContent = j.key.slice(0, 14) + '…' + j.key.slice(-6);
  $('dl').href = '/api/me/skill';
}

function api(method, path, body) {
  return fetch('/api/kv' + path, {
    method,
    headers: { 'Authorization': 'Bearer ' + KEY, 'X-User-Email': EMAIL },
    body,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

$('rotate').onclick = async () => {
  if (!confirm('Rotate? Any already-downloaded skill will start returning 401.')) return;
  await fetch('/api/me/key/rotate', { method: 'POST' });
  await loadKey();
  out('Rotated. Re-download stash.skill — the old one is now revoked.');
};
$('put').onclick = async () => out(await api('PUT', '/' + $('k').value, $('v').value));
$('get').onclick = async () => out(await api('GET', '/' + $('k').value));
$('ls').onclick  = async () => out(await api('GET', ''));

loadKey().catch((e) => out('Failed to load key: ' + e));
</script>
</body>
</html>`;
