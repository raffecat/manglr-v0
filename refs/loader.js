(function(){

    function forEach(seq,fn) { for (var i=0,n=seq&&seq.length;i<n;i++) fn(seq[i],i); }

    var nextUid = 1, uid = function(){ return 'u'+(nextUid++) };

    //function removeElem(parent, node) { parent.removeChild(node) }
    function clearElem(node, c) { while (c=node.firstChild) node.removeChild(c); }
    function createText(text) { return document.createTextNode(text); }
    function insertBefore(marker, node) { marker.parentNode.insertBefore(node, marker); }
    //function insertAfter(marker, node) { marker.parentNode.insertBefore(node, marker.nextSibling); }
    //function trim(s) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,''); }
    function removeClass(elem, cls) {
        var seq = cls.replace(/\s\s*/g,' ').split(' ');
        var classes = ' ' + elem.className + ' ';
        for (var i=0,n=seq.length;i<n;i++) {
            var cls = seq[i];
            if (cls) classes = classes.replace(' '+cls+' ', ' ');
        }
        elem.className = classes.slice(1,-1);
    }

    var templates = {}; // TODO: use templates.
    var spawnFuns = {
        'if': function(item, insert, scope) {
            var expr = item[1], inner;
            var marker = document.createComment('if'); insert(marker);
            scope.bind(expr, function(val) {
                console.log("if", item, val, scope);
                if (val && !inner) {
                    inner = scope.dup();
                    function ins(node){ insertBefore(marker, node); }
                    spawnTags(item, 2, ins, inner);
                } else if (!val && inner) {
                    inner.dest();
                }
            });
        },
        'repeat': function(item, insert, scope) {
            var alias = item[1], expr = item[2];
            var marker = document.createComment('repeat'); insert(marker);
            scope.bind(expr, function(seq) {
                console.log("repeat", item, seq, scope);
                for (var i=0,n=seq&&seq.length;i<n;i++) {
                    var val = seq[i];
                    // create a scope for each repetition.
                    var inner = scope.dup();
                    inner.set(alias, val);
                    // what if we repeat an if that is false?
                    function ins(n){ insertBefore(marker, n) }
                    spawnTags(item, 3, ins, inner);
                }
            });
        },
        'template': function(item, insert, scope) {
            var id = item[1];
            templates[id] = item;
        }
    };

    var attrFuncs = {
        'x-text': function(node, expr, scope) {
            scope.bind(expr, function(val) {
                clearElem(node);
                node.appendChild(createText(val||''));
            });
        },
        'x-content': function(node, expr, scope) {
            scope.bind(expr, function(val) {
                clearElem(node);
                node.innerHTML = val||'';
            });
        },
        'x-show': function(node, expr, scope) {
            scope.bind(expr, function(val) {
                node.style.display = val ? '' : 'none';
            });
        },
        'x-class': function(node, expr, scope) {
            forEach(expr.split(','), function (item) {
                var pair = item.split(':'), cls = pair[0], term = pair[1];
                if (term) {
                    scope.bind(term, function(val) {
                        if (val) { addClass(node, cls); }
                        else { removeClass(node, cls); }
                    });
                } else {
                    var prevCls = '';
                    scope.bind(term, function(val) {
                        // remove classes added last time.
                        removeClass(node, prevCls);
                        prevCls = val;
                        // add new classes from the expression value.
                        addClass(node, val);
                    });
                }
            });
        }
    };

    function exprAttr(name) {
        attrFuncs['x-'+name] = function(node, expr, scope) {
            scope.bind(expr, function(val) {
                node.setAttribute(name, val||'');
            });
        };
    }
    exprAttr('href');
    exprAttr('src');
    exprAttr('alt');
    exprAttr('title');

    function spawnTags(items, first, insert, scope) {
        for (var i=first,n=items.length;i<n;i++) {
            var item = items[i];
            // each item in the tag array is either a string (text node)
            // or a list containing [tag, attrs, children...]
            if (typeof item == 'string') {
                // text node with support for entity references.
                var node, tmp = document.createElement('div');
                tmp.innerHTML = item;
                // append a clone of the html content.
                while (node=tmp.firstChild) {
                    insert(node);
                }
            } else {
                var tagName = item[0], handler = spawnFuns[tagName];
                if (handler) {
                    // custom tag handler.
                    handler(item, insert, scope);
                } else {
                    // create an html tag and set attributes.
                    var node = document.createElement(tagName), attrs = item[1];
                    for (var j=0,m=attrs&&attrs.length;j<m;j+=2) {
                        var name = attrs[j], val = attrs[j+1], fun = attrFuncs[name];
                        if (fun) { fun(node, val, scope); }
                        else { node.setAttribute(name, val); }
                    }
                    // spawn and append child nodes.
                    spawnTags(item, 2, function(n){ node.appendChild(n) }, scope);
                    // insert node into the document.
                    insert(node);
                }
            }
        }
    }

    var body = document.body;
    var root = new Scope(data);
    spawnTags(decode(template), 0, function(n){ body.appendChild(n) }, root);



    // Property library.
    // Create a scope S, and within that scope, create properties Pn.
    // Watch properties with Pn.on(function), remove with Pn.off(function).
    // When a property is changed via Pn.set(value) and the new value
    // differs from the current value, notify all watchers.
    // Pn.dest() and S.dest() remove all watchers.
    // BUT: you need to create properties before you can watch them.
    // SO: you need to build models on top of the property library.


    // Model library.
    // Create a model M, and get(name) and set(name,value) its properties.
    // Watch properties with M.watch(name), remove with M.unwatch(name).
    // Properties can be watched before they are first set.
    // Get a child model using M.model(name); child models are created on demand.
    // Use M.each(name, function) to watch a sequence of models.

    // BUT: you always need a Model and a 'name' to do anything, unlike the
    // property library where you can pass around Properties.
    // This complicates usage: to resolve a repeat binding you need to keep
    // aside the last item in the dot path, resolve the remaining items using
    // .get(name) and finally use .each(name,fn) on the resolved model.

    // Example: repeat binding "post in forum.posts" will:
    //  model.get('forum').each('posts', function(model){})
    //  model.get('forum').get('posts').each(function(model){})
    // The function will be called for each item in the sequence, and once
    // for each new item added to the sequence.
    // Use item.final(function) to listen for its destroy event.
    
    // What happens when you M.set('foo', Model()) - is this allowed?
    // How can it remap watches and child models?

    function ModelWithoutGotten(data) {
        // data must not be mutated, it is used to lazy-init fields.
        var watches = {}, queue = [], nextFun = 0, s = Schedule(), undef;
        var self = {
            set: function(name, val) {
                // create or update binding in this scope.
                if (data[name] !== val) {
                    data[name] = val;
                    // run all the watchers for this field.
                    var w = watches[name];
                    for (var i=0,n=w&&w.length;i<n;i++) w[i](val);
                }
            },
            get: function(name) {
                return data[name];
            },
            watch: function(name, fn) {
                var named = watches[name];
                if (named) { named.push(fn); }
                else { watches[name] = (named = [fn]); }
                var val = data[name];
                // need to push current val, but not if 
                if (val !== undef) s.add(fn, [val]);
            },
            unwatch: function(name, fn) {
            },
            when: function(name, fn) {
                // apply fn(m) when this[name] becomes true; m is the model
                // for this[name]; destroy m when this[name] becomes false.
            },
            each: function(name, fn) {
                // apply fn(m) for each item in Array this[name]; m is the model
                // for that item; destroy m when that item is no longer in the
                // Array; a non-Array this[name] is considered an empty Array.
            },
            clear: function() {
                // set all fields in this to undefined.
            }
        };
        return self;
    }

    function Model(data) {
        // data must not be mutated, it is used to lazy-init fields.
        var watches = {}, queue = [], queuedFuns = [], nextFun = 0, willRun = 0;
        function runQueue() {
            // change back to will-not-run state.
            var q = queue; queue = []; queuedFuns = []; willRun = 0;
            // run all the queued functions.
            for (var i=0,n=q.length;i<n;i++) {
                try {
                    q[i]();
                } catch (e) {
                    console.error(e.stack || e.toString());
                }
            }
        }
        var self = {
            dest: function() {
                // unbind everything in this scope...
            },
            set: function(name, val) {
                // create or update binding in this scope.
                ( watches[name] || ( watches[name] = Gotten() ) )( val );
                /*
                if (data[name] !== val) {
                    data[name] = val;
                    // run all the watchers for this field.
                    var w = watches[name];
                    for (var i=0,n=w&&w.length;i<n;i++) w[i](val);
                }
                */
            },
            get: function(name) {
                // make one Gotten for each name and push data[name]
                var named = watches[name];
                if (!named) {
                    watches[name] = ( named = Gotten() );
                    named( data[name] ); // push initial value.
                }
                return named.api;
            }
        };
        return self;
    }

    function Gotten() {
        var curVal, pushed, ons = [];
        function push(val) {
            curVal = val; pushed = 1;
            for (var fn,i=0;i<ons.length;i++) {
                if (fn=ons[i]) fn(val);
                else ons.splice(i--,1); // remove off(fn)
            }
        }
        push.api = {
            get: function (name) {
                var oldVal, named = Gotten();
                ons.push(function (obj) {
                    var val = obj && obj[name];
                    if (val !== oldVal) {
                        if (oldVal && oldVal.off) oldVal.off(named);
                        oldVal = val;
                        // subscribe to the new value or push it through now.
                        if (val && val.on) val.on(named);
                        else named(val);
                    }
                });
                return named.api;
            },
            on: function (fn) {
                ons.push(fn);
                pushed && fn(curVal);
            },
            off: function(fn) {
                for (var i=0,n=ons.length;i<n;i++)
                    if (ons[i] === fn) ons[i] = null;
            }
        };
        return push;
    }

    function schedule(fn) {
        setTimeout(fn,0);
    }



    // Expression library.
    // Create a scope S(model), use S.dest() to discard S and all bindings.
    // Watch an expression with S.bind(expr) which will parse `expr` as a
    // javascript expression, mapping assignment to unique private variables.
    // Dot paths in `expr` map to model.get() chains, will watch the result,
    // and evaluate the expression when all watches have produced at
    // least one result, and re-evaluate after any watch produces a new
    // result in an eventually consistent manner.

    function Scope(model, parent) {
        // data must not be mutated, it is used to lazy-init fields.
        var watches = {}, queue = [], queuedFuns = [], nextFun = 0, willRun = 0;
        function runQueue() {
            // change back to will-not-run state.
            var q = queue; queue = []; queuedFuns = []; willRun = 0;
            // run all the queued functions.
            for (var i=0,n=q.length;i<n;i++) {
                try {
                    q[i]();
                } catch (e) {
                    console.error(e.stack || e.toString());
                }
            }
        }
        var self = {
            bind: function(expr, fun) {
                var deps = [], thisFun = nextFun++;
                // replace dot-paths in expr with bound deps.
                expr = expr.replace(/([\w.]+)/g, function(path) {
                    // reserve the next slot in the deps array.
                    var slot = deps.length;
                    deps[slot] = null;
                    //  follow the dot-path to an observable field.
                    var bits = path.split('.'), obj = self;
                    for (var i=0,n=bits.length;i<n;i++) {
                        obj = obj.get( bits[i] );
                    }
                    // wait for the observable field to change.
                    obj.on(function(val) {
                        // save the new value.
                        deps[slot] = val;
                        // queue the update function to run once.
                        // why queue in scope? so we can dest the scope and its queue.
                        if (!queuedFuns[thisFun]) {
                            queuedFuns[thisFun] = 1;
                            queue.push(update);
                            // ensure the scope is queued.
                            if (!willRun) {
                                willRun = 1;
                                schedule( runQueue );
                            }
                        }
                    });
                    return '$['+slot+']';
                });
                var bound = Function('$', 'return '+expr);
                var oldVal;
                function update() {
                    // run the bound function and compare result.
                    var val = bound(deps);
                    if (val !== oldVal) {
                        // result of expr has changed, run the bound fun.
                        oldVal = val;
                        fun(val);
                    }
                }
            },
            dup: function() {
                // set up a child scope that inherits bindings.
                return Scope({}, self);
            },
            dest: function() {
                // unbind everything in this scope...
            },
            set: function(name, val) {
                // create or update binding in this scope.
                // needs to ubsubscribe from parent for the bound name.
                ( watches[name] || ( watches[name] = Gotten() ) )( val );
                /*
                if (data[name] !== val) {
                    data[name] = val;
                    // run all the watchers for this field.
                    var w = watches[name];
                    for (var i=0,n=w&&w.length;i<n;i++) w[i](val);
                }
                */
            },
            get: function(name) {
                // make one Gotten for each name and push data[name]
                var named = watches[name];
                if (!named) {
                    watches[name] = ( named = Gotten() );
                    named( data[name] ); // push initial value.
                }
                return named.api;
            }
        };
        return self;
    }


    // Schedule library.
    // 
    
    function Schedule() {
    }

    function ModelWithoutGotten(data) {
        // data must not be mutated, it is used to lazy-init fields.
        var watches = {}, queue = [], queuedFuns = [], nextFun = 0, willRun = 0;
        function runQueue() {
            // change back to will-not-run state.
            var q = queue; queue = []; queuedFuns = []; willRun = 0;
            // run all the queued functions.
            for (var i=0,n=q.length;i<n;i++) {
                try {
                    q[i]();
                } catch (e) {
                    console.error(e.stack || e.toString());
                }
            }
        }
    }

})();
