const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../build/max-visibility'));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const baseline = process.argv.includes('--baseline');
const picker = read(baseline ? 'picker-original.js' : 'picker-patched.js');
const extract = (prefix, suffix) => {
  const start = picker.indexOf(prefix);
  assert.notEqual(start, -1, prefix);
  const end = picker.indexOf(suffix, start + prefix.length);
  assert.notEqual(end, -1, suffix);
  return picker.slice(start + prefix.length, end);
};
const expressions = {
  effective: extract('kn=', ',an='),
  badge: extract('an=', ',An='),
  confirm: extract('In=', ',hi='),
  policy: extract('hi=', ',er='),
  write: extract('const Ne=', ',Ue='),
  toggle: extract('const Dn=', ',Tn='),
};
let model = { modelName: 'composer-2.5', maxMode: true,
  selectedModels: [{ modelId: 'composer-2.5', parameters: [{ id: 'fast', value: 'true' }] }] };
let writes = 0, interactions = 0;
const state = { maxMode: true };
const context = vm.createContext({
  C8: (callback) => callback(), gve: (callback) => callback,
  Me: () => model, G: true, r: false, ge: false, Ve: false, ue: false,
  e: 0, pc: { localMode: false }, W: { hasAcceptedMaxModeConfirmation: true },
  AMm: 'MAX is required for this runtime',
  yP: () => ({ state, setMaxMode: (next) => context.toggle(next),
    areNamedModelsDisabled: false, maxModeToggleDisabled: context.policy.toggle.kind === 'disabled',
    maxModeToggleDisabledTooltip: context.policy.toggle.maxModeToggleDisabledTooltip,
    displayConfiguration: {}, onInteraction: () => interactions++ }),
  wea: (length) => Array(length).fill(Symbol.for('react.memo_cache_sentinel')),
  zIr: (length) => Array(length).fill(Symbol.for('react.memo_cache_sentinel')),
  aO: (type, props) => ({ type, props }), Y9t: (type, props) => ({ type, props }),
  Cea: (type, props) => ({ type, props }), Ti: { SwitchItem: 'switch', SearchInput: 'search' },
  qIr: [], Zmh: () => false, CG_: () => false, lIr: () => false,
  xea: 'controls', Kfh: 'auto', Gfh: 'multi', KK_: 'other', Wfh: 'models', dea: 'separator', Eea: 'menu',
  j: {}, B: {}, U: {}, t: { header: { id: 'owned-fixture' } }, O: { data: {} },
  Uot: () => context.Ve,
  l: { setModelConfigForComposer(owner, update, surface, options) {
    assert.equal(owner, context.O);
    assert.deepEqual(Object.keys(update), ['maxMode']);
    assert.equal(options.updateGlobalConfig, true);
    assert.equal(surface, context.Ve ? 'background-composer' : undefined);
    model = { ...model, maxMode: update.maxMode }; state.maxMode = update.maxMode; writes++;
  } },
});
vm.runInContext(read('native-max-policy.js'), context);
vm.runInContext(read('native-max-switch.js'), context);
vm.runInContext(read('native-menu.js'), context);
context.Ne = vm.runInContext(expressions.write, context);
const refresh = () => {
  context.kn = vm.runInContext(expressions.effective, context);
  context.badge = vm.runInContext(expressions.badge, context);
  context.In = vm.runInContext(expressions.confirm, context);
  context.policy = vm.runInContext(expressions.policy, context);
  context.toggle = vm.runInContext(expressions.toggle, context);
  state.maxMode = context.kn;
};
const menu = () => context.qQ_({ hideMaxToggle: context.policy.hideMaxToggle,
  hideAutoToggle: true, hideMultiModelToggle: true, hideSearchBar: true });

// Native owner expressions drive the actual menu and switch component.
// Token-based pricing and an off badge experiment cannot conceal saved MAX.
refresh();
assert.equal(context.policy.hideMaxToggle, false, 'MAX control must be visible for token-based pricing');
assert.equal(context.badge, true, 'active MAX must have a visible badge');
assert.equal(writes, 0, 'rendering never changes saved mode');
assert(menu().props.children.some((node) => node?.type === context.qfh));
let toggle = context.qfh();
assert.equal(toggle.props.label, 'MAX Mode');
assert.equal(toggle.props.checked, true);
assert.equal(toggle.props.disabled, false);
const initialSelection = JSON.stringify(model.selectedModels);
toggle.props.onChange(); refresh();
assert.equal(model.maxMode, false);
assert.equal(context.badge, false);
assert.equal(context.qfh().props.checked, false);
assert.equal(JSON.stringify(model.selectedModels), initialSelection, 'fast parameter and model retained');
assert.equal(writes, 1); assert.equal(interactions, 1);

// Turning on MAX still uses native confirmation policy.
context.W.hasAcceptedMaxModeConfirmation = false; refresh();
assert.equal(context.In, true);
assert.equal(context.policy.maxModeActionMode, 'deferred');
context.W.hasAcceptedMaxModeConfirmation = true; refresh();
assert.equal(context.policy.maxModeActionMode, 'immediate');
context.qfh().props.onChange(); refresh();
assert.equal(model.maxMode, true); assert.equal(context.badge, true); assert.equal(writes, 2);

// Native background/runtime requirements remain enforced, with a visible
// disabled control rather than changing request policy.
context.Ve = true; refresh();
assert.equal(context.policy.hideMaxToggle, false);
assert.equal(context.policy.toggle.kind, 'disabled');
assert.equal(context.qfh().props.disabled, true);
context.qfh().props.onChange(); assert.equal(writes, 2);
context.toggle(false); assert.equal(writes, 2);
context.Ve = false; context.ge = true; refresh();
assert.equal(context.policy.hideMaxToggle, true);
context.toggle(false); assert.equal(writes, 2);
context.ge = false; context.pc.localMode = true; refresh();
assert.equal(context.policy.hideMaxToggle, true);

console.log(JSON.stringify({ controlled_replay: 'passed', native_components: ['menu', 'MAX switch'],
  behavior: ['visible token-pricing MAX control', 'badge follows effective state',
    'render preserves saved value', 'native off/on persists only maxMode',
    'model and Fast parameter retained', 'confirmation retained', 'runtime requirements retained'],
  live_Cursor: 'not verified' }));
