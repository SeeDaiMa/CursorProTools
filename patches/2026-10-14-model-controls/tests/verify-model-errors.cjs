const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../build/model-errors'));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const baseline = process.argv.includes('--baseline');
const source = read(baseline ? 'agents-original.js' : 'agents-patched.js');
const between = (start, end) => {
  const i = source.indexOf(start);
  assert.notEqual(i, -1, start);
  const j = source.indexOf(end, i + start.length);
  assert.notEqual(j, -1, end);
  return source.slice(i, j);
};
const extract = (prefix, suffix) => between(prefix, suffix).slice(prefix.length);

// Evaluate the actual owning model, native dismissal, composer render and
// submission functions. Services and rendering hooks are inert adapters.
let snapshot;
const effects = { dismiss: 0, cache: 0, submit: 0, history: 0, draft: 0 };
const prompt = {
  isPolledLimitHitHardBlock: false, access: { isReadOnly: false },
  container: {}, mode: 'agent', baseProps: {}, followupLocked: false,
  placeholder: 'Follow up', renderStatusArea: () => null,
  clearUsageLimitForRetry() { effects.cache++; this.isPolledLimitHitHardBlock = false; },
};
let polled = false;
const usage = { autoSwitchNoticeComposerId: () => undefined,
  clearCachedData() { effects.cache++; polled = false; } };
const composer = { composerId: 'self-owned-fixture', data: { fullConversationHeadersOnly: [] },
  setData(key, value) {
    assert.equal(key, 'submitErrorDetails');
    assert.equal(value, undefined);
    effects.dismiss++;
    snapshot = null;
  },
};
const element = (type, props) => ({ type, props });
const services = {
  Os: { membershipType: () => 'pro' }, Gz: usage,
  jr: { getExperimentParam: () => 'control', checkFeatureGate: () => false },
  x2: { isModelDisabled: () => false },
};
const context = vm.createContext({
  Fo: Object.fromEntries(['ACCOUNT_CLOSED', 'BAD_MODEL_NAME', 'PRO_USER_ONLY', 'RATE_LIMITED',
    'RATE_LIMITED_CHANGEABLE', 'USAGE_PRICING_REQUIRED', 'USAGE_PRICING_REQUIRED_CHANGEABLE']
    .map((name) => [name, name])), us: { ENTERPRISE: 'enterprise' }, xs: { AI: 'ai' },
  Be: (_, token) => services[token] || {},
  Mc: (service, getter) => getter(service), Aik: () => snapshot,
  kus: () => ({ refreshProfile() {} }), N_s() {},
  Gat: (fn) => fn(), l2i: (fn) => fn,
  c2i: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  BPn: (n) => Array(n).fill(Symbol.for('react.memo_cache_sentinel')),
  Zd: () => false, Lik: () => ({}), Tik: () => [], Rik: () => [], Dik() {}, Mik() {},
  nfe: () => false, lja: 'fallback', cja: 'fallback detail', o_i: 'closed', a_i: 'closed detail',
  Owf: 'The model you chose is not available', Fwf: 'Choose a different model',
  X_f: () => ({ followup: { images: [] }, promptInput: prompt }),
  Gb: () => true, Ike: () => [false], APi: (fn) => fn(),
  sPi: {}, rDf: {}, iDf: {}, Uus: 'composer', dwk: 'bridge', Y5l: 'placeholder',
  MK: element, M1k: element, TPi: element,
  li: (...parts) => parts.filter(Boolean).join(' '), ztk: () => () => {},
  sr: () => ({ workspace: {} }), IC: 'chat', Nus: 'summarize',
  bqw: (value) => ({ current: value }), WNg: (callback) => callback, ZRr: () => true,
});
for (const name of ['Xn', 'ko', 'Os', 'gi', 'rp', 'IC', 'x2', 'Hm', 'v1', 'fb', 'cy', 'ia', 'Gz', 'jr', 'q4']) {
  context[name] = name;
}
context.Ore = 'limit-experiment';
vm.runInContext(read('native-error-helpers.js'), context, { timeout: 1000 });
vm.runInContext(between('function Oik(', 'function Lwf('), context, { timeout: 1000 });
vm.runInContext(between('function nja(', 'async function GCS('), context, { timeout: 1000 });
vm.runInContext(between('function Pik(', 'function Dik('), context, { timeout: 1000 });
vm.runInContext(between('function Lwf(', 'var Owf,Fwf'), context, { timeout: 1000 });
vm.runInContext(between('Bwf={visible:!1,title:', '}}});') + '};', context, { timeout: 1000 });
vm.runInContext(between('function B1k(', 'function U1k('), context, { timeout: 1000 });
vm.runInContext(between('function _qw(', 'var '), context, { timeout: 1000 });

