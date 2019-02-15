!(function(){

// Character references are not represented in the DOM.
// The DOM Core represents all attribute values as simple strings.
// Read element.offsetTop to cause reflow.


// This scope is captured by all the bindings' scope.bind closures,
// so vars in this scope MUST NOT hold any DOM nodes.

var hasOwn = Object.prototype.hasOwnProperty;
function forEach(seq,fn) { for (var i=0,n=seq&&seq.length;i<n;i++) fn(seq[i]); }
function trim(s) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,''); }

var nextUid = 1, uid = function(){ return 'u'+(nextUid++) };

// note: what if the node contains a repeat/if scope?
function clearElem(node, c) { while (c=node.firstChild) node.removeChild(c); }

function addClass(elem, cls) {
    var seq = cls.split(' ');
    var clist = elem.classList;
    if (clist) {
        // classList is fast and avoids spurious reflows.
        for (var cls,i=0; i<seq.length; i++) {
            if (cls=seq[i]) clist.add(cls);
        }
    } else {
        var classes = ' '+elem.className+' ', org = classes;
        for (var cls,i=0; i<seq.length; i++) {
            if (cls=seq[i]) {
                cls = cls+' ';
                if (!~classes.indexOf(' '+cls)) {
                    classes += cls;
                }
            }
        }
        // avoid setting className unless we actually changed it.
        if (classes !== org) elem.className = classes.slice(1,-1);
        //if (classes !== org) console.log("addClass", cls, "->", elem.className);
    }
}
function removeClass(elem, cls) {
    var seq = cls.split(' ');
    var clist = elem.classList;
    if (clist) {
        // classList is fast and avoids spurious reflows.
        for (var cls,i=0; i<seq.length; i++) {
            if (cls=seq[i]) clist.remove(cls);
        }
    } else {
        var classes = ' '+elem.className+' ', org = classes;
        for (var cls,i=0;i<seq.length;i++) {
            if (cls=seq[i]) {
                cls = ' '+cls+' ';
                if (~classes.indexOf(cls)) {
                    classes = classes.replace(cls,' ');
                }
            }
        }
        // avoid setting className unless we actually changed it.
        if (classes !== org) elem.className = classes.slice(1,-1);
        //if (classes !== org) console.log("removeClass", cls, "->", elem.className);
    }
}

var testData = {};
var isJSON = new RegExp("^\\s*[{\\[]");
var dataParser = new RegExp("\\s*([^:;]+):\\s*('(?:[^'\\\\]*(?:\\\\.?|))*'?|[^;]*);?", "g");
var unescapeQuotes = new RegExp("\\\\'", "g");
var trimQuotes = new RegExp("^'|'$", "g");

// Quote  { Not-quote-or-slash-run  [Slash-[Any]] }  [Quote]

