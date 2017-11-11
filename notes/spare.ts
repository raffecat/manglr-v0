let nextId = 0; // for uid()
function uid() { nextId += 1; return 'm-'+nextId; }

function normWS(s) {
  return s.replace(/\s+/g, function (ws) { return ws.indexOf("\n") >= 0 ? "\n" : " " });
}

function encodeBinds(binds) {
  let res = '';
  for (let i=0, keys=Object.keys(binds); i<keys.length; i++) {
    const key = keys[i], val = binds[key];
    if (res) res += '; ';
    res = res + key + ':' + val.replace(/"/g,'&quot;');
  }
  return res;
}

function dummyTemplate() {
  return { tagName:'div', outTag:'div', params:{} }; // TODO: dummy empty template.
}