const owner = () => context.Lwf({ composerDataHandle: composer, workspace: {}, triggerSubmit() {
  throw new Error('click must never retry a request');
} });
const load = ({ code = 'BAD_MODEL_NAME', title = 'Model unavailable', buttons = [], corrupted = false } = {}) => {
  const error = { error: code, details: { buttons, title } };
  snapshot = { error, title, detail: 'original model detail', displayMode: context.pCn(error), isCorrupted: corrupted };
};
const chrome = { pendingQuestionnaireState: {},
  handleFollowupSubmitWithTrayAnimationAndSkillNudgeReset: () => effects.submit++,
};
const chromeBlock = extract('dismiss' + (baseline ? 'UsageLimit' : 'InputError') + 'ForRetry:',
  baseline ? ',hasActiveHardBlockLimitHitBubble:' : ',hasActiveInputRetryableError:');
const followup = () => {
  context.Lx = owner();
  chrome.dismissInputErrorForRetry = chrome.dismissUsageLimitForRetry = vm.runInContext(chromeBlock, context);
  chrome.hasActiveInputRetryableError = context.Lx.visible && context.Lx.isInputRetryableError;
  chrome.hasActiveHardBlockLimitHitBubble = context.Lx.visible && context.Lx.isHardBlockLimitHitBubble;
  return context.B1k({ chrome, isActiveSurface: true }).props.children.find((x) => x?.type === 'composer').props;
};
const initialBlock = extract('A6=ve||She.visible&&', ',Ebe=');
const initialProps = extract('images:ih,isDragging:Cj,clearOnReadOnly:!1,', ',isMentionItemsLoading:Yb,');
const initial = () => {
  context.She = owner(); context.ve = polled; context.ue = usage;
  context.A6 = !!(polled || vm.runInContext('She.visible&&' + initialBlock, context));
  return vm.runInContext('({' + initialProps + '})', context);
};
const blocked = { current: false };
const submit = context._qw({ agentRef: { composerDataHandle: composer },
  promptInputRef: { current: { editor: {} } }, promptSuggestionRef: { current: null },
  acceptSuggestion: async () => ({ segments: [] }), clearLocally: () => effects.draft++,
  promptHistory: { recordPrompt: () => effects.history++ }, onSubmit: () => effects.submit++,
  submissionBlockedRef: blocked,
});
const draft = { hasText: true, hasMentions: false, commands: [], text: 'preserve this draft' };
const totals = () => ({ ...effects });

load({ code: 'RATE_LIMITED', buttons: [{ action: { case: 'upgrade' } }] });
assert.equal(initial().isReadOnly, false, 'new-chat limit must allow clicking and editing the draft');