var bindings = {
    'testdata': function (node, expr, scope) {
      var name = node.getAttribute('name');
      if (!name) console.log("Testdata tag has no name:", node);
      var values = node.getAttribute('values');
      if (!values) values = node.innerText || node.textContent;
      if (!values) console.log("Testdata tag has no values:", node);
      // Remove text inside the testdata element so it is not rendered.
      // Do not remove Element (nodeType=1) in case the testdata tag is un-closed.
      while (node.firstChild && node.firstChild.nodeType !== 1) {
        node.removeChild(node.firstChild);
      }
      if (name && values) {
        if (isJSON.test(values)) {
          try {
            testData[name] = JSON.parse(trim(values));
            console.log("JSON", testData[name]);
          } catch (err) {
            console.log("Invalid JSON in testdata tag:", node, err.toString());
          }
        } else {
          // CSS-like key-value pairs.
          var obj = testData[name] = {};
          var match;
          while (match = dataParser.exec(values)) {
            if (match[1]) {
              obj[match[1]] = (match[2]||'').replace(unescapeQuotes,"'").replace(trimQuotes,"");
            }
            if (!dataParser.lastIndex) break;
          }
        }
      }
    },
    'show': function (node, expr, scope) {
        scope.bind(expr, function(value) {
            node.style.display = value ? '' : 'none';
        });
    },
    'if': function(node, expr, scope, bindNodes) {
        var inner, inst;
        // insert a marker in the DOM before the 'if' node.
        var marker = document.createComment('if');
        node.parentNode.insertBefore(marker, node);
        // move the original repeated node out of the document.
        var template = document.createDocumentFragment();
        template.appendChild(node);
        // watch the scope for expression changes.
        // holds strong refs to: marker, template, inner scope,
        // current dom instance, node, expr, scope, bindNodes.
        // when the scope is destroyed, these are released.
        scope.bind(expr, function(val) {
            //console.log("if", item, val, scope);
            if (val && !inner) {
                // create a scope for the conditional node.
                // FIXME: circular ref to scope here.
                inner = scope.clone();
                // make a deep clone of the template.
                inst = template.cloneNode(true);
                // apply bindings in the cloned node.
                bindNodes(inst, inner);
                // insert the clone into the document.
                marker.parentNode.insertBefore(inst, marker);
            } else if (!val && inner) {
                // remove subtree from the DOM.
                var outer = inst.parentNode;
                if (outer) outer.removeChild(outer);
                // unregister all scope bindings.
                inner.dest();
            }
        }, function () {
            // an enclosing scope is being destroyed, which means
            // this scope will be dropped and GC will collect it.
            // it also implies the enclosing scope will drop the DOM nodes.
        });
        return true; // take ownership: do not bind subtree.
    },
    'repeat': function(node, expr, scope, bindNodes) {
        var parts = expr.split(' in ');
        var alias = parts[0], expr = parts[1];
        // insert a marker in the DOM before the 'repeat' node.
        var marker = document.createComment('repeat');
        node.parentNode.insertBefore(marker, node);
        // move the original repeated node out of the document.
        var template = document.createDocumentFragment();
        template.appendChild(node);
        // watch the scope for expression changes.
        var scopeMap = {};
        scope.bind(expr, function(seq) {
            //console.log("repeat", item, seq, scope);
            var newIds = [];
            for (var i=0,n=seq&&seq.length;i<n;i++) {
                var val = seq[i];
                // look up the unique id for this item, which is stored
                // in a field of the item or is the value of the item.
                var inst, itemId;
                if (val && typeof val === 'object') {
                    itemId = val['$$hashKey'];
                    if (!itemId) {
                        val['$$hashKey'] = itemId = uid();
                        inst = null;
                    } else {
                        // the item already has an id.
                        // check if there is an instance in the doc.
                        // actually just look in the scope map?
                        inst = document.getElementById(itemId);
                    }
                    // these are the ids we'll keep.
                    newIds.push(itemId);
                }
                if (!inst) {
                    // create a scope for each repetition.
                    var bindings = {};
                    bindings[alias] = val;
                    var inner = scope.clone(bindings);
                    // make a deep clone of the template.
                    var inst = template.cloneNode(true);
                }
                // give each repeat clone a unique id so we can match
                // up existing clones with repeat items next time.
                var first = inst.firstChild;
                if (first) first.id = uid();
                // apply bindings in the cloned node.
                bindNodes(inst, inner);
                // insert the clone into the document.
                marker.parentNode.insertBefore(inst, marker);
            }
        });
        return true; // take ownership: do not bind subtree.
    }
};

