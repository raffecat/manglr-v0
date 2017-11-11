// Tracing dependency tracker.
//
// Slot:
//    mutable variable; call with no arguments to read, call with
//    one argument to change the slot value.
// Property:
//    computed expression; can read slots and other properties,
//    re-evaluated after those slots/properties have changed.
// Agent:
//    mutator; can read and write slots, can read properties,
//    re-runs after those slots/properties have changed.
// View:
//    observer; can read slots and other properties, re-runs after
//    slots/properties have changed and agents have settled.
// Input:
//    mutator; can make immediate changes to slots.

// Properties, Agents and Views are effectively priorities,
// although they have additional semantics (read/write access.)

// There are two basic approaches:
// (a) call watchers immediately, meaning computed properties are always
//     up to date when scripts read them (defer display updates using
//     setTimeout) - cons: temporary states cause extra work.
// (b) defer all watchers, update computed properties after execution
//     ends (use another watcher to react to property changes)
//     - cons: is it difficult to write conditional updates?
// Option B suits a system without procedural code, where changes are
// made as units of work that depend on the previous state.
// This style of programming is -very- scalable, does not exhibit
// blocking behaviour, and infinite loops do not lock up the program.

// Compiled expressions:
// An expression will be re-written to directly access slots on a values
// object and directly record traces using literal keys.
// e.g. where V are the values and T is the trace,
//  2 * width + height -> T['s1']=1;T['s2']=1;return 2*V['width']+V['height'];

// Consider dynamic elements that move between scopes: their bindings
// must be indirect (and never folded across a scope boundary) so we can
// change them when we re-parent the element (must mark them changed.)

// Consider inactive elements and hidden visuals: these should retain
// the 'changed' state of their inputs (NB. all slot dependencies for
// the element and its child elements!)

// Note: if the slots and their readers are known in advance, we could
// generate slot vars and computed properties in a closure (and even
// call dependent readers from the mutators where there are no cycles.)
// In other words, move towards a fully generated model instead of tracing.


