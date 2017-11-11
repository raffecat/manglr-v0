/*
    Bind DOM nodes to a dynamic expression model.

    This module implements deferred DOM updates bound to a data model.

    The expression syntax and model implementation are provided to this
    module in the form of a data-bound 'model' object.
*/

// Character references are not represented in the DOM.
// The DOM Core represents all attribute values as simple strings.

var BindToDOM = (function(){

    function forEach(seq,fn) { for (var i=0,n=seq&&seq.length;i<n;i++) fn(seq[i]); }
    //function trim(s) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,''); }

    var nextUid = 1, uid = function(){ return 'u'+(nextUid++) };

    // note: what if the node contains a repeat/if scope?
    function clearElem(node, c) { while (c=node.firstChild) node.removeChild(c); }

    function removeClass(elem, cls) {
        var seq = cls.replace(/\s\s*/g,' ').split(' ');
        var classes = ' ' + elem.className + ' ';
        for (var i=0,n=seq.length;i<n;i++) {
            var cls = seq[i];
            if (cls) classes = classes.replace(' '+cls+' ', ' ');
        }
        elem.className = classes.slice(1,-1);
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
        'if': function(node, expr, scope, bind) {
            var inner;
            // insert a marker in the DOM before the 'if' node.
            var marker = document.createComment('if');
            node.parentNode.insertBefore(marker, node);
            // move the original repeated node out of the document.
            var template = document.createDocumentFragment();
            template.appendChild(node);
            // watch the scope for expression changes.
            scope.bind(expr, function(val) {
                console.log("if", item, val, scope);
                if (val && !inner) {
                    // create a scope for the conditional node.
                    inner = scope.clone();
                    // make a deep clone of the template.
                    var inst = template.cloneNode(true);
                    // apply bindings in the cloned node.
                    bind(inst, scope);
                    // insert the clone into the document.
                    node.parentNode.insertBefore(inst, marker.nextSibling);
                } else if (!val && inner) {
                    // remove subtree from the DOM and destroy scope.
                    inner.dest();
                }
            });
        },
        'repeat': function(node, expr, scope, bind) {
            var parts = expr.split(' in ');
            var alias = parts[0], expr = parts[1];
            // insert a marker in the DOM before the 'repeat' node.
            var marker = document.createComment('repeat');
            node.parentNode.insertBefore(marker, node);
            // move the original repeated node out of the document.
            var template = document.createDocumentFragment();
            template.appendChild(node);
            // watch the scope for expression changes.
            scope.bind(expr, function(seq) {
                console.log("repeat", item, seq, scope);
                for (var i=0,n=seq&&seq.length;i<n;i++) {
                    var val = seq[i];
                    // TODO: use unique ids to match up existing instances,
                    // and add or remove instances as required.
                    // create a scope for each repetition.
                    var inner = scope.clone();
                    inner.set(alias, val);
                    // make a deep clone of the template.
                    var inst = template.cloneNode(true);
                    // apply bindings in the cloned node.
                    bind(inst, scope);
                    // insert the clone into the document.
                    node.parentNode.insertBefore(inst, marker.nextSibling);
                }
            });
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
                console.log("<"+node.nodeName+">");
                // iterate over attributes and apply bindings.
                var attrs = node.attributes;
                for (var i=0,n=attrs&&attrs.length; i<n; i++) {
                    var attr = attrs[i];
                    if (attr.specified) {
                        var name = attr.name;
                        if (hasPrefix.test(name)) {
                            var handler = bindings[name.slice(prefix.length)];
                            if (handler) {
                                //console.log(attr.name, '=', attr.value);
                                handler(node, attr.value, scope, bind);
                            } else {
                                console.log("no handler for attribute:", name);
                            }
                        }
                    }
                }
                // iterate over child nodes.
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

        bind(element, model);
    }

    return BindToDOM;

})();
