export const BITBUCKET_OAUTH_CALLBACK_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff'
} as const

export const BITBUCKET_OAUTH_CALLBACK_SUCCESS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Connected to Bitbucket</title>
    <style>
      :root { --background:#fff; --foreground:#0a0a0a; --muted:#737373; --success:#15803d; }
      @media (prefers-color-scheme: dark) {
        :root { --background:#0a0a0a; --foreground:#fafafa; --muted:#a1a1a1; --success:#86efac; }
      }
      body { min-height:100vh; margin:0; display:grid; place-items:center; background:var(--background); color:var(--foreground); font:15px/1.5 Geist, system-ui, sans-serif; }
      main { max-width:22rem; padding:1.5rem; text-align:center; }
      h1 { font-size:1.125rem; font-weight:600; margin:0 0 0.5rem; color:var(--success); }
      p { margin:0; color:var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <h1>Bitbucket connected</h1>
      <p>You can close this tab and return to Muster.</p>
    </main>
  </body>
</html>`
