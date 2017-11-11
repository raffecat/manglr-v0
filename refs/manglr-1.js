(function(exports){
/*
    Bind DOM nodes to a dynamic expression model.

    This module implements deferred DOM updates bound to a data model.

    The expression syntax and model implementation are provided to this
    module in the form of a data-bound 'model' object.
*/

// Character references are not represented in the DOM.
// The DOM Core represents all attribute values as simple strings.
// Read element.offsetTop to cause reflow.

var BindToDOM = (function(){

    // This scope is captured by all the bindings' scope.bind closures,
    // so vars in this scope MUST NOT hold any DOM nodes.

    function forEach(seq,fn) { for (var i=0,n=seq&&seq.length;i<n;i++) fn(seq[i]); }
    //function trim(s) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,''); }

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

    var bindings = {
        'text': function (node, expr, scope) {
            scope.bind(expr, function(value) {
                clearElem(node);
                node.appendChild(document.createTextNode(value||''));
            });
        },
        'html': function (node, expr, scope) {
            scope.bind(expr, function(value) {
                clearElem(node);
                node.innerHTML = value||'';
            });
        },
        'show': function (node, expr, scope) {
            scope.bind(expr, function(value) {
                node.style.display = value ? '' : 'none';
            });
        },
        'class': function(node, expr, scope) {
            forEach(expr.split(','), function (item) {
                var pair = item.split(':'), cls = pair[0], term = pair[1];
                if (term) {
                    // conditionally add and remove the class.
                    scope.bind(term, function(val) {
                        if (val) { addClass(node, cls); }
                        else { removeClass(node, cls); }
                    });
                } else {
                    // expression yields one or more class names.
                    var prevCls = '';
                    scope.bind(cls, function(val) {
                        // remove classes added last time.
                        removeClass(node, prevCls);
                        prevCls = val;
                        // add new classes from the expression value.
                        addClass(node, val);
                    });
                }
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

    forEach('src href alt title'.split(' '), function (name) {
        bindings[name] = function (node, expr, scope) {
            scope.bind(expr, function(value) {
                node.setAttribute(name, value||'');
            });
        };
    });

    BindToDOM.bindings = bindings;

    function BindToDOM(element, model, options) {
        var prefix = (options||{}).prefix||'x-';
        var hasPrefix = RegExp('^'+prefix);

        // take ownership of the DOM element.
        function bind(node, scope) {
            var nodeType = node.nodeType;
            if (nodeType == 1 || nodeType == 9) { // Element or Document
                //console.log("<"+node.nodeName+">");
                // iterate over attributes and apply bindings.
                var attrs = node.attributes, owned = false;
                for (var i=0,n=attrs&&attrs.length; i<n; i++) {
                    var attr = attrs[i];
                    if (attr.specified) {
                        var name = attr.name;
                        if (hasPrefix.test(name)) {
                            var handler = bindings[name.slice(prefix.length)];
                            if (handler) {
                                //console.log(attr.name, '=', attr.value);
                                owned = owned || handler(node, attr.value, scope, bind);
                            } else {
                                //console.log("no handler for attribute:", name);
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

    return BindToDOM;

})();

exports.BindToDOM = BindToDOM;

exports.Scope = Scope;

// Scope
// Parses and binds expressions to the data model.
// This implementation supports only dot-path expressions.

function Scope(model, binds) {
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

exports.Model = Model;
exports.Collection = Collection;
exports.PathObserver = PathObserver;

// Model
// Contains key-value pairs.
// Values can be js values, Models or Collections.
// Observe a key to be notified when it changes.
// Observers and values are strong references.

var hasOwnProperty = Object.prototype.hasOwnProperty;

function Model(data) {
    if (!data) data = {};
    var observers = {};
    function get(key) {
        // avoid getting inherited properties.
        if (hasOwnProperty.call(data, key))
            return data[key];
    }
    function set(key, val) {
        var old;
        if (hasOwnProperty.call(data, key)) old = data[key];
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
        //console.log("bind observer to", key);
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
        if (hasOwnProperty.call(data, key)) val = data[key];
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

function Collection() {
    var items = [];
    var observers = [];
    function push() {
        // append one or more items to the collection.
        for (var i=0; i<arguments.length; i++) {
            items[items.length] = arguments[i];
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
            } else if (val && hasOwnProperty.call(val, name)) {
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
})(window);
