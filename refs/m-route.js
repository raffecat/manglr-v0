// desirable to have the rtl fetch the location once and parse it into bits,
// then run all of the binders against that parsed value (@@location)

function parseQS(qs, terms, pre) {
  let args = qs.split('&');
  for (let i=0; i<args.length; i++) {
    let arg = args[i], n = arg.indexOf('=');
    if (n >= 0) {
      let name = JSON.stringify(arg.substr(0,n));
      let val = JSON.stringify(arg.substr(n+1));
      terms.push(pre+'['+name+']=='+val); // argument has value.
    } else if (arg) {
      terms.push(pre+'['+JSON.stringify(arg)+']'); // has argument.
    }
  }
}

// This uses a VM API to write compile-time executed javascript.

manglr.attr['m-route'] = function (vm, value) {
  vm.include('./rtl/router.js');
  let [_, path, qs, hash, hashqs] = /^([^?#]*)(?:\?([^#]*))(?:#([^?]*)(?:\?(.*)))$/.exec(value);
  let terms = [];
  if (path) {
    // test that the path prefix matches.
    terms.push('L.p.substr(0,'+path.length+')=='+JSON.stringify(path));
  }
  if (qs) {
    parseQS(qs, terms, 'L.q'); // ?foo=bar -> L.q['foo']=='bar'
  }
  if (hash) {
    // test that the hash prefix matches.
    terms.push('L.h.substr(0,'+hash.length+')=='+JSON.stringify(hash));
  }
  if (hashqs) {
    // match against query-params of the hash-part.
    parseQS(hashqs, terms, 'L.hq'); // #xyz?foo=bar -> L.hq['foo']=='bar'
  }
  return vm.bind('@@location','L').cond(terms.join('&&'));
}

// router.js

(function(m){
  var loc = m.global('@@location');
  var last = '';

  function hashChanged() {
    if (window.location.href != last) {
      last = window.location.href;
      loc.set({
        path: window.location.pathname,
        qs: window.location.query,
        hash: window.location.hash
      });
      m.push();
    }
  }

  m.on(window,'hashchange',hashChanged);
  m.onLoad(hashChanged);

})(manglr);
