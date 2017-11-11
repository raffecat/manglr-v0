(function(){


// Little scheduler

var scheduled = false;
var tasks = [];

function later(fn) {
  tasks[tasks.length] = fn;
  if (!scheduled) {
    scheduled = true;
    setTimeout(function(){
      scheduled = false;
      var queue = tasks; tasks = [];
      for (var i=0,n=queue.length;i<n;i++) {
        queue[i]();
      }
    },0);
  }
}


// Lab sheet

var LibraryType = {id:'Library'};
var lib = {id:'lib',type:LibraryType};
var slots = [0];
var nextId = 1;

function path_of(obj) {
  var path = obj.id;
  for (var o = obj.parent; o; o = o.parent) {
    path = o.id + '.' + path;
  }
  return path;
}

function type_path_of(obj) {
  return path_of(obj.type)+' '+path_of(obj);
}

function error(obj, msg) {
  console.log(type_path_of(obj)+': '+msg);
}

function spawn(defs, parent, ids) {
  for (var i=0,n=defs.length;i<n;i++) {
    var def = defs[i], id = def.id || ('_'+(nextId++));
    ids[id] = create(id, def, parent);
  }
}

function spawn_or_resolve(map, result, parent, ids) {
  for (var name in map) {
    var def = map[name], id = def.id || parent.id+':'+name;
    if (typeof def === 'string') {
      // dot path to resolve from the internal id namespace.
      result[name] = resolve(ids, def.split('.'));
    } else {
      // instance to add to the internal id namespace.
      var inst = create(id, def, parent);
      ids[id] = inst;
      result[name] = inst;
    }
  }
}

function create(id, def, parent) {
  var type = resolveType(def.type);
  if (!type) return;
  // create a net node for the instance.
  var ids = {}, exports = {}, provides = {};
  var obj = {id:id, type:type, parent:parent,
             ids:ids, exports:exports, provides:provides, inputs:{}};
  console.log("create:", type_path_of(obj));
  // create defs inside the prototype.
  var defs = type.defs;
  if (defs) spawn(defs, obj, ids);
  // create exports or resolve export paths.
  var exps = type.exports;
  if (exps) spawn_or_resolve(exps, exports, obj, ids);
  // create interfaces or resolve paths.
  var provs = type.provides;
  if (provs) spawn_or_resolve(provs, provides, obj, ids);
  // apply bindings to the exported endpoints.
  var binds = def.bind;
  if (binds) bind(obj, binds);
  // run the js init to set up browser bindings.
  if (type.init) {
    // defer init until bindings have been set up.
    later(function(){
      type.init(obj, def);
    });
  }
  return obj;
}

function resolveType(name) {
  var type = resolve(lib, name.split('.'));
  if (!type) error(lib, "Cannot resolve type: "+name);
  return type;
}

function bind(obj, binds) {
  // defer bindings so other ids can be mapped first.
  later(function(){
    var type = obj.type, inputs = obj.inputs, scope = obj.ids;
    for (var key in binds) {
      var bind = binds[key], binder = inputs[key];
      if (!binder) { error(obj, "no such input: "+key); continue; }
      var ident = id+'.'+key;
      var dep = compile(bind.toString());
      if (dep.isPath) {
        // fold expression down to the named dep.
        dep = resolve(scope, paths[0]) || {subs:[]};
      } else {
        // resolve paths in the compiled binding.
        var args = [], paths = dep.paths;
        for (var i=0,n=paths.length;i<n;i++) {
          var endpt = resolve(scope, paths[i]) || {subs:[]};
          args[i] = endpt;
          endpt.subs.push(dep);
        }
        dep.args = args; // for binder.
      }
      binder(dep);
    }
  });
}

function resolve(context, path) {
  // follow a dot path to find its endpoint.
  var endpt = context[path[0]];
  if (!endpt) {
    console.log("No match:", path[0]);
    return null;
  }
  for (var i=1,n=path.length;i<n;i++) {
    var seg=path[i], exports=endpt.exports;
    var sym = exports && exports[seg];
    if (!sym) {
      console.log("No such export '"+seg+"' in:", path.slice(0,i).join('.'));
      return null;
    }
    endpt = sym;
  }
  return endpt;
}


// Expressions

var compile = (function(){
  // Dependent expression compiler.
  var debug = 1;

  var squote = "'[^\\\\']*(?:\\\\.[^\\\\']*)*'?",
    dquote = '"[^\\\\"]*(?:\\\\.[^\\\\"]*)*"?',
    number = "\\d+(?:\\.\\d+)?(?:[eE]-?\\d+)?",
    color = "#[\\dA-Fa-f]+",
    symbols = "==|!=|<=|>=", // multi-char tokens.
    tokenize = new RegExp(squote+"|"+dquote+"|"+number+
      "|"+color+"|\\w[\\w\\d]*|"+symbols+"|\\s+|.", "g"),
    is_ws = new RegExp("^\\s"),
    is_lit = new RegExp("^['\"#\\d]"),
    is_word = new RegExp("^\\w");

  var binaryOps = {
    "==":"==", "!=":"!=", "<=":"<=", ">=":">=", "||":"||", "&&":"&&",
    "<":"<", ">":">", "+":"+", "-":"-", "*":"*", "/":"/", "%":"%"
  };
  var unaryOps = {
    "-":"-", "+":"+", "!":"!"
  };

  function compile(source) {
    var toks=source.match(tokenize), len=toks.length, pos=0,
        tok="", res=[], paths=[], isLit=false, err=null;
    function error(msg) {
      if (!err) {
        err = {message:msg, source:source, parse:res};
        if (debug) console.log(msg, source, res);
      }
    }
    function advance(req) {
      do {
        tok = toks[pos++]||'';
      } while(is_ws.test(tok));
      if (debug >= 2) console.log("T:", tok);
      if (req && !tok)
        error("** unexpected end of expression:");
    }
    function expr(inside) {
      if (is_lit.test(tok)) {
        // literal.
        var ch = tok.charAt(0);
        if (ch == "'") {
          if (tok.charAt(tok.length-1) != "'")
            return error("** missing ' in expression:");
        } else if (ch == '"') {
          if (tok.charAt(tok.length-1) != '"')
            return error("** missing \" in expression:");
        } else if (ch == '#') {
          tok = "0x" + tok.substring(1);
        }
        isLit = true; // for literal return.
        res.push(tok);
        advance();
      } else if (is_word.test(tok)) {
        // dot-path or keyword literal.
        if (tok == "true" || tok == "false" || tok == "null") {
          isLit = true; // for literal return.
          res.push(tok);
          advance();
        } else {
          var path = [tok];
          advance();
          while (tok == ".") {
            advance(true);
            if (!/^\w/.test(tok))
              return error("** expecting name after '.' in expression:");
            path.push(tok);
            advance();
          }
          res.push(paths.length); // insert a path.
          paths.push(path);
        }
      } else if (tok == "(") {
        // sub-expression.
        res.push("(");
        advance(true);
        expr(true);
        // closing ')' must follow
        if (tok == ")") { advance(); }
        else { error("** missing ) in expression:"); }
        res.push(")");
      } else {
        // must be a unary operator.
        if (!unaryOps[tok])
          return error("** syntax error at '"+tok+"' in expression:");
        res.push(tok);
        advance(true);
        expr(inside);
      }
      // following token, if any, must be a binary operator or ")"
      if (tok == ")") {
        // end inner expression
        if (!inside)
            return error("** missing ( in expression:");
      } else if (pos < len) {
        // must be a binary operator.
        if (!binaryOps[tok])
          return error("** syntax error at '"+tok+"' in expression:");
        res.push(tok);
        advance(true);
        expr(inside);
      }
    }
    advance(true);
    expr();
    if (err) {
      return {error:err};
    }
    if (debug) console.log(".. COMPILED:", res.join(" "), paths,
      (res.length===1 && paths.length===1 ? "path-only" : ""));
    var fn = new Function("$", "return "+res.join(" ")+";");
    function emit(resolver) {
      // emit code to evaluate the expression.
      // resolver comes from a net trace and pulls the dep into
      // the trace by adding bindings to temporary vars.
      var args = [], result = [];
      for (var i=0,n=paths.length;i<n;i++) {
        args[i] = resolver(paths[i]);
      }
      for (var i=0,n=res.length;i<n;i++) {
        var snip = res[i];
        if (typeof snip === 'Number') {
          // emit code for a resolved path.
          result[i] = args[snip].emit(resolver);
        } else {
          result[i] = snip;
        }
      }
      return result;
    }
    var result = {fn:fn, paths:paths, emit:emit};
    if (res.length === 1) {
      if (isLit) {
        // single literal value.
        result.isConst = true;
        result.val = fn();
      } else if (paths.length === 1) {
        // single path expression.
        result.isPath = true;
      }
    }
    return result;
  }

  return compile;
})();


// Library

for (var sym in JSDOMLib) {
  var def = JSDOMLib[sym];
  def.id = sym; def.parent = lib;
  lib[sym] = def;
}

lib["ValueLatch"] = {
  init: function(self, def) {
    // so here we are in a net somewhere which should be passed in so
    // we can create and resolve things in the network. what do we do?
    var pval = {type:def.of, value:undefined}, subs=[];
    self.subs = subs; // manual bind implementation.
    self.provides["Value"] = pval;
    self.provides["NotifyReady"] = {type:def.of, subs:subs};
    self.inputs["value"] = function ValueLatch_binder(dep) {
      self.binding = dep;
    };
    self.generate = function ValueLatch_emit(net) {
      //
    };
    self.trace = function ValueLatch_in(net) {
      // trace an input through the latch.
    };
    self.emit = function ValueLatch_emit(net) {
      // emit code to access this latch inside a trace.
      // first register the latch in the net.
    };
  }
};

lib['Handler'] = {
  init: function(self, def, parent) {
    var update = def.update;
    if (!update) return error(self, "missing update function");
    self.depends = [];
    self.subs = [];
    // attach a dependency to this endpoint.
    self.subscribe = function subscribe_input_handler(dep) {
      self.subs.push(dep);
      // push later when the dep is ready to receive.
      later(function(){
        if (self.val !== undefined) dep.push();
      });
    };
    // bind this endpoint to an expression.
    // for properties, binding is always input side.
    self.bind = function bind_input_handler(dep) {
      // TODO: unbind self if already bound.
      if (dep.isConst) {
        // binding will not change, update now.
        self.val = dep.val;
        return update(parent, dep.val);
      }
      if (dep.isPath) {
        // direct reference to another endpoint.
        dep = resolve(scope, dep.paths[0]);
        self.depends.push(dep);
        dep.subscribe(self);
        self.push = function() {
          console.log("push", self.id);
          var val = dep.val;
          if (val !== self.val) {
            self.val = val;
            update(parent, val);
          }
          // push all deps.
          var subs=self.subs;
          for(var i=0,n=subs.length;i<n;i++) subs[i].push();
        };
      } else {
        // indirect reference to deps via expression.
        var paths = dep.paths, args = [];
        for (var i=0,n=paths.length;i<n;i++) {
          var endpt = resolve(scope, dep.paths[i]);
          args[i] = endpt;
          self.depends.push(endpt);
          endpt.subscribe(self);
        }
        var fn = dep.fn;
        // push ignores the pushed value because the compiled fn
        // will read the current value of each dep.
        // FIXME: runs once per dep change synchronously.
        self.push = function() {
          console.log("push", self.id);
          var val = fn(args);
          if (val !== self.val) {
            self.val = val;
            update(parent, val);
          }
          // push all deps.
          var subs=self.subs;
          for(var i=0,n=subs.length;i<n;i++) subs[i].push();
        };
      }
    };
    return;
  }
};


// UI Lib

var ss = document.createElement("STYLE");
ss.innerText = ".ui-box { position:absolute; border:1px solid red; }";
document.body.appendChild(ss);


lib['ui'] = {id:'ui', type:LibraryType, parent:lib,
  exports: {
    Box: {
      exports: {
        left: {type:'JSValIn', update:function(self,val){ self.elem.style.left=val+'px'; }},
        top: {type:'JSValIn', update:function(self,val){ self.elem.style.top=val+'px'; }},
        right: {type:'JSValIn', update:function(self,val){ self.elem.style.right=val+'px'; }},
        bottom: {type:'JSValIn', update:function(self,val){ self.elem.style.bottom=val+'px'; }},
        width: {type:'JSValIn', update:function(self,val){ self.elem.style.width=val+'px'; }},
        height: {type:'JSValIn', update:function(self,val){ self.elem.style.height=val+'px'; }},
        color: {type:'JSValIn', update:function(self,val){ self.elem.style.color='#'+val.toString(16); }}
      },
      init: function(self) {
        var elem = document.createElement("DIV");
        elem.setAttribute("class", "ui-box");
        document.body.appendChild(elem);
        self.elem = elem;
      }
    }
  }
};

// Test

var spec = [
  {id:'anchor', type:'ValueLatch', of:'Number', bind:{value:20}},
  {id:'foo', type:'ui.Box', bind:{
   left:'anchor', top:20, width:20, height:20, color:'#f00'
  }},
  {id:'bar', type:'ui.Box', bind:{
   left:'anchor + 40', top:20, width:20, height:20, color:'#0f0'
  }}
];

var sheet = {};
spawn(spec, null, sheet);


})();
