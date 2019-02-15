;(function(){

  var manglr = 'manglr';
  var is_scope = manglr+'_s';
  var is_tpl = manglr+'_t';
  var std_attr = new RegExp("^http-equiv$|^data-.*|^aria-.*");
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

  function Scope() {
    return {id:'s'+(nextSid++), com:{}};
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

  function walk_dom(node, scope) {
    var nodeType = node.nodeType;
    if (nodeType == 1 || nodeType == 9) { // Element, Document.
      // each DOM node can only be controlled by one scope.
      if (node[is_scope]) return; // DOM node is already controlled by a scope.
      node[is_scope] = scope.id; // now controlled by manglr.
      // check if the tag has a custom handler.
      var tag = node.nodeName.toLowerCase();
      // console.log("tag: "+tag);
      var tag_hand = tags[tag];
      if (tag_hand) {
        // custom binding handler.
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
          walk_dom(child, scope);
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
    walk_dom(node, scope);
  }

  // ---- registration ----

  function register(name, handler, set, n) {
    var d = document;
    if (has_loaded) error(d, 10, name);
    if (set[name]) error(d, n, name);
    set[name] = handler;
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

  var win = window;
  if (win[manglr]) error(win, 0);
  win[manglr] = {tag:register_tag, directive:register_directive, prefix:register_prefix};

  var doc = document;
  function init() {
    has_loaded = true;
    bind_to_dom(doc, Scope());
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
