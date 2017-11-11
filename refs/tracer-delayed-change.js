
// Lessons learned:
// There are two approaches:
// (a) call watchers immediately, meaning computed properties are always
//     up to date when scripts read them (defer display updates using
//     setTimeout) - cons: temporary states cause extra work.
// (b) defer all watchers, update computed properties after execution ends
//     (use another watcher to react to computed properties)
//     - cons: is it difficult to write conditional updates?
// Option B suits a system without procedural code, where changes are
// made as units of work that depend on the previous state.
// This style of programming is -very- scalable, does not exhibit
// blocking behaviour, and infinite loops do not lock up the program.

// Tracing dependency tracker.
var Tr = (function(){
  var nextId=1, values={}, changes={}, trace={};
  var propDeps={}; // sets of properties that depend on values.
  var actDeps={}; // sets of actors that depend on values.
  var viewDeps={}; // sets of views that depend on values.
  var pendProps={}; // set of properties that need updating.
  var pendActors={}; // set of actors that need updating.
  var pendViews={}; // set of views that need updating.
  var registry={}, locked=true, running=false, will_run=false;
  function bump() {
    will_run = true;
    window.setTimeout(run_schedule, 0);
  }
  // Create a slot that will defer changes until execution ends.
  function make_slot(init_value, name) {
    var valId='s'+(nextId++);
    values[valId] = init_value; // initial value.
    console.log(".. slot", name||'', "["+valId+"] :", init_value);
    propDeps[valId] = {}; // properties will register themselves here.
    actDeps[valId] = {}; // actors will register themselves here.
    viewDeps[valId] = {}; // views will register themselves here.
    function access_slot(newVal) {
      var oldVal = values[valId];
      if (!arguments.length) {
        // add this slot to the current trace set.
        trace[valId] = true;
        // read the slot.
        return oldVal;
      }
      if (locked) {
        // cannot write to any slot during read-only execution.
        throw "read-only";
      }
      if (newVal !== oldVal) {
        // schedule change at end of execution.
        changes[valId] = newVal;
        console.log(".. slot", name||'', "["+valId+"] :", oldVal, "->", newVal);
      }
      return newVal; // for assignment chaining.
    }
    // provide the public api for reading/writing.
    return access_slot;
  }
  // Create a computed property that will be re-evaluated after any
  // slot or computed property it depends on has changed.
  function make_property(eval_func, init_value, name) {
    var valId='p'+(nextId++), prevTrace={};
    values[valId] = init_value; // initial value.
    console.log(".. property", name||'', "["+valId+"] :", init_value);
    propDeps[valId] = {}; // properties will register themselves here.
    actDeps[valId] = {}; // actors will register themselves here.
    viewDeps[valId] = {}; // views will register themselves here.
    function read_property() {
      // add this property to the current trace set.
      trace[valId] = 1;
      // read the cached property value.
      return values[valId];
    }
    function update_property() {
      // start a new trace for this property.
      trace = {};
      try {
        var oldVal = values[valId];
        // re-evaluate the property.
        var newVal = eval_func();
        console.log(".. property", name||'', "["+valId+"] :", oldVal, "->", newVal);
        // check if its value actually changed.
        if (newVal !== oldVal) {
          // schedule change at end of execution.
          changes[valId] = newVal;
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
        console.log(".. actor", name||'', "["+actId+"] :");
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
    if (!will_run) bump();
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
        console.log(".. view", name||'', "["+viewId+"] :");
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
    if (!will_run) bump();
  }
  // Call this after setting a property or directly calling a watcher
  // from outside of any watcher code (e.g. in DOM event handlers.)
  // Schedule watchers for all dirty properties, then run pending
  // watchers until none remain and all properties are clean.
  function run_schedule() {
    will_run = false; //
    if (running)
      return; // spurious call from setTimeout.
    running = true;
    try {
      // actor iterations.
      for (var a=8; a--; ) {
        // apply changes to all modified slots and determine
        // which properties need to be re-evaluated.
        for (var valId in changes) {
          values[valId] = changes[valId];
          for (var propId in propDeps[valId]) pendProps[propId] = true;
          for (var actId in actDeps[valId]) pendActors[actId] = true;
          for (var viewId in viewDeps[valId]) pendViews[viewId] = true;
        }
        changes = {}; // reset for next pass.
        // property iterations.
        for (var p=8; p--; ) {
          // re-compute all affected properties.
          for (var propId in pendProps) {
            registry[propId]();
          }
          pendProps = {}; // reset for next pass.
          // check if any values actually changed.
          var haveWork = false;
          for (haveWork in changes) { break; }
          if (!haveWork)
            break; // exit property iterations.
          // apply changes to all property values and determine
          // which properties need to be re-evaluated.
          for (var valId in changes) {
            values[valId] = changes[valId];
            for (var propId in propDeps[valId]) pendProps[propId] = true;
            for (var actId in actDeps[valId]) pendActors[actId] = true;
            for (var viewId in viewDeps[valId]) pendViews[viewId] = true;
          }
          changes = {}; // reset for next pass.
        }
        // run all affected actors.
        locked = false;
        try {
          for (var actId in pendActors) {
            registry[actId]();
          }
          pendActors = {}; // reset for next pass.
        } finally {
          locked = true; // MUST re-lock.
        }
        // check if any values actually changed.
        var haveWork = false;
        for (haveWork in changes) { break; }
        if (!haveWork)
          break; // exit actor iterations.
      }
      // update all affected views.
      for (var viewId in pendViews) {
        registry[viewId]();
      }
      pendViews = {}; // reset for next pass.
    } finally {
      running = false; // MUST clear running.
    }
    // re-schedule if we have any work pending.
    var haveWork = false;
    for (haveWork in changes) { break; }
    for (haveWork in pendProps) { break; }
    for (haveWork in pendActors) { break; }
    for (haveWork in pendViews) { break; }
    if (haveWork) bump(); // run again soon.
  }
  // Run an input function, giving it write access to slots,
  // then run the scheduler to update views.
  function run_input(input_func) {
    locked = false;
    try {
      input_func();
    } finally {
      locked = true; // MUST re-lock.
    }
    run_schedule();
  }
  return {slot:make_slot, property:make_property,
          actor:make_actor, view:make_view, input:run_input};
})();


var a = Tr.slot(5, 'a');
var b = Tr.slot(7, 'b');
var c = Tr.slot(2, 'c');
var f = Tr.property(function(){ return a() + b(); }, 0, 'f=a+b');
Tr.actor(function(){ c(f()); }, 'f -> c');
var g = Tr.property(function(){ return f() + c(); }, 0, 'g=f+c');

Tr.view(function(){
  console.log("view: f + a = ", f() + a());
});
Tr.view(function(){
  console.log("view: f + b = ", f() + b());
});
Tr.view(function(){
  console.log("view: g = ", g());
});

window.setTimeout(function(){
  console.log("---");
  Tr.input(function(){
    b(8);
  });
},0);

window.setTimeout(function(){
  console.log("---");
  Tr.input(function(){
    a(20);
  });
},10);
