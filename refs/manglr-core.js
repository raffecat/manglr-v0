manglr=(function(){
  "use strict";

  // ––~,–`~–{@   Global Helpers   @}–~,–`~––

  function F() {}
  var log = window.console ? console.log : F;
  var wsRE = new RegExp("\\s+");
  function forEach(seq,fn) { for (var i=0,n=seq?seq.length:0;i<n;i++) fn(seq[i],i); }
  function map(seq,fn) { var n=seq?seq.length:0, ret=new Array(n); for (var i=0;i<n;i++) ret[i]=fn(seq[i],i); return ret; }
  function extend(res,seq) { for (var i=0,n=seq?seq.length:0;i<n;i++) res.push(seq[i]); }
  function trim(s) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,''); }
  function words(s) { return trim(s).split(wsRE); }

  function pathOf(node) {
    var path = node.nodeName.toLowerCase();
    if (node.nodeType === 1) {
      if (node.id) path += '#'+node.id;
      var cls = node.className;
      if (cls) path += '.'+cls.replace(wsRE,'.');
    }
    while (node=node.parentNode) {
      path = node.nodeName.toLowerCase()+'/'+path;
    }
    return path;
  }

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
      if (classes !== org) log("addClass", cls, "->", elem.className);
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
      if (classes !== org) log("removeClass", cls, "->", elem.className);
    }
  }

  // ––~,–`~–{@   Manglr Core   @}–~,–`~––

  return (function(){

    var manglr = {}; // global manglr object.
    var reg_n = 0; // number of registrations.
    var handlers = {}; // registered handlers.

    manglr.forEach = forEach;
    manglr.map = map;
    manglr.extend = extend;
    manglr.trim = trim;
    manglr.words = words;
    manglr.log = log;

    function error(msg) {
      throw new Error(msg);
    }

    // entry: register a handler.
    var validAttr = new RegExp("^\\w([\\w\\d-]+)");
    manglr.reg = reg;
    function reg(attr, fn) {
      if (typeof attr !== 'string') error("manglr.reg: 1st argument must be a string (attribute name or prefix)");
      if (typeof fn !== 'function') error("manglr.reg: 2rd argument must be a function");
      if (!validAttr.test(attr)) error("manglr.reg: 1st argument is not a valid attribute name");
      if (handlers[attr]) error("manglr.reg: attempt to register duplicate attribute '"+attr+"'");
      handlers[attr] = fn;
      reg_n++;
    }

    // Incomplete.

    var queue = [], scheduled = false;
    function kick() {
      if (!scheduled) {
        scheduled = true;
        setTimeout(run, 0); // use setImmediate/postMessage.
      }
    }
    function run() {
      for (var i=0; i<queue.length; i++) queue[i]();
      queue.length = 0;
      scheduled = false;
    }

    // Where does the expression compiler part come from?
    // Is that in core, or manglr-expressions that provides it?
    // Do we use the first one, warn about unused others? Allow selected per scope?
    // Also, want expressions and pluggable filters to be built on a dependency-eval system.

    function ManglrExpression(expr) {
      var views = [];
      this.views = views;
      this.queued = false;
      this.update = function() {
        for (var i=0; i<views.length; i++) {
          var view = views[i]; view(expr);
        }
      };
    }
    ManglrExpression.prototype.view = function(fn) {
      // add the view function to the expression's views.
      this.views.push(fn);
      // queue the expression for update now.
      if (!this.queued) {
        queue.push(this.update);
        this.queued = true;
      }
    }

    function ManglrScope() {
    }
    ManglrScope.prototype.compile = function(expr) {
      return new ManglrExpression(expr);
    }
    ManglrScope.prototype.text = function(expr) {
      return new ManglrExpression(expr);
    }

    // Wrapper around a DOM node that has one or more bindings.
 
    // If any conditions are registered by bindings on the node, it will be added
    // to the DOM and its scope activated ONLY when all the conditions are true;
    // when any condition is false, the node will be deactivated and removed.

    // If one or more bindings register a repeat on the node, it will be removed
    // from the DOM and converted to a template. For each item in each repeat-expression,
    // an instance of the template will be inserted in the DOM with its own scope.
    // Conditions and other bindings on the node will become bound to the inner scope,
    // so they can access names bound by the repeat-expressions.

    function ManglrNode(elem) {
      this.domNode = elem;
      this.conds = null;
      this.fors = null;
      this.template = false;
    }
    ManglrNode.prototype.path = function() {
      return pathOf(this.domNode);
    }
    ManglrNode.prototype.cond = function(expr) {
      if (!expr || typeof expr.view !== 'function') error("manglr: argument to node.cond(expr) must be a compiled manglr expression");
      if (!this.conds) this.conds = [];
      this.conds.push(expr);
    }
    ManglrNode.prototype.repeat = function(expr) {
      if (!expr || typeof expr.view !== 'function') error("manglr: argument to node.repeat(expr) must be a compiled manglr expression");
      if (!this.fors) this.fors = [];
      this.fors.push(expr);
      this.template = true;
    }
    ManglrNode.prototype.on = function(name, fn) {
      // Listen for a DOM event on this node.
      if (this.domNode.addEventListener) {
        this.domNode.addEventListener(name, function (ev) {
          fn(ev);
          kick();
          //if (ev.stopPropagation) ev.stopPropagation(); // intercept the event.
          //if (ev.preventDefault) ev.preventDefault(); // prevent its default action.
          //ev.cancelBubble = true; // old IE stopPropagation.
          //ev.returnValue = false; // old IE prevent-default.
          //return false;
        }, false);
      } else {
        this.domNode.attachEvent('on'+name, function () { // IE7,8
          var ev = window.event;
          ev.target = ev.srcElement;
          fn(ev);
          kick();
          //ev.cancelBubble = true; // old IE stopPropagation.
          //ev.returnValue = false; // old IE prevent-default.
          //return false;
        });
      }
    }
    ManglrNode.prototype.provide = function(name, data) {
      // Provide an object on this node for ancestors to collect.
      var prov = this.domNode.manglrProvided || (this.domNode.manglrProvided=(prov={}));
      var list = prov[name] || (prov[name]=(list=[]));
      list.push(data);
    }
    ManglrNode.prototype.collect = function(name, data) {
      var res = [];
      function walk(node) {
        if (node.nodeType === 1) {
          // check for provided objects on this node.
          var prov = node.manglrProvided;
          var list = prov && prov[name];
          if (list) extend(res, list);
          // walk child nodes looking for provided objects.
          var child = node.firstChild;
          while (child) { walk(child); child = child.nextSibling; }
        }
      }
      walk(this.domNode);
      return res;
    }


    // error reporting: unknown attributes to ignore.
    var ignoreRE = new RegExp("^aria-|^data-|^\\w+$","i");

    // this gets de-optimised due to try-catch.
    function run_handler(fn, text, node, scope, suffix, attr) {
      try {
        return fn(text, node, scope, suffix);
      } catch (err) {
        var p,st; if (err.stack) st = err.stack.toString();
        if (st && (p=st.indexOf('\n'))>0 && (p=st.indexOf('\n',p+1))>0) st = st.slice(0,p).replace("\n","");
        var msg = st || err.toString();
        log("Error in Manglr plugin '"+attr+"' on tag "+node.path()+": "+msg);
      }
    }

    // entry point: attach bindings to DOM elements.
    manglr.bind = bind;
    function bind(domNode, scope) {
      //updateRegex();
      function walk(node) {
        var nodeType = node.nodeType;
        if (nodeType == 1) { // Element.
          //log("<"+node.nodeName+">");
          var wrap = null; // manglr wrapper for this Element.
          // iterate over attributes of the element.
          var attrs = node.attributes;
          for (var i=0,n=attrs.length; i<n; i++) {
            var attr = attrs[i];
            if (attr && attr.specified !== false) { // if true or missing.
              var name = attr.name;
              // check if there is a registered handler for the attribute.
              var p, h = handlers[name];
              var pre = name, suffix = name;
              if (!h && (p=name.lastIndexOf('-'))>0) {
                // look for a registered prefix handler.
                do {
                  var remain = name.slice(0,p); // up to the last dash.
                  pre = remain + '-';
                  h = handlers[pre];
                  if (h) {
                    suffix = name.slice(p+1); // after the '-'.
                    break;
                  }
                  p = remain.lastIndexOf('-');
                } while (p>0);
              }
              if (h) {
                if (!wrap) wrap = new ManglrNode(node);
                run_handler(h, attr.value, wrap, scope, suffix, pre);
              } else if (!ignoreRE.test(name)) {
                log("manglr: unrecognised attribute: '"+name+"' on tag '"+pathOf(node)+"'");
              }
            }
          }
          // iterate over child nodes, unless the node has become a template.
          if (!(wrap && wrap.template)) {
            var child = node.firstChild;
            while (child) {
              // note that bindings can remove nodes from the document,
              // so advance to the next child before applying bindings.
              var c = child;
              child = child.nextSibling;
              walk(c, scope);
            }
          }
        }
      }
      walk(domNode);
      kick();
    }

    // ––~,–`~–{@   Bootstrap   @}–~,–`~––

    if (document.readyState === "loading") {
      document.onreadystatechange = function () {
        if (document.readyState !== "loading") {
          document.onreadystatechange = null;
          bind(document.body, new ManglrScope);
        }
      }
    } else {
      error("manglr cannot be loaded async, because then it can't tell when its plugins have finished loading!");
    }

    return manglr;

  })();

})();
