import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/profile');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const sources = Object.fromEntries(['original', 'patched'].map(name => {
  const bytes = readFileSync(path.join(directory, `${name}.js`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest[`${name}Sha256`]);
  const source = bytes.toString('utf8');
  const start = source.indexOf('function UMg({children:t})');
  const end = source.indexOf('var rbl,sbl,obl=', start);
  assert(start >= 0 && end > start);
  return [name, source.slice(start, end)];
}));
const before = readFileSync(path.join(directory, 'original.js'), 'utf8');
const after = readFileSync(path.join(directory, 'patched.js'), 'utf8');
assert.equal(after, before.replace(manifest.change.before, manifest.change.after));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(source) {
  const states = [], callbacks = [], refs = [], emailRequests = [], profileRequests = [];
  let authenticated = true;
  const account = {
    getCachedAccountProfile: () => undefined,
    isAuthenticated: () => authenticated,
    getEmailAndSignUpType: () => {
      const request = deferred();
      emailRequests.push(request);
      return request.promise;
    },
  };
  const context = {
    sr: () => ({ workspace: {} }),
    Be: (_workspace, service) => service === 'account' ? account : { applicationUserPersistentStorage: {} },
    Os: 'account', ia: 'storage', W3t: {},
    ibl: fn => fn(),
    Bot: initial => {
      const index = states.length;
      states.push(typeof initial === 'function' ? initial() : initial);
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    AGt: initial => { const ref = { current: initial }; refs.push(ref); return ref; },
    HTn: fn => { callbacks.push(fn); return fn; },
    lBe: () => ({}), URe: () => false, TWw: () => '',
    AWw: () => {}, // No runtime subscriptions, login actions, or initial effect.
    aEi: {},
    Uml: () => { const request = deferred(); profileRequests.push(request); return request.promise; },
    s_i: error => error?.kind === 'account_closed',
    CWw: profile => Boolean(profile?.authId),
    EWw: ({ hasResolvedProfile }) => !hasResolvedProfile,
    BMg: (_provider, props) => props,
    rbl: { Provider: {} }, sbl: { Provider: {} },
    UTg: 'Account', Gxg: () => '', Zdl: () => '', ugu: text => text,
  };
  vm.runInNewContext(`${source}; UMg({children:null});`, context, { timeout: 1000 });
  assert.equal(callbacks.length, 6);
  assert.equal(states.length, 9);
  return { states, refresh: callbacks[4], emailRequests, profileRequests, setAuthenticated: value => { authenticated = value; } };
}

async function ordinaryFailure(source) {
  const f = fixture(source);
  const completion = f.refresh();
  assert.equal(f.states[8], true);
  f.profileRequests[0].reject(new Error('mock profile transport failure'));
  await tick();
  const pendingBeforeEmailResolved = f.states[8];
  f.emailRequests[0].resolve({ email: '  fallback@example.invalid  ' });
  await completion;
  return { pendingBeforeEmailResolved, pendingAfter: f.states[8], fallback: f.states[2] };
}

async function identitySwitchWhileFallbackPending() {
  const f = fixture(sources.patched);
  const oldRequest = f.refresh();
  f.profileRequests[0].reject(new Error('mock ordinary failure'));
  await tick();
  assert.equal(f.states[8], false);
  const newRequest = f.refresh({ includeMobileAppStatus: true });
  f.profileRequests[1].resolve({ authId: 'mock-new-identity', displayName: 'New account', email: 'new@example.invalid' });
  f.emailRequests[1].resolve({ email: 'new@example.invalid' });
  await newRequest;
  f.emailRequests[0].resolve({ email: 'old@example.invalid' });
  await oldRequest;
  assert.equal(f.states[2], 'new@example.invalid');
  assert.equal(f.states[0], 'New account');
  assert.equal(f.states[3], 'mock-new-identity');
  assert.equal(f.states[8], false);
}

async function staleProfileFailureDoesNotOverwrite() {
  const f = fixture(sources.patched);
  const oldRequest = f.refresh();
  const newRequest = f.refresh({ includeMobileAppStatus: true });
  f.profileRequests[1].resolve({ authId: 'mock-current-identity', displayName: 'Current account', email: 'current@example.invalid' });
  f.emailRequests[1].resolve({ email: 'current@example.invalid' });
  await newRequest;
  f.profileRequests[0].reject(new Error('mock stale failure'));
  f.emailRequests[0].resolve({ email: 'old@example.invalid' });
  await oldRequest;
  assert.equal(f.states[2], 'current@example.invalid');
  assert.equal(f.states[0], 'Current account');
  assert.equal(f.states[8], false);
}

async function accountClosedIsPreserved(source) {
  const f = fixture(source);
  const completion = f.refresh();
  f.profileRequests[0].reject({ kind: 'account_closed' });
  f.emailRequests[0].resolve({ email: 'closed@example.invalid' });
  await completion;
  assert.equal(f.states[7], true);
  assert.equal(f.states[8], false);
  assert.equal(f.states[2], '');
}

async function logoutBeforeFailureDoesNotApplyFallback() {
  const f = fixture(sources.patched);
  const completion = f.refresh();
  f.setAuthenticated(false);
  f.profileRequests[0].reject(new Error('mock failure after logout'));
  f.emailRequests[0].resolve({ email: 'old@example.invalid' });
  await completion;
  assert.equal(f.states[2], '');
}

const baseline = await ordinaryFailure(sources.original);
assert.deepEqual(baseline, { pendingBeforeEmailResolved: true, pendingAfter: true, fallback: '' });
const repaired = await ordinaryFailure(sources.patched);
assert.deepEqual(repaired, { pendingBeforeEmailResolved: false, pendingAfter: false, fallback: 'fallback@example.invalid' });
await identitySwitchWhileFallbackPending();
await staleProfileFailureDoesNotOverwrite();
await accountClosedIsPreserved(sources.original);
await accountClosedIsPreserved(sources.patched);
await logoutBeforeFailureDoesNotApplyFallback();
const result = {
  success: true,
  executedFunction: 'UMg extracted directly from original.js and patched.js',
  assertions: [
    'Original ordinary failure reproduces pending=true with unused email fallback.',
    'Patched ordinary failure ends Loading before email promise resolves and applies the trimmed fallback.',
    'Identity switch while old fallback awaits email does not overwrite current identity or fallback.',
    'Stale profile failure after new profile success does not overwrite current state.',
    'account_closed behavior is preserved in original and patched functions.',
    'Logout before ordinary failure prevents old email fallback.',
    'Bundle difference is exactly one manifest replacement; hashes match.',
  ],
  limitations: [
    'Controlled mock of React hooks and account services; no real Cursor renderer or remote service execution.',
    'No application installation, UI, login, account data, LIMIT logic, or Editor behavior changed.',
  ],
};
writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
