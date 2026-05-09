// preview-mock-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generates a self-contained JS snippet that is injected into the preview iframe
// BEFORE the React component code runs.
//
// What it does:
//   1. Overrides window.fetch
//   2. Intercepts every /api/* call
//   3. Handles it with an in-memory database (no real server needed)
//   4. Supports: GET list · GET one · POST · PUT · PATCH · DELETE
//   5. Handles /api/auth/register · /api/auth/login · /api/auth/me
//   6. Shows a "Preview Mode" badge so users know it's mock data
//
// Why this approach (not a real backend):
//   - The preview runs in an iframe with srcdoc — no server available
//   - Express + PostgreSQL cannot run in a browser
//   - This lets the app be fully interactive immediately
// ─────────────────────────────────────────────────────────────────────────────

export interface MockApiOptions {
  /** Seed data per entity — shown immediately on preview load */
  seedData?: Record<string, Record<string, unknown>[]>
  /** Simulated network delay in ms (default 60) */
  latency?: number
  /** Show the "Preview Mode" badge (default true) */
  showBadge?: boolean
}

/**
 * Returns a plain JS string (no JSX, no TypeScript) to inject into the preview
 * iframe. Must run before the React component mounts.
 */
export function buildMockApiScript(opts: MockApiOptions = {}): string {
  const {
    seedData   = {},
    latency    = 60,
    showBadge  = true,
  } = opts

  // Serialise seed data safely for injection into the script
  const seedJSON = JSON.stringify(seedData)

  return /* javascript */ `
(function () {
  // ── In-memory database ─────────────────────────────────────────────────────
  var _db    = ${seedJSON};
  var _users = [];
  var _nid   = 1;

  function getTable(entity) {
    if (!_db[entity]) _db[entity] = [];
    return _db[entity];
  }

  // ── Response helper ─────────────────────────────────────────────────────────
  function ok(data, status) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status:  status || 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  // ── Mini token (preview only — NOT real JWT) ───────────────────────────────
  function makeToken(payload) {
    return 'preview.' + btoa(JSON.stringify(payload));
  }
  function readToken(token) {
    try { return JSON.parse(atob((token || '').split('.')[1] || '')); }
    catch (_) { return null; }
  }

  // ── Parse query string ──────────────────────────────────────────────────────
  function parseQS(url) {
    var qs = url.split('?')[1] || '';
    var p  = {};
    qs.split('&').forEach(function(pair) {
      var kv = pair.split('=');
      if (kv[0]) p[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return p;
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  function parseBody(options) {
    try { return JSON.parse(options.body || '{}'); }
    catch (_) { return {}; }
  }

  // ── ID matcher (string or number) ──────────────────────────────────────────
  function matchId(item, id) {
    return String(item.id) === String(id);
  }

  // ── Main handler ────────────────────────────────────────────────────────────
  function handleRequest(urlStr, options) {
    var method   = ((options && options.method) || 'GET').toUpperCase();
    var basePath = urlStr.split('?')[0];               // strip query string
    var parts    = basePath.split('/').filter(Boolean); // ['api','tasks'] or ['api','tasks','123']
    var seg1     = parts[1];  // entity or 'auth'
    var seg2     = parts[2];  // id, or 'register'|'login'|'me'

    // ── AUTH routes ───────────────────────────────────────────────────────────
    if (seg1 === 'auth') {
      // POST /api/auth/register
      if (seg2 === 'register' && method === 'POST') {
        var body = parseBody(options);
        if (!body.email || !body.password) {
          return ok({ error: 'email and password required' }, 400);
        }
        if (_users.find(function(u) { return u.email === body.email; })) {
          return ok({ error: 'Email already registered' }, 409);
        }
        var user = {
          id:         String(_nid++),
          email:      body.email,
          name:       body.name  || '',
          role:       'user',
          created_at: new Date().toISOString(),
        };
        _users.push(Object.assign({}, user, { _password: body.password }));
        return ok({ user: user, token: makeToken({ userId: user.id, role: user.role }) }, 201);
      }

      // POST /api/auth/login
      if (seg2 === 'login' && method === 'POST') {
        var body = parseBody(options);
        var match = _users.find(function(u) {
          return u.email === body.email && u._password === body.password;
        });
        if (!match) return ok({ error: 'Invalid email or password' }, 401);
        var pub = { id: match.id, email: match.email, name: match.name, role: match.role };
        return ok({ user: pub, token: makeToken({ userId: match.id, role: match.role }) });
      }

      // GET /api/auth/me
      if (seg2 === 'me' && method === 'GET') {
        var headers  = (options && options.headers) || {};
        var authHdr  = headers['Authorization'] || headers['authorization'] || '';
        var token    = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
        var payload  = readToken(token);
        if (!payload) return ok({ error: 'Not authenticated' }, 401);
        var found = _users.find(function(u) { return u.id === payload.userId; });
        if (!found) return ok({ error: 'User not found' }, 404);
        return ok({ id: found.id, email: found.email, name: found.name, role: found.role });
      }
    }

    // ── CRUD routes ───────────────────────────────────────────────────────────
    var entity = seg1;
    var id     = seg2;    // may be undefined for collection routes
    var db     = getTable(entity);
    var qs     = parseQS(urlStr);

    // GET /api/{entity}  — list
    if (method === 'GET' && !id) {
      // search filter
      var search = qs.search || qs.q || '';
      var rows = search
        ? db.filter(function(row) {
            return Object.values(row).some(function(v) {
              return String(v).toLowerCase().includes(search.toLowerCase());
            });
          })
        : db.slice();

      // status / field filters  e.g. ?status=todo
      Object.keys(qs).forEach(function(k) {
        if (k !== 'search' && k !== 'q' && k !== 'page' && k !== 'limit') {
          rows = rows.filter(function(row) { return String(row[k]) === String(qs[k]); });
        }
      });

      // pagination — only if ?page or ?limit is in the URL
      if (qs.page || qs.limit) {
        var page  = Math.max(1, parseInt(qs.page  || '1'));
        var limit = Math.min(100, parseInt(qs.limit || '20'));
        var total = rows.length;
        rows = rows.slice((page - 1) * limit, page * limit);
        return ok({ data: rows, meta: { total: total, page: page, limit: limit, totalPages: Math.ceil(total / limit) } });
      }

      // default: return raw array (most generated frontends expect this)
      return ok(rows);
    }

    // GET /api/{entity}/:id
    if (method === 'GET' && id) {
      var item = db.find(function(i) { return matchId(i, id); });
      return item ? ok(item) : ok({ error: entity + ' not found' }, 404);
    }

    // POST /api/{entity}
    if (method === 'POST') {
      var body = parseBody(options);
      var newItem = Object.assign({ id: String(_nid++) }, body, {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      db.push(newItem);
      return ok(newItem, 201);
    }

    // PUT / PATCH /api/{entity}/:id
    if ((method === 'PUT' || method === 'PATCH') && id) {
      var idx = db.findIndex(function(i) { return matchId(i, id); });
      if (idx === -1) return ok({ error: entity + ' not found' }, 404);
      var body = parseBody(options);
      db[idx] = Object.assign({}, db[idx], body, { updated_at: new Date().toISOString() });
      return ok(db[idx]);
    }

    // DELETE /api/{entity}/:id
    if (method === 'DELETE' && id) {
      var idx = db.findIndex(function(i) { return matchId(i, id); });
      if (idx === -1) return ok({ error: entity + ' not found' }, 404);
      var removed = db.splice(idx, 1)[0];
      return ok({ deleted: true, id: removed.id });
    }

    return ok({ error: 'Route not found' }, 404);
  }

  // ── Wrap window.fetch ───────────────────────────────────────────────────────
  var _origFetch = window.fetch.bind(window);

  window.fetch = function(input, init) {
    var urlStr = typeof input === 'string' ? input
               : (input && input.url) ? input.url
               : String(input);

    // Only intercept /api/* — pass everything else through
    if (!urlStr.startsWith('/api/')) {
      return _origFetch(input, init);
    }

    // Simulate network latency
    return new Promise(function(resolve) {
      setTimeout(function() {
        try {
          resolve(handleRequest(urlStr, init || {}));
        } catch (err) {
          resolve(ok({ error: 'Mock API error: ' + err.message }, 500));
        }
      }, ${latency});
    });
  };

  // ── Preview badge ───────────────────────────────────────────────────────────
  ${showBadge ? `
  document.addEventListener('DOMContentLoaded', function() {
    var badge = document.createElement('div');
    badge.style.cssText = [
      'position:fixed', 'bottom:12px', 'right:12px',
      'background:#0f0a2e', 'color:#a78bfa',
      'font-size:11px', 'font-family:monospace',
      'padding:5px 12px', 'border-radius:99px',
      'border:1px solid #4c1d95', 'z-index:99999',
      'pointer-events:none', 'letter-spacing:.02em',
      'box-shadow:0 2px 8px rgba(0,0,0,.4)'
    ].join(';');
    badge.textContent = '⚡ Preview · Mock API';
    document.body.appendChild(badge);
  });` : ''}

})();
`
}