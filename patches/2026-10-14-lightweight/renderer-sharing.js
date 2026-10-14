// IPC account snapshots consist of arrays and plain records. Preserve field
// presence, key order, NaN and signed zero when deciding whether to reuse data.
function cptAccountPayloadEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftPrototype = Object.getPrototypeOf(left);
  if (leftPrototype !== Object.getPrototypeOf(right)) return false;
  if (!Array.isArray(left) && leftPrototype !== Object.prototype && leftPrototype !== null) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !cptAccountPayloadEqual(left[key], right[key])) return false;
  }
  return true;
}

function cptReuseAccountSnapshot(previous, incoming) {
  const isPlainSnapshot = value => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const keys = Object.keys(value);
    if (keys.length !== value.length || Object.getOwnPropertySymbols(value).length) return false;
    const ids = new Set();
    for (let index = 0; index < value.length; index++) {
      const account = value[index];
      if (keys[index] !== String(index) || !account || typeof account.id !== "string" || ids.has(account.id)) return false;
      const prototype = Object.getPrototypeOf(account);
      if (prototype !== Object.prototype && prototype !== null) return false;
      ids.add(account.id);
    }
    return true;
  };
  if (!isPlainSnapshot(previous) || !isPlainSnapshot(incoming)) return incoming;
  if (cptAccountPayloadEqual(previous, incoming)) return previous;
  // Account IDs are the database primary key and the existing React row key.
  const previousById = new Map(previous.map(account => [account.id, account]));
  return incoming.map(account => {
    const old = previousById.get(account.id);
    return old && cptAccountPayloadEqual(old, account) ? old : account;
  });
}

const CptMemoAccountRow = reactExports.memo(AccountRow);
function CptStableAccountRow(props) {
  const committed = reactExports.useRef(props);
  reactExports.useLayoutEffect(() => { committed.current = props; });
  // Keep each row's callbacks stable while dispatching to the latest committed
  // handler. This keeps current selection/operation closures without remounts.
  const callbacks = reactExports.useMemo(() => {
    const result = {};
    for (const name of ["onToggleSelect", "onDelete", "onSwitch", "onRefresh", "onConvert", "onUpdateNickname", "onSeamlessSwitch", "onAiLogin"]) {
      result[name] = (...args) => {
        const handler = committed.current[name];
        return handler(...args);
      };
    }
    return result;
  }, []);
  const rowProps = { ...props };
  for (const name of Object.keys(callbacks)) {
    if (typeof props[name] === "function") rowProps[name] = callbacks[name];
  }
  return jsxRuntimeExports.jsx(CptMemoAccountRow, rowProps);
}