function BindToDOM(element, model) {

    function bindListener(node, expr, scope) {
        scope.bind(expr, function(value) {
            node.setAttribute(name, value||'');
        });
    }

    function bind(node, scope) {
        var nodeType = node.nodeType;
        if (nodeType == 1) { // Element
            //console.log(nodeType, node.nodeName);
            // apply tag name bindings.
            var owned = false;
            var name = node.nodeName.toLowerCase();
            if (hasOwn.call(bindings, name)) {
                console.log("Element:", name);
                owned = owned || bindings[name](node, '', scope, bind);
            }
            // iterate over attributes and apply bindings.
            // do not cache length, in case bindings add attributes.
            var attrs = node.attributes;
            for (var i=0; i<attrs.length; i++) {
                var attr = attrs[i];
                if (attr.specified) {
                    var name = attr.name, value = attr.value;
                    if (hasOwn.call(bindings, name)) {
                        console.log(name, '->', value);
                        owned = owned || bindings[name](node, value, scope, bind);
                    } else {
                        if (value && value.indexOf('{') >= 0) {
                            console.log("Attribute:", name, value);
                        }
                    }
                }
            }
            // iterate over child nodes, unless the node has been
            // converted to a template.
            if (!owned) {
                var child = node.firstChild;
                while (child) {
                    // note that bindings can remove the node from the document,
                    // so advance to the next child before applying bindings.
                    var c = child;
                    child = child.nextSibling;
                    bind(c, scope);
                }
            }
        }
    }

    bind(element, model);

    // drop refs to avoid GC cycles, because 'bind' is captured
    // by some of the scope.watch closures.
    element = model = options = null;
}

// A bound text attribute is a template that contains {expressions}.
// An expression attribute is always parsed as a single expression.

// To bind a top-level name, 


// Scope
// Parses and binds expressions to the data model.
// This implementation supports only dot-path expressions.

function Scope(model) {
    var unbinds = [];
    function bind(expr, fn) {
        unbinds.push(PathObserver(model, expr, fn));
    }
    function clone(bindings) {
        var child = Scope(model, bindings);
        unbinds.push(child.dest);
        return child;
    }
    function dest() {
        for (var i=0; i<unbinds.length; i++) {
            unbinds[i]();
        }
        unbinds = null;
    }
    return {bind:bind, clone:clone, dest:dest};
}

// Model
// Contains key-value pairs.
// Values can be scalars, Models or Collections.
// Observe a key to be notified when it changes.
// Observers and values are strong references.

function Model(data) {
    if (!data) data = {};
    for (var key in data) {
      if (hasOwn.call(data, key)) {
        var val = data[key];
        if (typeof val === 'object') {
          if (val instanceof Array) {
            data[key] = Collection(val);
          } else {
            data[key] = Model(val);
          }
        }
      }
    }
    var observers = {};
    function get(key) {
        // avoid getting inherited properties.
        if (hasOwn.call(data, key))
            return data[key];
    }
    function set(key, val) {
        var old;
        if (hasOwn.call(data, key)) old = data[key];
        data[key] = val;
        // invariant: only push changes to observers when
        // the value has actually changed.
        if (val !== old) {
            var obs = observers[key];
            if (obs) {
                for (var i=0; i<obs.length; i++) {
                    obs[i](val);
                }
            }
        }
    }
    function observe(key, fn) {
        console.log("bind observer to", key);
        var obs = observers[key];
        if (!obs) observers[key] = [fn];
        else {
            // ensure not already in the array.
            for (var i=0; i<obs.length; i++) {
                if (obs[i] === fn) return false; // already subscribed.
            }
            obs.push(fn);
        }
        // push the current value to the new observer, even if the value
        // is undefined; this is an invariant that simplifies observers
        // by ensuring that they run at least once, and that they will be
        // updated if they're re-bound to a different Model or property.
        var val;
        if (hasOwn.call(data, key)) val = data[key];
        fn(val);
        return true; // did subscribe.
    }
    function unobserve(key, fn) {
        var obs = observers[key];
        if (obs) {
            // find and remove the observer if present.
            for (var i=0; i<obs.length; i++) {
                if (obs[i] === fn) {
                    obs.splice(i,1); // remove one element.
                    return true; // removed the observer.
                }
            }
        }
        return false; // was not subscribed.
    }
    return {get:get, set:set, observe:observe, unobserve:unobserve};
}

// Collection
// An ordered list of values.
// Values can be js values, Models or Collections.
// Observe the collection to be notified when its contents change.
// Observers and values are strong references.

