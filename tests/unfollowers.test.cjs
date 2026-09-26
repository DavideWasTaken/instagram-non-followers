const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../unfollowers.js'), 'utf8');
const user = (id, username, extra = {}) => ({ pk: id, username, ...extra });
async function run(respond, options = {}) {
  const result = { requests: [], errors: [], logs: [], downloads: [], clipboard: [], tables: [], blobs: [] };
  const context = {
    location: { hostname: options.hostname || 'www.instagram.com', protocol: 'https:' },
    document: {
      cookie: options.cookie ?? 'ds_user_id=123',
      createElement: () => ({ click() { result.downloads.push(this.download); } }),
    },
    window: {},
    console: { log: (...args) => result.logs.push(args.join(' ')), warn() {}, error: (...args) => result.errors.push(args.join(' ')), table: rows => result.tables.push(rows) },
    alert: message => result.errors.push(message),
    navigator: { clipboard: { writeText: async text => {
      if (options.clipboardDenied) throw new Error('Clipboard denied');
      result.clipboard.push(text);
    } } },
    setTimeout: callback => { callback(); return 0; },
    clearTimeout() {},
    AbortSignal: { timeout: () => undefined },
    Blob,
    URL: { createObjectURL: blob => { result.blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    fetch: async (url, init) => {
      result.requests.push({ url, init });
      const reply = await respond(url, result.requests.length);
      return { ok: true, status: 200, json: async () => reply, ...reply.http };
    },
  };
  try { await vm.runInNewContext(source, context); }
  catch (error) { result.unhandled = error; }
  result.window = context.window;
  return result;
}
function stopped(result) {
  assert.equal(result.downloads.length, 0, 'must not export a partial/invalid comparison');
  assert.ok(result.errors.length, 'must explain why analysis stopped');
  assert.equal(result.unhandled, undefined, 'must handle the error');
}

test('rejects lookalike domains without making requests', async () => {
  const result = await run(() => ({ users: [] }), { hostname: 'fakeinstagram.com' });
  assert.equal(result.requests.length, 0);
  stopped(result);
});
test('requires a logged-in session', async () => {
  const result = await run(() => ({ users: [] }), { cookie: '' });
  stopped(result);
  assert.equal(result.requests.length, 0);
});
test('compares paginated lists by ID and exports verified accounts too', async () => {
  const result = await run(url => {
    if (url.includes('/followers/')) return { users: [user(1, 'renamed')] };
    if (url.includes('max_id=')) return { users: [user(3, 'verified', { is_verified: true })] };
    return { users: [user(1, 'oldname'), user(2, 'friend')], next_max_id: 'page two' };
  });
  assert.equal(result.downloads.length, 1);
  assert.equal(result.requests.length, 3);
  assert.ok(result.requests[1].url.includes('max_id=page%20two'));
  const csv = await result.blobs[0].text();
  assert.match(csv, /friend/);
  assert.match(csv, /verified/);
  assert.doesNotMatch(csv, /oldname|renamed/);
});
test('stops instead of exporting after the page limit', async () => {
  stopped(await run((url, n) => ({ users: [user(n, 'person')], next_max_id: String(n) })));
});
test('rejects a repeated cursor', async () => {
  const result = await run(() => ({ users: [], next_max_id: 'same' }));
  stopped(result);
  assert.ok(result.requests.length <= 2);
});
test('rejects an unexpected response instead of treating it as an empty list', async () => {
  stopped(await run(() => ({ status: 'fail', message: 'login_required' })));
});
test('rejects invalid users', async () => {
  stopped(await run(() => ({ users: [{ username: 'missing-id' }] })));
});
test('rejects a response promising more pages without a cursor', async () => {
  stopped(await run(() => ({ users: [], more_available: true })));
});
test('reports HTTP failures without exporting', async () => {
  stopped(await run(() => ({ http: { ok: false, status: 403 } })));
});
test('stops after bounded rate-limit retries', async () => {
  const result = await run(() => ({ http: { ok: false, status: 429 } }));
  stopped(result);
  assert.equal(result.requests.length, 7);
});
test('CSV escapes names and neutralizes spreadsheet formulas', async () => {
  const result = await run(url => ({ users: url.includes('/following/')
    ? [user(1, 'person', { full_name: '=HYPERLINK("example")' })] : [] }));
  assert.equal(result.downloads.length, 1);
  const csv = await result.blobs[0].text();
  assert.ok(csv.includes('"\'=HYPERLINK(""example"")"'));
});
test('prints a runnable fallback when clipboard access is denied', async () => {
  const result = await run(url => ({ users: url.includes('/following/') ? [user(1, 'person')] : [] }),
    { clipboardDenied: true });
  assert.equal(result.downloads.length, 1);
  const command = result.logs.find(line => line.startsWith('Copia manuale: ')).slice('Copia manuale: '.length);
  let copied;
  vm.runInNewContext(command, { copy: value => { copied = value; }, nonMiSeguono: ['alice', 'bob'] });
  assert.equal(copied, 'alice\nbob');
});
