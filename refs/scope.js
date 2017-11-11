"use strict";

exports.Scope = Scope;

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
