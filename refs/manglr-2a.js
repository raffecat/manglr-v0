
// dom.js

function insert(node, before) {
  before.parentNode.insertBefore(node, before);
}

function remove(node) {
  node.parentNode.removeChild(node);
}

function replace(node, marker) {
  var p = node.parentNode;
  p.insertBefore(marker, node);
  p.removeChild(node);
}

function addScript(source) {
  var script = document.createElement("script");
  script.appendChild(document.createTextNode(source));
  document.getElementsByTagName("head")[0].appendChild(script);
}

function logError(message) {
  addScript('throw new Error("'+message.replace(/"/g,'\\"')+'");');
}

// manglr.js

var nextId=1, ctl={}, v={};

function Queue() {
  var schedule = [];
  var q = { run:run, create:create, suspended:false };
  function create(init, update) {
    // create an enode.
    // every enode's value is initially null.
    // when the enode's value changes, all of its deps are scheduled to update.
    if (init === undefined) init = null; // consistently use null.
    var enode = { value:init, deps:[], queued:0, update:update, set:set };
    var is_obj = (typeof(init)==='object');
    function field(name) {
      // get an enode that represents a field of this enode
      // and updates whenever that field value changes.
    }
    function list() {
      // get an enode that represents the Array in this enode,
      // and updates whenever the array contents change.

    }
    function set(value) {
      // when the value changes, schedule all deps for update.
      if (value === undefined) value = null; // consistently use null.
      var now_obj = (typeof(value)==='object');
      if (enode.value !== value || is_obj || now_obj) {
        enode.value = value;
        is_obj = now_obj;
        var deps = enode.deps;
        for (var i=0; i<deps.length; i++) {
          var dep = deps[i];
          if (!dep.queued) { dep.queued = 1; schedule.push(dep); }
        }
      }
    }
    return enode;
  }
  function run() {
    if (q.suspended) return;
    logError("running queued updates: "+schedule.length);
    // update all queued enodes, deriving a new value for the node.
    // NB. do not cache length, so new deps can be scheduled during updates.
    for (var i=0; i<schedule.length; i++) {
      var enode = schedule[i];
      enode.queued = 0; // no longer queued.
      enode.set(enode.update()); // can append to schedule; can re-queue enode.
    }
    schedule.length = 0;
    logError('finished "the" updates');
  }
  return q;
}

// loading data: walk pod data, 
// if object -> .obj(name) -> each key -> .set(field, data) ?? (leaf)
// if array  -> .list(name) -> .set(list) ?? (leaf)
// otherwise -> .set(data)

function load_data(enode, data) {
  function walk(to, value) {
    if (typeof(value)==='object') {
      if (value instanceof Array) {
        to.get(key).set_list(value);
      } else {
        // this creates enodes for every key-value in the data.
        for (var key in value) {
          walk(to.get(key), value[key]);
        }
      }
    } else {
      to.set(value);
    }
  }
  walk(enode, data);
}

function make_follower(src) {
  // capture 'src' enode in a closure.
  function follow_value_update() {
    return src.value;
  }
  return follow_value_update;
}

function Scope(parent) {
  var binds = Queue();
  var ns = {}; // local bindings.
  var ups = {}; // bindings to parent nodes.
  function suspend() {
    binds.suspended = true;
  }
  function resume() {
    binds.suspended = false;
    // TODO: should schedule the scope for update later.
    binds.run(); // update all queued enodes.
  }
  function local(name) {
    // get a locally scoped enode (separate from enclosing scopes)
    // this is used to bind the local name in an 'each' directive (known on scope create)
    // and also for 'set-foo=' directives (anywhere inside the scope)
    var enode = ns[name];
    if (enode != null) {
      // the name has already been used in 'get'; we need to detach it from
      // following the parent's enode and attach it to the one supplied.
      enode.update = make_follower(enode);
      // and now we must schedule the existing enode to update.
      enode.set(to.value);
    } else {
      // bind the name in this scope to the target enode.
      ns[name] = to;
    }
  }
  function get(name) {
    // get an enode from this namespace (or enclosing namespace)
    // that represents a named value available in this scope.
    // BUT: if we get a node from the parent scope now, and later something binds
    // that name in this scope, we need to break the connection.
    var enode = ns[name];
    if (enode != null) return enode;
    var follow = parent ? parent.get(name) : null;
    if (follow) {
      enode = binds.create(null, make_follower(follow));
      enode.following = follow;
      follow.deps.push(enode); // enode depends on followed node.
    } else {
      enode = binds.create(null, null); // constant null! (TODO: what?)
    }
    ns[name] = enode;
    return enode;
  }
  return { get:get, local:local, run:binds.run, create:binds.create, suspend:suspend, resume:resume };
}

function make_getter(src, field) {
  // capture 'src' and 'field' in a closure.
  function get_field_update() {
    // retrieve field from the src enode's value.
    var value = src.value;
    var result = (value != null) ? value[field] : null;
    if (result === undefined) result = null;
    return result;
  }
  return get_field_update;
}

function get_field(scope, src, field) {
  // get a field of an enode by creating a dependent field-reader.
  var enode = scope.create(null, make_getter(src, field));
  src.deps.push(enode); // enode depends on src.
  return enode;
}

function get_path(scope, path) {
  var names = path.split('.');
  var from = null;
  for (var i=0; i<names.length; i++) {
    var name = names[i];
    if (name) {
      if (!from) from = scope.get(name);
      else from = get_field(scope, from, name);
    }
  }
  if (!from) from = scope.create(null, null); // constant null.
  return from;
}

function compile_expr(scope, expr) {
  // generate code for an expression.
  // TODO: more than paths.
  return get_path(scope, expr);
}

function make_stringify(expr) {
  return { toString: function(){
    var value = expr.value;
    return value != null ? value.toString() : '';
  }};
}

function compile_text(scope, text, watcher) {
  // create an enode for an attribute value or text node.
  var tpl = [];
  var ofs = 0;
  for (;;) {
    var mark = text.indexOf('{{', ofs);
    if (mark === -1) break;
    var end = text.indexOf('}}', mark+2);
    if (end === -1) break;
    if (mark > ofs) {
      tpl.push(text.substring(ofs, mark));
    }
    if (end > mark+2) {
      var expr = text.substring(mark+2, end);
      var enode = compile_expr(scope, expr);
      enode.deps.push(watcher); // watcher depends on this enode.
      tpl.push(make_stringify(enode));
    }
    ofs = end+2;
  }
  if (text.length > ofs) {
    tpl.push(text.substring(ofs));
  }
  console.log("tpl:", tpl);
  return tpl;
}

function make_dom_text_setter(textNode, tpl) {
  function dom_text_update() {
    var value = tpl.join("");
    console.log("text: set to:", value);
    textNode.nodeValue = value;
  }
  return dom_text_update;
}

function make_dom_prop_setter(elem, name, expr) {
  function dom_prop_update() {
    console.log("prop: set '"+name+"' to:", expr.value);
    elem[name] = expr.value;
  }
  return dom_prop_update;
}

var ATTR_RE = new RegExp("^v-(.*)");

function bind_template(node, scope) {
  // parse the DOM nodes and create bindings.
  // create and return an inner scope to manage lifetime and activation.
  // attach the inner scope to the outer scope for destroy and suspend.
  // NB. fix duplicate 'id' attributes.
  var scope = Scope(null);
  scope.node = node; // for 'if' and 'each'.
  function walk(el) {
    var tt = el.nodeType;
    if (tt === 1) {
      // Element: bind node properties to expressions.
      var claimed = false;
      var attrs = el.attributes;
      var attrRE = ATTR_RE;
      if (attrs) {
        for (var i=0; i < attrs.length; i++) {
          var attr = attrs[i];
          var m = attrRE.exec(attr.name);
          if (m) {
            var name = m[1];
            console.log("attr: "+name);
            var handler = v[name];
            if (handler) {
              // Not quite solid: if a handler claims the node (makes it a template)
              // then we must defer binding the handlers until instances are created.
              // Likewise, when a node has conditions attached we should defer all
              // of its attribute bindings until the conditions evaluate true;
              // dispatch a mount event to all bindings under the node; dispatch a
              // dismount event before removing the node (allow handlers to delay it
              // for animations)
              var expr = compile_expr(scope, attr.value);
              var claims = handler(el, expr, scope);
              if (claims) claimed = true;
            } else {
              var expr = compile_expr(scope, attr.value);
              var watcher = scope.create(null, make_dom_prop_setter(el, name, expr));
            }
          }
        }
      }
      // walk and bind child nodes.
      if (!claimed) {
        for (var c=el.firstChild; c; c=c.nextSibling) walk(c);
      }
    } else if (tt === 3) {
      // Text: bind as an expression if it contains placeholders.
      var text = el.nodeValue;
      if (text && text.indexOf('{{') !== -1) {
        // create a watcher enode; compile the text-template, making the watcher
        // depend on all embedded expressions; updating the watcher joins the text.
        var watcher = scope.create(null, null);
        var tpl = compile_text(scope, text, watcher);
        watcher.update = make_dom_text_setter(el, tpl);
      }
    }
  }
  walk(node);
  scope.run();
  return scope;
}

ctl['if'] = function (node, expr, scope) {
  // conditionally instantiate a template when expr is true-ish.
  var marker = document.createTextNode('');
  var inner = bind_template(node, scope); // parse and bind attributes.
  var is_in = true;
  expr.val(function(value) {
    if (value) {
      if (!is_in) {
        // insert the template into the dom.
        is_in = true;
        replace(marker, node);
        // begin updating bindings inside the template.
        inner.resume();
      }
    } else {
      if (is_in) {
        // remove the template from the dom.
        is_in = false;
        replace(node, marker);
        inner.suspend();
      }
    }
  });
  return true; // take ownership of the DOM sub-tree.
};

ctl['each'] = function (node, expr, scope) {
  // instantiate a template for each item in an array value.
  var as = node.getAttribute('v-as') || '$';
  var marker = document.createTextNode('');
  replace(node, marker); // remove template from dom.
  var cache = {}; // spawned template instances by key.
  var order = []; // instance keys in current order.
  var neword = [];
  expr.list(function(list) {
    // iterate over the value array and ensure a template instance exists for each item.
    var changed = false;
    var len = list ? list.length : 0;
    // first, detect changes without accessing the DOM.

    // this could be vastly simplified by working with wrapper objects,
    // such that every item in every list is an object of a similar shape,
    // and every such object alredy has a unique id on it.
    // actually this is necessary for inner scopes to update properly.
    // remember that we work with bindings (to things), not values.

    for (var i=0; i<len; i++) {
      var item = list[i];
      // derive a unique key for each item.
      // for objects, add a unique id to the object so the value array can be re-ordered.
      if (typeof(item)==='object') {
        var key = item['$$manglr_id']; // unique string.
        if (!key) {
          key = 'u'+(nextId++);
          item['$$manglr_id'] = key;
        }
        neword[i] = key; // objects by string-key.
        if (order[i] !== key) changed = true;
      } else {
        neword[i] = item; // non-objects by value.
        if (order[i] !== item) changed = true;
      }
    }
    if (changed) {
      // walk through the DOM nodes, moving or inserting instances.
      neword.length = len; // truncate (recycled array)
      var after = marker;
      var parent = marker.parentNode;
      for (var i=0; i<len; i++) {
        // move the existing instance to this position, or
        // create an instance if one does not exist for this key.
        var item = list[i];
        var inner = cache[key];
        if (inner == null) {
          var inst = node.cloneNode(true); // deep copy the DOM tree.
          inner = bind_template(inst, scope); // parse and bind attributes.
          var iter = inner.local(as); // bind 'as' name in the inner scope.
          iter.set(item);
          cache[key] = inner;
        }
        // insert the inner-scope's node after the 'after' node.
        // this becomes the new 'after' node.
        // TODO: scopes must contain a list of nodes (e.g. 'each' inside 'each')
        // ALSO: must update the inner scope (so it can update its node list) before inserting here?
        parent.insertBefore(inner.node, after.nextSibling);
        after = inner.node;
      }

      if (order[i] !== key) {
        // spawn an instance for this item unless we already have one.
      }
      var t = order; order = neword; neword = t; // swap (recycle arrays)
    }
  });
  return true; // take ownership of the DOM sub-tree.
};

// fix for old browsers.
document.createElement('template');

// bootstrap.
if (document.readyState !== "loading") {
  bind_template(document.body);
} else {
  document.onreadystatechange = function () {
    if (document.readyState !== "loading") {
      document.onreadystatechange = null;
      bind_template(document.body);
    }
  }
}

return {v:v, ctl:ctl, error:logError}
