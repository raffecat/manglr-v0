;(function(){

  var manglr = 'manglr';
  var is_scope = manglr+'_s';
  var is_tpl = manglr+'_t';
  var std_attr = new RegExp("^accept-charset$|^http-equiv$|^data-|^aria-");
  var prefix_re;
  var hasOwn = Object.prototype.hasOwnProperty;
  var nextSid = 1;
  var tags = {};       // registry.
  var directives = {}; // registry.
  var prefixes = {};   // registry.
  var prefixes_dirty = true;
  var root_component = { id:'c0', tags:{} };
  var components = { c0:root_component }; // index.
  var has_loaded = false;
  // var is_boolean = new RegExp("^selected|^checked|^disabled|^readonly|^multiple");

  // ---- tag handlers ----

  tags['component'] = function(){};

  // ---- prefix handlers ----

  prefixes['class-'] = function(){};
  prefixes['style-'] = function(){};

  function rebuild_prefixes() {
    // lazy rebuild after a new handler is registered.
    prefixes_dirty = false;
    var res = [];
    for (var k in prefixes) {
      if (hasOwn.call(prefixes, k)) {
        res.push('^'+k);
      }
    }
    prefix_re = new RegExp(res.join('|'))
  }

  // ---- error reporting ----

  var error_msgs = [
    'manglr-bind.js must be loaded first!',                                  // 0
    'no handler registered for custom attribute "@1"',                       // 1
    'error thrown in handler "@1":',                                         // 2
    'duplicate tag "@1" registered:',                                        // 3
    'duplicate directive "@1" registered:',                                  // 4
    'duplicate prefix "@1" registered:',                                     // 5
    '[internal] parent component id "@1" is missing from registry',          // 6
    '[internal] parent component does not have an id',                       // 7
    'component must have a "tag" attribute',                                 // 8
    'duplicate component tag name "@1" declared',                            // 9
    'tags and directives (@1) must be registered before DOMContentLoaded',   // 10
  ];

  function error(node, n, name, err) {
    console.log(manglr+': '+(error_msgs[n]||n).replace(/@1/g,name), node, err);
  }

  // ---- scopes ----

  function Scope(up, contents) {
    return {id:'s'+(nextSid++), b:{}, up:up, co:contents, in:[]};
  }

  // ---- creating templates ----

  function create_text(doc, parent, binding, scope) {
    var node = doc.createTextNode('');
    binding(scope, function (val) {
      var t = typeof(val);
      node.data = (t === 'string' || t === 'number') ? val : '';
    });
    parent.appendChild(node);
  }

  function is_true(val) {
    // true for non-empty collection or _text_ value.
    return val instanceof Array ? val.length : (val || val===0);
  }

  function create_tag(doc, parent, tag, attrs, bindings, children, scope) {
    var node = doc.createElement(tag);
    // - className, htmlFor
    // - style
    for (var i=0; i<attrs.length; i+=2) {
      var name = attrs[i];
      var val = attrs[i+1];
      if (typeof(node[name]) === 'boolean') {
        node[name] = !! is_true(val); // cast to boolean.
      } else {
        node.setAttribute(name, val);
      }
    }
    for (var i=0; i<bindings.length; i+=2) {
      var binding = bindings[i+1];
      binding(scope, function (val, name) {
        if (typeof(node[name]) === 'boolean') {
          node[name] = !! is_true(val); // cast to boolean.
        } else {
          if (val == null) { // or undefined.
            node.removeAttribute(name);
          } else {
            var t = typeof(val);
            node.setAttribute(name, (t === 'string' || t === 'number') ? val : '');
          }
        }
      }, bindings[i]);
    }
    parent.appendChild(node);
    spawn_dom(doc, node, children, scope);
  }

  function create_component(doc, parent, comp, attrs, bindings, children, scope) {
    var inner = Scope(scope, children);
    scope.in.push(inner); // register to be destroyed with enclosing scope.
    for (var i=0; i<attrs.length; i+=2) {
      var name = attrs[i];
      var val = attrs[i+1];
      inner.b[name] = val; // bind to literal.
    }
    for (var i=0; i<bindings.length; i+=2) {
      var name = bindings[i];
      var binding = bindings[i+1];
      inner.b[name] = binding(scope); // dep.
    }
    // each component defn should KNOW the component tag-names in scope.
    spawn_dom(doc, parent, comp.tpl, inner, comp.tags);
    return inner; // for walk_dom.
  }

  function create_condition(doc, parent, binding, contents, scope) {
    // captures `parent` DOM node but can replace with `id` indirection and drop ref.
    var inner = null; // scope if currently in-document.
    binding(scope, function (val, name) {
      if (is_true(val)) {
        if (!inner) {
          inner = spawn_dom(doc, parent, contents, scope);
        }
      } else {
        if (inner) {
          destroy_scope(inner);
          inner = null;
        }
      }
    });
  }

  function create_repeat(doc, parent, binding, bind_as, contents, scope) {
    // captures `parent` DOM node but can replace with `id` indirection and drop ref.
    var has = {}; delete has.x; // scope if currently in-document.
    binding(scope, function (val, name) {
      var seq = val instanceof Array ? val : [];
      var sentinel = parent.firstChild;
      var used = {};
      for (var i=0; i<seq.length; i++) {
        var model = seq[i];
        var key = model ? (model.id || i) : i;
        used[key] = true;
        var inner;
        if (hasOwn.call(has, key)) {
          // move the existing dom node into the correct place (if order has changed)

          // FIXME: inner.dom must be a list of DOM nodes, except where they're if/repeat
          // scopes or component bodies (those are all lists of nodes!)
          // Maybe need to virtual-dom these and implement a "move" traversal down to
          // the first level of dom nodes in each scope.

          inner = has[key];
          parent.insertBefore(inner.dom, sentinel);
        } else {
          // create an inner scope with bind_as bound to the model.
          inner = Scope(scope, []);
          inner.b[bind_as] = model;
          spawn_dom(doc, parent, contents, inner);
          has[key] = inner;
          // move the new dom node into the correct place.
          parent.insertBefore(inner.dom, sentinel);
        }
        sentinel = inner.dom.nextSibling;
      }
      // destroy all unused inner-scopes.
      for (var key in has) {
        if (hasOwn.call(has, key) && !hasOwn.call(used, key)) {
          destroy_scope(has[key]);
          delete has[key];
        }
      }
    });
  }

  function spawn_dom(doc, parent, children, scope) {
    // repeat, if, route: create and destroy scoped instances.
    for (var i=0; i<children.length; ) {
      switch (tpl[i]) {
        case 0: { // text.
          create_text(doc, parent, tpl[i+1], scope);
          i += 2;
          break;
        }
        case 1: { // tag.
          var tag = tpl[i+1];
          var attrs = tpl[i+2];
          var bindings = tpl[i+3];
          var contents = tpl[i+4];
          i += 5;
          create_tag(doc, parent, tag, attrs, bindings, contents, scope);
          break;
        }
        case 2: { // component [resolved in advance]
          var comp = tpl[i+1];
          var attrs = tpl[i+2];
          var bindings = tpl[i+3];
          var contents = tpl[i+4];
          i += 5;
          create_component(doc, parent, comp, attrs, bindings, contents, scope);
        }
        case 3: { // if.
          var cond = tpl[i+1];
          var contents = tpl[i+2];
          i += 3;
          create_condition(doc, parent, cond, contents, scope);
        }
        case 4: { // repeat.
          var over = tpl[i+1];
          var bind_as = tpl[i+2];
          var contents = tpl[i+3];
          i += 4;
          create_repeat(doc, parent, over, bind_as, contents, scope);
        }
      }
    }
  }

  // ---- binding ----

  function bind_handler(handler, name, node, contents, scope, bind_to_dom) {
    console.log("bind:", name, contents, node);
    try {
      handler(node, contents, scope, bind_to_dom);
    } catch (err) {
      error(node, 2, name, err);
    }
  }

  function bind_attribute(node, name, contents, scope) {
  }

  function bind_text_node(node, contents, scope) {
  }

  function component_name_used(name, pid) {
    // compiler: assert that components do not shadow other components.
    var parent;
    while (pid && (parent = components[pid])) {
      if (parent.tags[name]) return true;
      pid = parent.pid;
    }
    return false;
  }

  function find_components(top) {
    // NB. node cannot be a component itself.
    var defs = top.getElementsByTagName('component');
    var remove = [];
    for (var i=0,n=defs.length; i<n; i++) {
      var defn = defs[i];
      remove.push(defn);
      if (defn[is_scope]) continue; // DOM node is already controlled by a scope.
      // assign each component a unique id.
      var sid = 'c'+(nextSid++);
      defn[is_scope] = sid;
      // find the enclosing parent component.
      var parent = defn.parentNode;
      var into = root_component; // enclosing parent if none found.
      while (parent !== top) {
        if (parent.nodeName.toLowerCase() === 'component') {
          // found an enclosing component.
          var pid = parent[is_scope] || error(parent, 7, ''); // missing id.
          into = pid ? (components[pid] || error(parent, 6, pid)) : null; // id not in registry.
          break;
        }
        parent = parent.parentNode;
      }
      var tag = defn.getAttribute('tag') || error(defn, 8, ''); // missing attribute.
      if (tag && into) {
        // index the component so we can find it for nested components.
        var comp = { id:sid, tag:tag, tags:{}, pid:into.id, dom:defn };
        components[sid] = comp;
        // register the component in its parent by custom-tag name.
        var tag_set = into.tags;
        if (component_name_used(tag, into.id)) error(defn, 9, tag); // duplicate name.
        else tag_set[tag] = comp;
        console.log("added component", tag, "into", into);
      }
    }
    // remove the component defns from the dom so they will not be rendered or affect layout.
    for (var i=0; i<remove.length; i++) {
      var defn = remove[i];
      defn.parentNode.removeChild(defn);
    }
  }

  function walk_dom(node, scope, c_tags) {
    var nodeType = node.nodeType;
    if (nodeType == 1 || nodeType == 9) { // Element, Document.
      // each DOM node can only be controlled by one scope.
      if (node[is_scope]) return; // DOM node is already controlled by a scope.
      node[is_scope] = scope.id; // now controlled by manglr.
      // check if the tag has a custom handler.
      var tag = node.nodeName.toLowerCase();
      // console.log("tag: "+tag);
      var comp = c_tags[tag];
      if (comp) {
        // spawn a component instance.
        var inner = create_component(document, parent, comp, attrs, bindings, children, scope);
        // replace the dom node with the 
        node.parentNode.insertBefore(inner.dom, node);

        bind_handler(tag_hand, tag, node, tag, scope, bind_to_dom);
      }
      // iterate over attributes and apply bindings.
      var attrs = node.attributes; // NB. Document does not have attributes.
      for (var i=0,n=attrs&&attrs.length; i<n; i++) {
        var attr = attrs[i];
        // compatibility: old versions of IE iterate over non-present attributes.
        if (attr.specified) {
          var name = attr.name;
          var contents = attr.value;
          var handler = directives[name];
          if (handler) {
            // custom binding handler.
            bind_handler(handler, name, node, contents, scope, bind_to_dom);
          } else {
            if (~name.indexOf('-')) {
              // check if the attribute matches any registered handler prefix.
              var m = name.match(prefix_re);
              if (m) {
                var prefix = m[0];
                var suffix = name.substr(prefix.length);
                // custom binding handler.
                bind_handler(prefixes[prefix], suffix, node, contents, scope, bind_to_dom);
              } else {
                // warn if the attribute is not a standard HTML attribute.
                if (!std_attr.test(name)) error(node, 1, name);
              }
            }
            // bind the attribute if it contains any placeholders.
            if (~contents.indexOf('{')) {
              bind_attribute(node, name, contents, scope);
            }
          }
        }
      }
      // iterate over child nodes unless the node has become a template.
      if (!node[is_tpl]) {
        var child = node.firstChild;
        while (child) {
          // note that bindings can remove the node from the document,
          // so record the next child before applying bindings.
          var next_child = child.nextSibling;
          walk_dom(child, scope, c_tags);
          child = next_child;
        }
      }
    } else if (nodeType == 3) { // Text.
      var contents = node.data; // CharacterData, DOM level 1.
      if (~contents.indexOf('{')) {
        bind_text_node(node, contents, scope);
      }
    }
  }

  function bind_to_dom(node, scope) {
    // update the attribute prefix regex if register_prefix has been called.
    if (prefixes_dirty) rebuild_prefixes();
    // must find all component tags first, since they affect walk_dom.
    find_components(node);
    // now walk the dom nodes using component defs found above.
    walk_dom(node, scope, root_component.tags);
  }

  // ---- registration ----

  function register(name, handler, set, n) {
    var d = document;
    if (has_loaded) error(d, 10, name);
    else if (set[name]) error(d, n, name);
    else set[name] = handler;
  }

  function register_tag(name, handler) {
    register(name, handler, tags, 3);
  }
  function register_directive() {
    register(name, handler, directives, 4);
  }
  function register_prefix() {
    register(name, handler, prefixes, 5);
    prefixes_dirty = true;
  }

  // ---- init ----

  (function(){
    var win = window;
    if (win[manglr]) error(win, 0);
    win[manglr] = {tag:register_tag, directive:register_directive, prefix:register_prefix};

    var doc = document;
    function init() {
      has_loaded = true;
      bind_to_dom(doc, Scope(null, []));
      doc = null; // GC.
    }
    if (doc.readyState == 'loading') {
      // defer until (non-async) scripts have loaded so manglr plugins can register.
      doc.addEventListener('DOMContentLoaded', init);
    } else {
      win.setTimeout(0, init);
    }

    win = null; // GC.
  })();

})();