var ExpressionTracer = (function(){
  // Template expression compiler.
  var debug = false;

  // what syntax do we want to allow?
  // we must be able to follow dependent dot paths, so we cannot
  // allow "(anything).foo" unless we can watch "(anything)"... sigh.
  // do we need to precedence parse?
  // nope, we're going to let javascript deal with that anyway!

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

  function compile(source, returnLit) {
    var toks=source.match(tokenize), len=toks.length, pos=0,
        tok="", res=[], ok=true, paths=[], isLit=false;
    function error(msg) {
      if (ok) console.log(msg, source, res);
      ok=false;
    }
    function advance(req) {
      do {
        tok = toks[pos++]||'';
      } while(is_ws.test(tok));
      if (debug) console.log("T:", tok);
      if (req && !tok)
        error("** unexpected end of expression:");
    }
    function expr(inside) {
      // every expression is:
      //   literal
      //   dot-path
      //   ( expr )
      //   unary operator, expr
      // followed by optional:
      //   binary operator, expr
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
          var path = [tok], pre=[], elems=["(S['",tok,"']||S.$('"+tok+"'))()"];
          advance();
          while (tok == ".") {
            advance(true);
            if (!/^\w/.test(tok))
              return error("** expecting name after '.' in expression:");
            path.push(tok);
            pre.push("((");
            elems.push("||{})['",tok,"']||S.$('"+tok+"'))()");
            advance();
          }
          paths.push(path);
          res.push(pre.join("")+elems.join(""));
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
    if (ok) {
      if (debug) console.log(".. COMPILED:", res.join(" "));
      var fun = new Function("S", "return "+res.join(" ")+";");
      if (returnLit && res.length === 1 && isLit) {
        // caller wants the literal value.
        return fun();
      }
      return fun;
    } else {
      return function(){};
    }
  }

  compile("'a'");
  compile('"a"');
  compile("123");
  compile("2.05e-3");
  compile("#fff");
  compile("foo");
  compile("foo.bar");
  compile("foo.bar.baz");
  compile("a < 3");
  compile("a != 2");

  return {compile:compile};
})();


var Tracer = (function(){
  var debug = 1; // 0=none, 1=updates, 2=verbose.
  var nextId=1, changes={}, trace={};
  var propDeps={}; // sets of properties that depend on values.
  var actDeps={}; // sets of actors that depend on values.
  var viewDeps={}; // sets of views that depend on values.
  var pendProps={}; // set of properties that need updating.
  var pendActors={}; // set of actors that need updating.
  var pendViews={}; // set of views that need updating.
  var registry={}, locked=true, running=false, will_run=false;
  function bump() {
    will_run = true;
    if (debug>=2) console.log(".. *bump* will run again");
    window.setTimeout(run_schedule, 0);
  }
  // Create a slot that will defer changes until execution ends.
  function make_slot(value, name) {
    var valId='s'+(nextId++);
    if (debug) console.log(".. slot", name||'', "["+valId+"] init", value);
    propDeps[valId] = {}; // properties will register themselves here.
    actDeps[valId] = {}; // actors will register themselves here.
    viewDeps[valId] = {}; // views will register themselves here.
    function access_slot() {
      // add this slot to the current trace set.
      if (debug>=2) console.log(".. reads", name||'', "["+valId+"] :", value);
      trace[valId] = true;
      // read the slot value.
      return value;
    }
    access_slot.slotId = valId; // for expression compiler.
    access_slot.set = function(newVal) {
      if (locked) {
        // slots are locked until the first write attempt.
        // make sure listeners will run, then unlock.
        if (!(running || will_run)) bump();
        locked = false;
      }
      if (newVal !== value) {
        // change the value, schedule deps at end of execution.
        if (debug) console.log(".. slot", name||'', "["+valId+"] :", value, "->", newVal);
        value = newVal;
        changes[valId] = true;
      }
      return newVal; // for assignment chaining.
    };
    return access_slot;
  }
  // Create a computed property that will be re-evaluated after any
  // slot or computed property it depends on has changed.
  function make_property(eval_func, value, name) {
    var valId='p'+(nextId++), prevTrace={};
    if (debug) console.log(".. property", name||'', "["+valId+"] init", value);
    propDeps[valId] = {}; // properties will register themselves here.
    actDeps[valId] = {}; // actors will register themselves here.
    viewDeps[valId] = {}; // views will register themselves here.
    function read_property() {
      // add this property to the current trace set.
      trace[valId] = true;
      // read the cached property value.
      return value;
    }
    function update_property() {
      // start a new trace for this property.
      trace = {};
      try {
        // re-evaluate the property.
        var newVal = eval_func();
        if (debug) console.log(".. property", name||'', "["+valId+"] :", value, "->", newVal);
        // check if its value actually changed.
        if (newVal !== value) {
          // change the value, schedule deps at end of execution.
          value = newVal;
          changes[valId] = true;
        }
      } finally {
        // remove this property from all previous depends sets.
        for (var oldId in prevTrace) {
          var d=propDeps[oldId]; delete d[valId];
        }
        // add this property to the depends set of every value
        // we accessed during eval_func.
        for (var newId in trace) {
          propDeps[newId][valId] = true;
        }
        // keep the new trace for cleanup next time.
        prevTrace = trace;
      }
    }
    // register the property for calls from the scheduler.
    registry[valId] = update_property;
    // schedule the property to update once as soon as possible.
    pendProps[valId] = true;
    // provide the public api for reading.
    read_property.slotId = valId; // for expression compiler.
    return read_property;
  }
  // Create an actor that will execute every time one or more
  // of the slots and computed properties it reads have changed.
  function make_actor(actor_func, name) {
    var actId='a'+(nextId++), prevTrace = {};
    function run_actor() {
      // start a new trace for this actor.
      trace = {};
      try {
        // run the actor.
        if (debug) console.log(".. actor", name||'', "["+actId+"] :");
        actor_func();
      } finally {
        // remove this actor from all previous depends sets.
        for (var oldId in prevTrace) {
          var d=actDeps[oldId]; delete d[actId];
        }
        // add this property to the depends set of every value
        // we accessed during actor_func.
        for (var newId in trace) {
          actDeps[newId][actId] = true;
        }
        // keep the new trace for cleanup next time.
        prevTrace = trace;
      }
    }
    // register the actor for calls from the scheduler.
    registry[actId] = run_actor;
    // schedule the actor to run once as soon as possible.
    pendActors[actId] = true;
    // make sure the new actor will run.
    if (!(running || will_run)) bump();
  }
  // Create a view that will execute every time one or more
  // of the slots and computed properties it reads have changed.
  function make_view(view_func, name) {
    var viewId='v'+(nextId++), prevTrace = {};
    function update_view() {
      // start a new trace for this view.
      trace = {};
      try {
        // update the view.
        if (debug) console.log(".. view", name||'', "["+viewId+"] :");
        view_func();
      } finally {
        // remove this view from all previous depends sets.
        for (var oldId in prevTrace) {
          var d=viewDeps[oldId]; delete d[viewId];
        }
        // add this property to the depends set of every value
        // we accessed during view_func.
        for (var newId in trace) {
          viewDeps[newId][viewId] = true;
        }
        // keep the new trace for cleanup next time.
        prevTrace = trace;
      }
    }
    // register the view for calls from the scheduler.
    registry[viewId] = update_view;
    // schedule the view to update once as soon as possible.
    pendViews[viewId] = true;
    // make sure the new view will run.
    if (!(running || will_run)) bump();
  }
  // Report an error in a browser-friendly way.
  function report_error(e) {
    if (console && console.log) {
      console.log(e.stack || e.toString());
    }
  }
  // Call this after setting a property or directly calling a watcher
  // from outside of any watcher code (e.g. in DOM event handlers.)
  // Schedule watchers for all dirty properties, then run pending
  // watchers until none remain and all properties are clean.
  function run_schedule() {
    will_run = false; // reflects timer-scheduled state.
    if (running)
      return; // spurious call from setTimeout.
    running = true;
    //locked = false;
    try {
      // actor iterations.
      for (var a=8; a--; ) {
        // determine which items need to be re-evaluated.
        if (debug>=2) console.log(".. check changes (top)");
        for (var valId in changes) {
          for (var propId in propDeps[valId]) pendProps[propId] = true;
          for (var actId in actDeps[valId]) pendActors[actId] = true;
          for (var viewId in viewDeps[valId]) pendViews[viewId] = true;
        }
        changes = {}; // reset for next pass.
        // property iterations.
        for (var p=8; p--; ) {
          // re-compute all affected properties.
          if (debug>=2) console.log(".. update props");
          var runProps = pendProps; pendProps = {}; // read-reset.
          for (var propId in runProps) {
            if (debug) {
              registry[propId]();
            } else {
              try {
                registry[propId]();
              } catch (err_prop) {
                report_error(err_prop, "property", propId);
              }
            }
          }
          // check if any values actually changed.
          if (debug>=2) console.log(".. check changes (after props)");
          var haveWork = false;
          for (haveWork in changes) { break; }
          if (!haveWork)
            break; // exit property iterations.
          // apply changes to all property values and determine
          // which properties need to be re-evaluated.
          for (var valId in changes) {
            for (var propId in propDeps[valId]) pendProps[propId] = true;
            for (var actId in actDeps[valId]) pendActors[actId] = true;
            for (var viewId in viewDeps[valId]) pendViews[viewId] = true;
          }
          changes = {}; // reset for next pass.
        }
        // run all affected actors.
        if (debug>=2) console.log(".. run actors");
        var runActors = pendActors; pendActors = {}; // read-reset.
        for (var actId in runActors) {
          if (debug) {
            registry[actId]();
          } else {
            try {
              registry[actId]();
            } catch (err_act) {
              report_error(err_act, "actor", actId);
            }
          }
        }
        // check if any values actually changed.
        var haveWork = false;
        for (haveWork in changes) { break; }
        if (!haveWork)
          break; // exit actor iterations.
      }
      // update all affected views.
      if (debug>=2) console.log(".. run views");
      var runViews = pendViews; pendViews = {}; // read-reset.
      for (var viewId in runViews) {
        if (debug) {
          registry[viewId]();
        } else {
          try {
            registry[viewId]();
          } catch (err_view) {
            report_error(err_view, "view", viewId);
          }
        }
      }
    } finally {
      running = false; // MUST clear running.
      locked = true;   // MUST lock to catch unscheduled changes.
    }
    // re-schedule if we have any work pending.
    if (debug>=2) console.log(".. check re-schedule");
    if (!will_run) {
      var haveWork = false;
      for (haveWork in changes) { break; }
      for (haveWork in pendProps) { break; }
      for (haveWork in pendActors) { break; }
      for (haveWork in pendViews) { break; }
      if (haveWork) bump(); // run again soon.
    }
  }
  return {slot:make_slot, property:make_property,
          actor:make_actor, view:make_view};
})();


if (false) {
  // simple tests.
  var a = Tracer.slot(5, 'a');
  var b = Tracer.slot(7, 'b');
  var c = Tracer.slot(2, 'c');
  var f = Tracer.property(function(){ return a() + b(); }, 0, 'f=a+b');
  Tracer.actor(function(){ c(f()); }, 'f -> c');
  var g = Tracer.property(function(){ return f() + c(); }, 0, 'g=f+c');

  Tracer.view(function(){
    console.log("view: f + a = ", f() + a());
  });
  Tracer.view(function(){
    console.log("view: f + b = ", f() + b());
  });
  Tracer.view(function(){
    console.log("view: g = ", g());
  });

  window.setInterval(function(){
    Tracer.input(function(){
      b(b()+1);
    });
  },1000);

  window.setInterval(function(){
    Tracer.input(function(){
      a(a()+1);
    });
  },2000);
}