// These categories are produced by native parsed facts, plus the one exact
// server title provided in the user's screenshot. Generic/admin errors stay out.
const cases = [
  { code: 'BAD_MODEL_NAME' },
  { code: 'ERROR_BAD_MODEL_NAME' },
  { code: 'RATE_LIMITED', buttons: [{ action: { case: 'switchModel' } }] },
  { code: 'PRO_USER_ONLY', title: 'Named models unavailable' },
  { code: 'RATE_LIMITED', buttons: [{ action: { case: 'upgrade' } }] },
];
for (const test of cases) {
  for (const surface of [followup, initial]) {
    load(test);
    assert.equal(owner().isInputRetryableError, true, `owner recognizes ${test.code}/${test.title || ''}`);
    const props = surface();
    assert.equal(props.isReadOnly, false, 'error leaves draft editable');
    assert.equal(props.isSubmitBlocked, true, 'error initially blocks manual submit');
    blocked.current = props.isSubmitBlocked;
    const isUsageError = owner().isHardBlockLimitHitBubble;
    const before = totals(); submit.handleSubmitWithHistory(draft);
    assert.deepEqual(totals(), before, 'blocked submit preserves draft and history');
    props.onInputRetry();
    assert.equal(snapshot, null, 'native owner clears the current error');
    assert.equal(effects.submit, before.submit, 'click does not send');
    assert.equal(effects.history, before.history, 'click does not record history');
    assert.equal(effects.draft, before.draft, 'click does not clear draft');
    if (!isUsageError) assert.equal(effects.cache, before.cache, 'model-only click preserves quota cache');
    const next = surface();
    assert.equal(next.isSubmitBlocked, false, 'manual submit available after dismissal');
    blocked.current = next.isSubmitBlocked;
    submit.handleSubmitWithHistory(draft);
    assert.equal(effects.submit, before.submit + 1);
    load(test);
    assert.equal(surface().isSubmitBlocked, true, 'fresh backend error blocks again');
  }
}
load({ code: 'BAD_MODEL_NAME', corrupted: true });
assert.equal(owner().isInputRetryableError, false, 'corrupt conversation has no dismiss authority');
load({ code: 'MODEL_BLOCKED' });
assert.equal(owner().isInputRetryableError, false, 'admin model restriction stays outside retry classification');
load({ code: 'PRO_USER_ONLY', title: 'Read-only cloud composer' });
assert.equal(owner().isInputRetryableError, false, 'unrelated permissions remain unchanged');
load({ code: 'TIMEOUT', title: 'Connection Error' });
assert.equal(owner().isInputRetryableError, false, 'network error is not model/quota error');
snapshot = null;
assert.equal(owner().isInputRetryableError, false, 'empty owner has explicit false');

// Poll-only HARD_BLOCK still uses its own cache owner. Model-only dismissals
// above never touched the quota cache; the followup quota case cleared once.
assert.equal(effects.cache, 1);
polled = true;
assert.equal(initial().isSubmitBlocked, true);
initial().onInputRetry();
assert.equal(polled, false); assert.equal(effects.cache, 2);
prompt.isPolledLimitHitHardBlock = true;
followup().onInputRetry();
assert.equal(prompt.isPolledLimitHitHardBlock, false); assert.equal(effects.cache, 3);

// Existing read-only access has priority over model retry in followup surfaces.
load(); prompt.access.isReadOnly = true;
const before = totals();
assert.equal(followup().isReadOnly, true); followup().onInputRetry();
assert.deepEqual(totals(), before);
prompt.access.isReadOnly = false;

// Actual shared editor listener uses a fresh callback and owns cleanup.
const dom = new EventTarget(), toolbar = new EventTarget();
let cleanup;
const retryRef = { current: initial().onInputRetry };
Object.assign(context, { mn: { view: { dom } }, retryLimitOnInputRef: retryRef,
  vve: (callback) => { cleanup = callback(); },
});
vm.runInContext(read('input-listener.js'), context, { timeout: 1000 });
const beforeListener = effects.dismiss;
toolbar.dispatchEvent(new Event('pointerdown')); assert.equal(effects.dismiss, beforeListener);
dom.dispatchEvent(new Event('pointerdown')); assert.equal(effects.dismiss, beforeListener + 1);
load({ code: 'PRO_USER_ONLY', title: 'Named models unavailable' });
retryRef.current = followup().onInputRetry;
dom.dispatchEvent(new Event('pointerdown')); assert.equal(effects.dismiss, beforeListener + 2);
load(); retryRef.current = initial().onInputRetry; cleanup();
dom.dispatchEvent(new Event('pointerdown')); assert.equal(effects.dismiss, beforeListener + 2);

console.log(JSON.stringify({ controlled_replay: 'passed', native_model_cases: cases.length,
  surfaces: ['new chat', 'followup'], behavior: ['draft retained', 'click dismisses without sending',
    'manual submit after dismissal', 'fresh error blocks again', 'quota cache owned separately',
    'unrelated permission and corrupted states preserved', 'listener cleanup'],
  live_Cursor_and_backend: 'not verified' }));
