"use strict";

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
    function path_observer(val) {
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
    }
    return path_observer;
}
