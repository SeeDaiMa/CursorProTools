const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Controlled replay of two exact extracted app functions with inert adapters.
// No Cursor process, DOM, transport, account or injected watcher is executed.
const read = (name) => fs.readFileSync(path.join(__dirname, '../build/limit-input', name), 'utf8');

function followupProps(file, { polled = false, bubble = false, readOnly = false } = {}) {
  const submit = () => {};
  const prompt = {
    isPolledLimitHitHardBlock: polled,
    access: { isReadOnly: readOnly },
    container: {}, mode: 'agent', baseProps: {}, followupLocked: false,
    renderStatusArea: () => null,
  };
  const chrome = {
    hasActiveHardBlockLimitHitBubble: bubble,
    pendingQuestionnaireState: {},
    handleFollowupSubmitWithTrayAnimationAndSkillNudgeReset: submit,
  };
  const element = (type, props) => ({ type, props });
  const context = vm.createContext({
    X_f: () => ({ followup: { images: [] }, promptInput: prompt }),
    Gb: () => true, Ike: () => [false], APi: (f) => f(),
    sPi: {}, rDf: {}, iDf: {}, Uus: 'composer', dwk: 'bridge', Y5l: 'placeholder',
    MK: element, M1k: element, TPi: element,
    li: (...parts) => parts.filter(Boolean).join(' '), ztk: () => () => {},
  });
  vm.runInContext(read(file), context, { timeout: 1000 });
  const tree = context.B1k({ chrome, isActiveSurface: true, keyboardBridgeEnabled: false });
  return tree.props.children.find((row) => row?.type === 'composer').props;
}

// The real producing render previously coupled usage status to editor access.
assert.equal(followupProps('followup-render-original.js', { bubble: true }).isReadOnly, true);
for (const fixture of [{ bubble: true }, { polled: true }, { bubble: true, polled: true }]) {
  const props = followupProps('followup-render-patched.js', fixture);
  assert.equal(props.isReadOnly, false);
  assert.equal(props.isSubmitBlocked, true);
}
assert.equal(followupProps('followup-render-patched.js', { readOnly: true }).isReadOnly, true);
assert.equal(followupProps('followup-render-patched.js').isSubmitBlocked, false);

const effects = { submit: 0, history: 0, clear: 0, summarize: 0 };
const context = vm.createContext({
  sr: () => ({ workspace: {} }), IC: 'chat', Nus: 'summarize',
  Be: () => ({ triggerManualSummarization: () => effects.summarize++ }),
  bqw: (value) => ({ current: value }), WNg: (callback) => callback, ZRr: () => true,
});
vm.runInContext(read('submit-patched.js'), context, { timeout: 1000 });
const blocked = { current: true };
const api = context._qw({
  agentRef: { composerDataHandle: {} },
  promptInputRef: { current: { editor: {}, clear: () => effects.clear++ } },
  promptSuggestionRef: { current: null }, acceptSuggestion: async () => ({ segments: [] }),
  clearLocally: () => effects.clear++, promptHistory: { recordPrompt: () => effects.history++ },
  onSubmit: () => effects.submit++, submissionBlockedRef: blocked,
});
const text = { hasText: true, commands: [], text: 'keep this draft', hasMentions: false };
api.handleSubmitWithHistory(text);
api.handleSubmitWithHistory({ hasText: false, commands: [{ id: 'summarize' }], text: '', hasMentions: false });
assert.deepEqual(effects, { submit: 0, history: 0, clear: 0, summarize: 0 });

// Existing callback sees a later policy change; it cannot stay blocked by a
// stale captured boolean. Normal history and submission behavior then resumes.
blocked.current = false;
api.handleSubmitWithHistory(text);
assert.deepEqual(effects, { submit: 1, history: 1, clear: 1, summarize: 0 });
blocked.current = true;
api.handleSubmitWithHistory(text);
assert.deepEqual(effects, { submit: 1, history: 1, clear: 1, summarize: 0 });
console.log(JSON.stringify({
  controlled_replay: 'passed',
  coverage: ['polled and error-bubble LIMIT preserve draft access',
    'inactive or otherwise readonly input remains readonly',
    'LIMIT blocks Enter, history, suggestion cleanup and summarization',
    'same callback resumes normal behavior when policy clears'],
  live_ui_and_backend: 'not verified',
}));
