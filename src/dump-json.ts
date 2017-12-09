
export function dumpJSON(data:any) {

  const seen: Set<any> = new Set();

  function debugReplacer(key:any, val:any) {
    if (typeof(val) === 'object' && val !== null) {
      if (seen.has(val)) {
        // duplicate reference to object.
        const ref = val['@id'] || 'ref';
        return '#'+ref;
      }
      seen.add(val);
    }
    if (val instanceof Map || val instanceof Set) {
      // encode these as an array (of arrays for maps)
      return [...val];
    }
    return val;
  }

  return JSON.stringify(data, debugReplacer, 2);
}