function Collection(items) {
    if (!items) items = [];
    for (var i=0; i<items.length; i++) {
      var val = items[i];
      if (typeof val === 'object') {
        if (val instanceof Array) {
          items[i] = Collection(val);
        } else {
          items[i] = Model(val);
        }
      }
    }
    var observers = [];
    function push() {
        // append one or more items to the collection.
        for (var i=0; i<arguments.length; i++) {
          var val = arguments[i];
          if (typeof val === 'object') {
            if (val instanceof Array) {
              val = Collection(val);
            } else {
              val = Model(val);
            }
          }
          items[items.length] = val;
        }
        notify();
    }
    function pop() {
        // remove and return the last item in the collection.
        if (items.length) {
            var last = items.pop();
            notify();
            return last;
        }
    }
    function remove(val) {
        // remove the first occurrence of val from the collection.
        for (var i=0; i<items.length; i++) {
            if (items[i] === val) {
                items.splice(i,1); // remove one element.
                notify();
                return;
            }
        }
    }
    function notify() {
        for (var i=0; i<observers.length; i++) {
            observers[i](items);
        }
    }
    function observe(fn) {
        // ensure not already in the array.
        for (var i=0; i<observers.length; i++) {
            if (observers[i] === fn) return false; // already subscribed.
        }
        observers.push(fn);
        // always push the current value to the new observer.
        // NB. the fn argument === the old value!
        fn(items);
        return true; // did subscribe.
    }
    function unobserve(fn) {
        // find and remove the observer if present.
        for (var i=0; i<observers.length; i++) {
            if (observers[i] === fn) {
                observers.splice(i,1); // remove one element.
                return true; // removed the observer.
            }
        }
        return false; // was not subscribed.
    }
    return {push:push, pop:pop, remove:remove, observe:observe, unobserve:unobserve};
}

// Path observer.
// Observes a dot-path in a model.

function PathObserver(model, path, fn) {
    // Observe a property within a nested Model structure,
    // where each name in the dot-separated path denotes a nested
    // Model or the final property to observe.
    var names = path.split('.');
    // walk backwards building up a chain of observer callbacks that
    // react to value changes by unbinding and re-binding to the
    // named field on a Model or plain javascript Object.
    for (var i=names.length; --i > 0; ) {
        fn = makeWatcher(names[i], fn);
    }
    // observe the leftmost path element directly.
    var name = names[0]; names = 0; // for GC.
    model.observe(name, fn);
    // return a function that unsubscribes the path observer.
    return function() {
        // stop observing the leftmost path element.
        model.unobserve(name, fn);
        // push 'undefined' into the chain of observers, which will
        // cause each of them to push undefined into the next and
        // will unhook any active observers.
        fn(undefined);
    };
}

function makeWatcher(name, fn) {
    //console.log("makeWatcher", name);
    var old;
    return function path_observer(val) {
        // observer can be called with the same value when a parent
        // watcher changes, and the value of the named field in the
        // new Model is the same as it was in the old Model.
        //console.log("path_observer", name+":", (old&&old.observe)?"[Model]":old, "->", (val&&val.observe)?"[Model]":val, "push:", (val !== old));
        if (val !== old) {
            if (old && old.unobserve) {
                // unhook the callback from the previous Model.
                old.unobserve(name, fn);
            }
            old = val;
            if (val && val.observe) {
                // observe named field of the new Model.
                // this will also push the current value into fn.
                val.observe(name, fn);
            } else if (val && hasOwn.call(val, name)) {
                // bind to a static property of an Object (read it once
                // and push that value into fn.)
                // hasOwnProperty avoids binding to 'toString' etc.
                fn(val[name]);
            } else {
                // no value available; push undefined into fn so it
                // doesn't remain bound to the old Model property.
                fn(undefined);
            }
        }
    };
}

document.addEventListener("DOMContentLoaded", function(e){
  BindToDOM(document.body, Scope(Model(testData)));
  console.log(testData);
});

})();
