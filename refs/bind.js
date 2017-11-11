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
                node.appendChild(document.createTextNode(value != null ? value.toString() : ''));
            });
        },
        'html': function (node, expr, scope) {
            scope.bind(expr, function(value) {
                clearElem(node);
                node.innerHTML = value != null ? value.toString() : '';
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
        'value': function (node, expr, scope) {
            scope.bind(expr, function(value) {
                node.value = value != null ? value.toString() : '';
            });
            function changed() {
              // some browsers apply the change after the event.
              setTimeout(function(){
                // TODO: here, we don't have access to a thing that
                // represents path/expr bound in the scope.
              },0);
            }
            node.addEventListener('keyup', changed, false);
            node.addEventListener('changed', changed, false);
            node.addEventListener('blur', changed, false);
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
            scope.bind(expr, function(val) {
                //console.log("if", item, val, scope);
                if (val && !inner) {
                    // create a scope for the conditional node.
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

    function bindAny(node, expr, scope, bind, name) {
        scope.bind(expr, function(value) {
            node.setAttribute(name, value != null ? value.toString() : '');
        });
    }

    BindToDOM.bindings = bindings;

    function BindToDOM(element, model, options) {
        var prefix = (options||{}).prefix||'v-';
        var hasPrefix = RegExp('^'+prefix);

        // take ownership of the DOM element.
        function bind(node, scope) {
            var nodeType = node.nodeType;
            if (nodeType == 1) { // Element.
                // iterate over attributes and apply bindings.
                var attrs = node.attributes, owned = false;
                for (var i=0,n=attrs?attrs.length:0; i<n; i++) {
                    var attr = attrs[i];
                    if (attr.specified) {
                        var name = attr.name;
                        if (hasPrefix.test(name)) {
                            var suffix = name.slice(prefix.length);
                            var handler = bindings[suffix] || bindAny;
                            owned = owned || handler(node, attr.value, scope, bind, suffix);
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
    }

    return BindToDOM;

})();

exports.BindToDOM = BindToDOM;
