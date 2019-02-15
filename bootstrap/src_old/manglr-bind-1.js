;(function(){

  var manglr = 'manglr';
  var is_scope = manglr+'_s';
  var is_tpl = manglr+'_t';
  var std_attr = new RegExp("^http-equiv$|^data-.*|^aria-.*");
  var prefix_re;
  var hasOwn = Object.prototype.hasOwnProperty;
  var tags = {};
  var directives = {};
  var prefixes = {};
  var prefixes_dirty = true;

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
    'manglr-bind.js must be loaded first!',
    'no handler registered for custom attribute "@1"',
    'error thrown in handler "@1":',
    'duplicate tag "@1" registered:',
    'duplicate directive "@1" registered:',
    'duplicate prefix "@1" registered:',
  ];

  function error(node, n, name, err) {
    console.log(manglr+': '+(error_msgs[n]||n).replace(/@1/g,name), node, err);
  }

  // ---- scopes ----

  var nextSid = 1;

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

  function bind_to_dom(node, scope) {
    if (prefixes_dirty) rebuild_prefixes();
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
          bind_to_dom(child, scope);
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

  // ---- init ----

  function register(name, handler, set, n) {
    if (set[name]) error(document, n, name);
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

  var win = window;
  if (win[manglr]) error(win, 0);
  win[manglr] = {tag:register_tag, directive:register_directive, prefix:register_prefix};
  win = null; // GC.

  var doc = document;
  if (doc.readyState == 'loading') {
    // defer until (non-async) scripts have loaded so manglr plugins can register.
    doc.addEventListener('DOMContentLoaded', function(){
      bind_to_dom(doc, Scope());
      doc = null; // GC.
    });
  } else {
    bind_to_dom(doc, Scope());
    doc = null; // GC.
  }

})();
