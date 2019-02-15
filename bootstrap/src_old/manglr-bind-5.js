(function(){
  "use strict";

  var manglr = 'manglr';
  var is_scope = manglr+'_s';
  var is_tpl = manglr+'_t';
  var std_attr = new RegExp("^accept-charset$|^http-equiv$|^data-|^aria-");
  var prefix_re;
  var hasOwn = Object.prototype.hasOwnProperty;
  var nextSid = 1;
  var directives = {}; // registry.
  var prefixes = {};   // registry.
  var prefixes_dirty = true;
  var root_component = { id:'c0', tags:{} };
  var components = { c0:root_component }; // index.
  var has_loaded = false;
  // var is_boolean = new RegExp("^selected|^checked|^disabled|^readonly|^multiple");

  // ---- error reporting ----

  var error_msgs = [
    'manglr-bind.js must be loaded first!',                                 // 0
    'no handler registered for custom attribute "@"',                       // 1
    'error thrown in handler "@":',                                         // 2
    'no component found (in scope) for custom tag "@"',                     // 3
    'duplicate directive "@" registered:',                                  // 4
    'duplicate prefix "@" registered:',                                     // 5
    '[internal] parent component id "@" is missing from registry',          // 6
    '[internal] parent component does not have an id',                      // 7
    'component must have a "tag" attribute',                                // 8
    'duplicate component tag name "@" declared',                            // 9
    'directives (@) must be registered before DOMContentLoaded',            // 10
    'component tag name "@" hides another component with the same name',    // 11
  ];

  var con = window.console;

  function error(node, n, name, err) {
    if (con) con.log(manglr+': '+(error_msgs[n]||n).replace(/@/g,name), node, err);
  }

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

  // ---- scopes ----

  function Scope(up, contents) {
    // a binding context for names lexically in scope.
    // find bound names in `b` or follow the `up` scope-chain.
    var s = {dom:[], id:'s'+(nextSid++), binds:{}, up:up, contents:contents, in:[]};
    if (up) up.in.push(s); // register to be destroyed with enclosing scope.
    return s;
  }

  function bind_to_scope(scope, binding, func) {
    // resolve binding - text_tpl or value, might be literal text?
  }

  function move_scope(scope, parent, after) {
  }

  function reset_scope(scope) {
  }

  function name_from_scope(scope, name) {
    // walk up the scope chain and find the name.
    do {
      var binds = scope.binds;
      if (hasOwn.call(binds, name)) {
        return binds[name];
      }
      scope = scope.up;
    } while (scope);
    return null;
  }

  function resolve_in_scope(scope, expr) {
    var len = expr.length;
    if (len < 1) return null;
    var dep = name_from_scope(scope, expr[0]);
    return dep;
  }

  // ---- creating templates ----

  function is_true(val) {
    // true for non-empty collection or _text_ value.
    return val instanceof Array ? val.length : (val || val===0);
  }

  function last_dom_node(scope) {
    // walk backwards from `scope` following the chain of `bk` references
    // until we find a DOM Node or a Scope that contains a DOM node.
    while (scope !== null) {
      // scan the nodes captured in the scope backwards for the last child.
      var children = scope.dom;
      for (var n=children.length-1; n>=0; n--) {
        var child = children[n];
        if (child instanceof Node) return child; // Node.
        var found = last_dom_node(child); // Scope.
        if (found) return found; // Node.
      }
      // follow the `bk` link to the previous child [Node or Scope]
      var prev = scope.bk;
      if (prev instanceof Node) return prev; // Node.
      scope = prev; // Scope.
    }
    // did not find a DOM node inside `after` or any previous sibling of `after`.
    return null;
  }

  function insert_after(parent, after, node) {
    // insert after the provided insertion point, for if/repeat updates.
    // `after` can be a DOM Node or a Scope.
    var last = (after instanceof Node) ? after : last_dom_node(after); // Scope|null -> Node|null
    parent.insertBefore(node, last ? last.nextSibling : parent.firstChild);
  }

  function create_text(doc, parent, after, scope, tpl, n) {
    // create a text node: [0, "text"]
    var node = doc.createTextNode(tpl[n+1]);
    insert_after(parent, after, node);
    return node;
  }

  function create_bound(doc, parent, after, scope, tpl, n) {
    // create a bound text node.
    var binding = tpl[n+1]; // [1, ["name", ...]]
    var node = doc.createTextNode('');
    var dep = resolve_in_scope(scope, binding);
    if (dep) {
      var t = typeof(dep);
      if (t === 'string' || t === 'number') {
        // constant value.
        node.data = dep;
      } else {
        // varying value.
        dep.watch(function (val) {
          var t = typeof(val);
          node.data = (t === 'string' || t === 'number') ? val : '';
        });
      }
    }
    insert_after(parent, after, node);
    return node;
  }

  function bind_tag_attr(node, name, dep) {
    dep.watch(function (val) {
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
    });
  }

  function create_tag(doc, parent, after, scope, tpl, n) {
    var tag = tpl[n+1];
    var attrs = tpl[n+2];
    var bindings = tpl[n+3];
    var contents = tpl[n+4];
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
      var name = bindings[i];
      var dep = resolve_in_scope(scope, bindings[i+1]);
      if (dep) {
        var t = typeof(dep);
        if (t === 'string' || t === 'number') {
          // constant value.
          if (typeof(node[name]) === 'boolean') {
            node[name] = !! is_true(dep); // cast to boolean.
          } else {
            if (dep == null) { // or undefined.
              node.removeAttribute(name);
            } else {
              var t = typeof(dep);
              node.setAttribute(name, (t === 'string' || t === 'number') ? dep : '');
            }
          }
        } else {
          // varying value.
          bind_tag_attr(node, name, dep);
        }
      }
    }
    insert_after(parent, after, node);
    // passing null `after` because we use our own DOM node as `parent`,
    // so there is never a _previous sibling_ DOM node for our contents.
    spawn_dom(doc, node, null, contents, scope, null);
    return node;
  }

  function create_component(doc, parent, after, scope, tpl, n) {
    var comp = tpl[n+1];
    var attrs = tpl[n+2];
    var bindings = tpl[n+3];
    var contents = tpl[n+4];
    // component has its own scope because it has its own namespace for bound names,
    // but doesn't have an independent lifetime (destroyed with the parent scope)
    var inner = Scope(scope, contents); // component instance `contents` (a tpl)
    for (var i=0; i<attrs.length; i+=2) {
      var name = attrs[i];
      var val = attrs[i+1];
      inner.binds[name] = val; // bind to literal.
    }
    for (var i=0; i<bindings.length; i+=2) {
      var name = bindings[i];
      var binding = bindings[i+1];
      inner.binds[name] = bind_to_scope(scope, binding); // make a dep.
    }
    // pass through `parent` and `after` so the component tpl will be created inline,
    // as if the component were replaced with its contents.
    spawn_dom(doc, parent, after, comp.tpl, inner, inner.dom);
    // Must return a Scope to act as `after` for a subsequent Scope node.
    // The scope `dom` must contain all top-level DOM Nodes and Scopes in the tpl.
    return inner;
  }

  function create_condition(doc, parent, after, scope, tpl, n) {
    // Creates a scope representing the contents of the condition node.
    // The scope toggles between active (has dom nodes) and inactive (empty).
    // TODO: must bind all locally defined names in the scope up-front.
    var binding = tpl[n+1];
    var contents = tpl[n+2];
    var inner = Scope(scope, scope.contents); // component `contents` available within `if` nodes.
    var present = false;
    bind_to_scope(scope, binding, function (val, name) {
      if (is_true(val)) {
        if (!present) {
          present = true;
          // spawn all dom nodes, bind watches to deps in the scope.
          // pass through `parent` and `after` so the contents will be created inline.
          spawn_dom(doc, parent, after, contents, inner, inner.dom);
        }
      } else {
        if (present) {
          present = false;
          // remove all [top-level] dom nodes and unbind all watches.
          // NB. need a list: watches can be bound to parent scopes!
          reset_scope(inner);
        }
      }
    });
    // Must return a Scope to act as `after` for a subsequent Scope node.
    return inner;
  }

  function create_repeat(doc, parent, after, scope, tpl, n) {
    var binding = tpl[n+1];
    var bind_as = tpl[n+2];
    var contents = tpl[n+3];
    // RESOLVE: doesn't need to be a scope, but does need to support 
    // `dom` for insert_after and move_scope, and `reset_scope` for destroy.
    var outer = Scope(scope, scope.contents); // component `contents` available within `repeat` nodes.
    var has = {}; // scope if currently in-document.
    bind_to_scope(scope, binding, function (val, name) {
      var seq = val instanceof Array ? val : [];
      // start at `after` so our contents will follow its DOM nodes.
      var ins_after = after;
      var used = {};
      outer.dom.length = 0; // must rebuild for `insert_after` in following nodes.
      outer.in.length = 0; // must rebuild the list of child scopes.
      for (var i=0; i<seq.length; i++) {
        var model = seq[i];
        var key = model ? (model.id || i) : i;
        used[key] = true;
        var inner;
        if (hasOwn.call(has, key)) {
          inner = has[key];
          // retained: add it back to the list of child scopes.
          outer.dom.push(inner);
          outer.in.push(inner);
          // move the existing dom nodes into the correct place (if order has changed)
          move_scope(inner, parent, ins_after);
        } else {
          // create an inner scope with bind_as bound to the model.
          inner = Scope(outer, scope.contents); // component `contents` available within `repeat` nodes.
          inner.binds[bind_as] = model;
          has[key] = inner;
          spawn_dom(doc, parent, ins_after, contents, inner, inner.dom);
          outer.dom.push(inner);
          // NB. new scope adds itself to outer.in.
        }
        ins_after = inner;
      }
      // destroy all unused inner-scopes.
      for (var key in has) {
        if (hasOwn.call(has, key) && !hasOwn.call(used, key)) {
          var inner = has[key];
          // remove dom nodes and unbind watches.
          reset_scope(inner);
          // discard the scope for GC.
          delete has[key];
        }
      }
    });
    return outer;
  }

  var create = [
    create_text,       // 0
    create_bound,      // 1
    create_tag,        // 2
    create_component,  // 3
    create_condition,  // 4
    create_repeat,     // 5
  ];
  var advance = [
    2, // create_text
    2, // create_bound
    5, // create_tag
    5, // create_component
    3, // create_condition
    4, // create_repeat
  ];

  function spawn_dom(doc, parent, after, tpl, scope, capture) {
    // spawn a list of children within a tag, component, if/repeat.
    // in order to move dom subtrees, scopes must capture child nodes.
    for (var i=0; i<tpl.length; ) {
      var op = tpl[i];
      // console.log("create", i, op);
      var next = create[op](doc, parent, after, scope, tpl, i);
      i += advance[op];
      next.bk = after; // backwards link for finding previous DOM nodes.
      if (capture) capture.push(next); // capture top-level nodes in a scope.
      after = next;
    }
  }

  // ---- parsing components ----

  var tpl_re = new RegExp("\{\s*([^}]*)\s*\}","y");

  function parse_text_tpl(text, tpl) {
    var pos = text.indexOf('{');
    console.log("parse_text_tpl:", pos, text);
    if (~pos) {
      tpl_re.lastIndex = 0;
      for (;;) {
        var match = tpl_re.exec(text);
        if (match) {
          var start = match.index;
          if (start > pos) tpl.push(0, text.substring(pos, start));
          tpl.push(1, match[1].split('.'));
          pos = match.lastIndex;
        } else {
          var len = text.length;
          if (len > pos) tpl.push(0, text.substring(pos, len));
          break;
        }
      }
    } else {
      tpl.push(0, text);
    }
  }

  function parse_tpl(node, tpl, c_tags) {
    // parse a tpl out of the dom for spawning.
    var nodeType = node.nodeType;
    if (nodeType == 1) { // Element.
      // check if the tag has a custom handler.
      var tag = node.nodeName.toLowerCase();
      // parse attributes.
      var attrs = node.attributes; // NB. Document does not have attributes.
      var raw = [];
      var binds = [];
      for (var i=0,n=attrs&&attrs.length; i<n; i++) {
        var attr = attrs[i];
        // compatibility: old versions of IE iterate over non-present attributes.
        if (attr.specified) {
          var name = attr.name;
          var value = attr.value;
          // TODO: directives and prefix-* will need to be applied when spawning,
          // but we must resolve them here because we don't want to match them during spawn!
          // TODO: also need to handle `if` and `repeat` here - wraps this node!
          // TODO: `route` custom-tag will wrap its contents in an `if` node.
          if (~value.indexOf('{')) {
            var bound = [];
            parse_text_tpl(value, bound);
            binds.push(name, bound);
          } else {
            raw.push(name, value);
          }
        }
      }
      // parse child nodes into their own tpl.
      var children = [];
      var child = node.firstChild;
      while (child != null) {
        parse_tpl(child, children, c_tags);
        child = child.nextSibling;
      }
      // match tag names against component tag-names in scope.
      var comp = c_tags[tag];
      if (comp) {
        console.log("matched component in tpl: "+tag);
        tpl.push(3, comp, raw, binds, children); // create_component.
      } else {
        // debugging: report custom tag names if not a component.
        if (~tag.indexOf('-')) error(node, 3, tag);
        tpl.push(2, tag, raw, binds, children); // create_tag.
      }
    } else if (nodeType == 3) { // Text.
      // node.data: CharacterData, DOM level 1.
      parse_text_tpl(node.data, tpl); // create_text.
    }
  }

  function find_components(top) {
    // NB. `top` cannot be a component itself.
    var comp_nodes = top.getElementsByTagName('component');
    var found = [];
    // in-order traversal: parents are processed before their children,
    // therefore we can always find the parent component by id in `components`.
    for (var i=0,n=comp_nodes.length; i<n; i++) {
      var node = comp_nodes[i];
      // assign each component a unique id.
      var sid = 'c'+(nextSid++);
      node[is_scope] = sid;
      // index components so we can find parent components.
      var comp = { id:sid, tags:{}, node:node, tpl:[] };
      components[sid] = comp;
      found.push(comp);
      // find the enclosing component - will already be in `components`.
      var parent = node.parentNode;
      var into = root_component; // enclosing component if none found.
      while (parent !== top) {
        if (parent.nodeName.toLowerCase() === 'component') {
          // found the enclosing component.
          var pid = parent[is_scope] || error(parent, 7, ''); // missing id on parent.
          into = pid ? (components[pid] || error(parent, 6, pid)) : null; // id not in registry.
          break;
        }
        parent = parent.parentNode;
      }
      var tag = node.getAttribute('tag') || error(node, 8, ''); // missing attribute.
      comp.tag = tag;
      if (tag && into) {
        // register the component in its parent by custom-tag name.
        var tag_set = into.tags;
        if (hasOwn.call(tag_set, tag)) error(node, 9, tag); // duplicate name.
        else tag_set[tag] = comp;
        comp.parent = into;
      }
    }
    // in-order traversal: parents are processed before their children,
    // therefore c_tags will hoist all ancestor tags as well.
    for (var i=0; i<found.length; i++) {
      var comp = found[i];
      var node = comp.node;
      comp.node = null; // GC.
      // hoist `tags` from the parent (includes `tags` from all ancestors)
      var c_tags = comp.tags; // NB. mutated! (hoisted tags are added)
      var parent = comp.parent;
      if (parent) {
        var up_tags = parent.tags;
        for (var k in up_tags) {
          if (hasOwn.call(up_tags, k)) {
            if (c_tags[k]) error(node, 11, k); // component tag shadows another component.
            else c_tags[k] = up_tags[k];
          }
        }
      }
      // parse dom nodes to create a template for spawning.
      var child = node.firstChild;
      while (child != null) {
        parse_tpl(child, comp.tpl, c_tags);
        child = child.nextSibling;
      }
      console.log("component:", comp.tag, comp.tpl);
      // remove the component nodes from the dom so they will not be rendered or affect layout.
      node.parentNode.removeChild(node);
    }
  }

  // ---- binding ----

  function bind_handler(handler, name, node, contents, scope, bind_to_dom) {
    // console.log("bind:", name, contents, node);
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

  function walk_dom(node, scope, c_tags) {
    var nodeType = node.nodeType;
    if (nodeType == 1 || nodeType == 9) { // Element, Document.
      // each DOM node can only be controlled by one scope.
      if (node[is_scope]) return; // DOM node is already controlled by a scope.
      node[is_scope] = true; // now controlled by manglr.
      // check if the tag has a custom handler.
      var tag = node.nodeName.toLowerCase();
      // console.log("tag: "+tag);
      var comp = c_tags[tag];
      if (comp) {
        // parse this node as a tpl, since that will correctly parse all
        // the attribute bindings and child nodes in the form we need.
        var inst_tpl = [];
        parse_tpl(node, inst_tpl, c_tags);
        create_component(document, node.parentNode, node, scope, inst_tpl, 0);
        // remove the custom-tag node from the dom.
        node.parentNode.removeChild(node);
      } else {
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
      }
    } else if (nodeType == 3) { // Text.
      var text = node.data; // CharacterData, DOM level 1.
      if (~text.indexOf('{')) {
        var text_tpl = [];
        parse_tpl(node, text_tpl, c_tags);
        console.log("TEXT:", text, text_tpl);
        spawn_dom(document, node.parentNode, node, text_tpl, scope, null);
        node.parentNode.removeChild(node);
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
    win[manglr] = {directive:register_directive, prefix:register_prefix};

    var doc = document;
    function init() {
      has_loaded = true;
      bind_to_dom(doc, Scope(null, null));
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
