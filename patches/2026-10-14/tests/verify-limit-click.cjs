const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, '../build/limit-click', name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const extract = (text, prefix, suffix) => text.split(prefix)[1].split(suffix)[0];
const nativeDismissCallback = extract(manifest.changes.at(-1).new,
  'dismissUsageLimitForRetry:', ',hasActiveHardBlockLimitHitBubble:');
const cacheClearCallback = extract(manifest.changes.at(-2).new,
  'clearUsageLimitForRetry:', ',lockedPlaceholder:');

// Exact extracted app functions run with inert component and service adapters.
// This does not attach to Cursor, evaluate its bundle or issue network requests.
const effects = { dismiss: 0, cache: 0, submit: 0, history: 0, clearDraft: 0 };
const prompt = {
  isPolledLimitHitHardBlock: true, access: { isReadOnly: false },
  container: {}, mode: 'agent', baseProps: {}, followupLocked: false,
  renderStatusArea: () => null,
};
const errorCard = {
  visible: true, isHardBlockLimitHitBubble: true,
  onDismiss() {
    effects.dismiss++;
    this.visible = false;
    chrome.hasActiveHardBlockLimitHitBubble = false;
  },
};
const chrome = {
  hasActiveHardBlockLimitHitBubble: true, pendingQuestionnaireState: {},
  handleFollowupSubmitWithTrayAnimationAndSkillNudgeReset: () => effects.submit++,
};
const usageState = { clearCachedData() { effects.cache++; prompt.isPolledLimitHitHardBlock = false; } };
const element = (type, props) => ({ type, props });
const context = vm.createContext({
  X_f: () => ({ followup: { images: [] }, promptInput: prompt }),
  Gb: () => true, Ike: () => [false], APi: (f) => f(),
  sPi: {}, rDf: {}, iDf: {}, Uus: 'composer', dwk: 'bridge', Y5l: 'placeholder',
  MK: element, M1k: element, TPi: element,
  li: (...parts) => parts.filter(Boolean).join(' '), ztk: () => () => {},
  Lx: errorCard, q: usageState,
  sr: () => ({ workspace: {} }), IC: 'chat', Nus: 'summarize',
  Be: () => ({ triggerManualSummarization: () => { throw new Error('unexpected summarization'); } }),
  bqw: (value) => ({ current: value }), WNg: (callback) => callback, ZRr: () => true,
});
chrome.dismissUsageLimitForRetry = vm.runInContext(nativeDismissCallback, context);
prompt.clearUsageLimitForRetry = vm.runInContext(cacheClearCallback, context);
vm.runInContext(read('followup-render-patched.js'), context, { timeout: 1000 });
vm.runInContext(read('submit-patched.js'), context, { timeout: 1000 });
const props = () => context.B1k({ chrome, isActiveSurface: true, keyboardBridgeEnabled: false })
  .props.children.find((row) => row?.type === 'composer').props;
const blocked = { current: props().isSubmitBlocked };
const submitApi = context._qw({
  agentRef: { composerDataHandle: {} },
  promptInputRef: { current: { editor: {}, clear: () => effects.clearDraft++ } },
  promptSuggestionRef: { current: null }, acceptSuggestion: async () => ({ segments: [] }),
  clearLocally: () => effects.clearDraft++, promptHistory: { recordPrompt: () => effects.history++ },
  onSubmit: () => effects.submit++, submissionBlockedRef: blocked,
});
const draft = { hasText: true, commands: [], text: 'keep draft until sending', hasMentions: false };
submitApi.handleSubmitWithHistory(draft);
assert.deepEqual(effects, { dismiss: 0, cache: 0, submit: 0, history: 0, clearDraft: 0 });

const editorDom = new EventTarget();
const toolbarDom = new EventTarget();
let cleanup;
const retryRef = { current: props().onInputRetry };
Object.assign(context, {
  mn: { view: { dom: editorDom } }, retryLimitOnInputRef: retryRef,
  vve: (callback) => { cleanup = callback(); },
});
vm.runInContext(read('input-listener-patched.js'), context, { timeout: 1000 });
toolbarDom.dispatchEvent(new Event('pointerdown'));
assert.equal(effects.dismiss, 0);
editorDom.dispatchEvent(new Event('pointerdown'));
assert.deepEqual(effects, { dismiss: 1, cache: 1, submit: 0, history: 0, clearDraft: 0 });
assert.equal(errorCard.visible, false);
assert.equal(props().isReadOnly, false);
assert.equal(props().isSubmitBlocked, false);

blocked.current = props().isSubmitBlocked;
retryRef.current = props().onInputRetry;
submitApi.handleSubmitWithHistory(draft);
assert.deepEqual(effects, { dismiss: 1, cache: 1, submit: 1, history: 1, clearDraft: 1 });

// A subsequent backend LIMIT is represented by a new active error/status.
// No permanent override survives: the current submit callback blocks again.
errorCard.visible = true;
chrome.hasActiveHardBlockLimitHitBubble = true;
prompt.isPolledLimitHitHardBlock = true;
blocked.current = props().isSubmitBlocked;
retryRef.current = props().onInputRetry;
assert.equal(blocked.current, true);
submitApi.handleSubmitWithHistory(draft);
assert.equal(effects.submit, 1);
editorDom.dispatchEvent(new Event('pointerdown'));
assert.equal(effects.dismiss, 2);
assert.equal(effects.cache, 2);

// Other readonly ownership conditions cannot be cleared by this action.
chrome.hasActiveHardBlockLimitHitBubble = true;
prompt.access.isReadOnly = true;
retryRef.current = props().onInputRetry;
assert.equal(props().isReadOnly, true);
editorDom.dispatchEvent(new Event('pointerdown'));
assert.equal(effects.dismiss, 2);
assert.equal(effects.cache, 2);

// The actual editor owns the listener and releases it when disposed.
prompt.access.isReadOnly = false;
retryRef.current = props().onInputRetry;
cleanup();
editorDom.dispatchEvent(new Event('pointerdown'));
assert.equal(effects.dismiss, 2);
console.log(JSON.stringify({ controlled_replay: 'passed', coverage: [
  'LIMIT blocks submit before clicking',
  'editor click dismisses local error and clears local status without sending',
  'manual submit becomes available after the state clears',
  'a fresh LIMIT blocks again',
  'toolbar clicks and unrelated readonly states do not dismiss LIMIT',
  'editor listener cleanup prevents retained callbacks',
], live_Cursor_and_backend: 'not verified' }));
