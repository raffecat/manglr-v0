// Mini FRP

exports.observable = observable;
exports.computed = computed;
exports.view = view;
exports.action = action;


// -- Graph State (naughty globals)

var strict = false;
var in_action = 0;
var read_nodes = null;
var act_queue = null;


// -- Helpers

function contains(seq, item) {
  for (var n=seq.length, i=0; i < n; i++) {
    if (seq[i] === item) return true;
  }
  return false;
}

function remove_one(seq, item) {
  for (var n=seq.length, i=0; i < n; i++) {
    if (seq[i] === item) {
      dep_set.splice(i, 1); // remove element i.
      break; // only remove one.
    }
  }
}

function find_and_clear(seq, item) {
  for (var n=seq.length, i=0; i < n; i++) {
    if (seq[i] === item) {
      seq[i] = null; // mark element as removed.
      break; // only remove one.
    }
  }
}

function call_and_gc(seq, method, arg) {
  var wr = 0; // write position.
  for (var n=seq.length, i=0; i < n; i++) {
    var item = seq[i];
    if (item !== null) { // not a removed entry?
      seq[wr++] = item;  // write early to avoid read-follows-write.
      item[method](arg);
    }
  }
  seq.length = wr; // trim to match last write.
}


// -- Action

function run_queue() {
  // deliver all pending ready values.
  var acts = act_queue;
  for (var i=0; i < acts.length; i++) {
    acts[i].push_();
  }
}

function action(fn) {
  // a transaction is always performed atomically.
  // TODO: hold back rdy_ notifications until the end of the transaction.
  // TODO: do we force a Computed to update on read, then adjust its wait count?
  ++in_action;
  try {
    fn();
  } catch (e) {
    if (--in_action === 0) run_queue();
    throw e;
  }
}


// -- Observable

function Observable(value) {
  this.value_ = value; // initial value.
  this.new_value_ = value; // so it has the same type.
  this.pending_ = false; // in pending state?
  this.dependents_ = []; // nodes that depend on us.
}
Observable.prototype.get = function() {
  if (read_nodes) {
    // running inside a computed or a transaction.
    if (!contains(read_nodes, this)) {
      read_nodes.push(this);
    }
    return this.value_;
  } else {
    // random access: strict mode should disallow.
    if (in_action || !strict) {
      return this.value_;
    }
    throw new Error("attempt to read an Observable outside of an action");
  }
};
Observable.prototype.set = function(value) {
  if (value !== this.value_) {
    // the value of this observable has changed.
    // however, do not publish the change until we enter ready state.
    this.new_value_ = value;
    // change node state: idle -> pending (cycle-safe)
    if (!this.pending_) {
      this.pending_ = true;
      // propagate the pending update to every node that depends on us.
      call_and_gc(this.dependents_, 'pend_');
      if (act_queue) {
        // running inside a transaction, action, computed or view.
        // delay the transition to ready state.
        act_queue.push(this);
      } else {
        // running outside of any scheduler.
        // synchronously update dependents now.
        this.rdy_();
      }
    }
  }
};
Observable.prototype.push_ = function() {
  // change node state: pending -> ready.
  if (this.pending_) {
  } else {
    throw new Error("Observable is not pending");
  }
};

function observable(value) {
  return new Observable(value);
}


// -- Computed

function Computed(fn) {
  this.fn_ = fn;
  this.wait_ = 0;
  this.pending_ = false; // in pending state?
  this.dirty_ = false; // in dirty state?
  this.value_ = void 0;
  this.dep_on_ = []; // nodes we depend on.
  this.dependents_ = []; // nodes that depend on us.
}
Computed.prototype.pend_ = function() {
  // one of the nodes we depend on has entered pending state.
  // track the number of nodes we are waiting for.
  ++this.wait_;
  // change node state: idle -> pending.
  if (!this.pending_) {
    this.pending_ = true;
    // propagate the pending update to every node that depends on us.
    call_and_gc(this.dependents_, 'pend_');
  }
};
Computed.prototype.rdy_ = function(dep_changed) {
  // one of the nodes we depend on has finished updating.
  // if its value changed, mark this node as dirty.
  if (!this.pending_ || this.wait_ < 1) throw new Error("Computed is not pending");
  var dirty = this.dirty_ | dep_changed; this.dirty_ = dirty;
  // when all nodes we are waiting on have finished updating,
  // update this node and notify others that we are ready.
  if (!--this.wait_) {
    var did_change = false;
    if (dirty) {
      // one of the nodes we depend on actually did change,
      // so run the compute function and check if its output changes.
      // TODO: re-entrant calls: pend_, rdy_, get
      var saved_deps = read_nodes; // stack: push.
      var new_deps = []; // new set of nodes we depend on.
      read_nodes = new_deps; // stack top (global)
      var result = this.fn_();
      read_nodes = saved_deps; // stack: pop.
      did_change = (result !== this.value_); // boolean.
      var old_deps = this.dep_on_;
      this.value_ = result;
      this.dep_on_ = new_deps;
      // now that we have a new set of nodes we depend on, we need to fix some things.
      // for nodes we no longer depend on, we need to remove this from their dependents.
      for (var n=old_deps.length, i=0; i < n; i++) {
        var dep = old_deps[i];
        if (!contains(new_deps, dep)) {
          // TODO: if we are part of a cycle, this changes our dependents_!
          find_and_clear(dep.dependents_, this);
        }
      }
      // for nodes we newly depend on, we need to add this to their dependents.
      for (var n=new_deps.length, i=0; i < n; i++) {
        var dep = new_deps[i];
        if (!contains(old_deps, dep)) {
          // TODO: if we are part of a cycle, this changes our dependents_!
          dep.dependents_.push(this);
        }
      }
    }
    // propagate our ready state to every node that depends on us.
    // TODO: if dependents change during this loop?
    // TODO: re-entrant calls: pend_, rdy_, get
    call_and_gc(this.dependents_, 'rdy_', did_change);
  }
};
Computed.prototype.get = function() {
  if (read_nodes) {
    // running inside a computed or a transaction.
    if (!contains(read_nodes, this)) {
      read_nodes.push(this);
    }
    if (this.pending_) {
      // this node is in pending state, which means its value is stale.
      throw new Error("get from a Computed in pending state");
    }
    // TODO: if this node is waiting for pending updates, we need to deal with that here!
    // TODO: (this can happen as part of a structural change to the dependency graph)
    return this.value_;
  } else {
    // random access: strict mode should disallow.
    throw new Error("attempt to read a Computed outside of an action");
  }
};

function computed(fn) {
  // we must evaluate the computed at least once before it will depend on anything.
  // however, this can be lazy - nothing needs the result yet.
  return new Computed(fn);
}


// -- View

function View(fn) {
  this.fn_ = fn;
  this.wait_ = 0;
  this.dirty_ = false;
}
View.prototype.pend_ = function() {
  // one of the nodes we depend on has entered pending state.
  // track the number of nodes we are waiting for.
  ++this.wait_;
};
View.prototype.rdy_ = function(dep_changed) {
  // one of the nodes we depend on has finished updating.
  // if its value changed, mark this node as dirty.
  if (this.wait_ < 1) throw new Error("View is not pending");
  var dirty = this.dirty_ | dep_changed; this.dirty_ = dirty;
  // when all nodes we are waiting on have finished updating,
  // run the view function if any of them actually changed.
  if (!--this.wait_) {
    if (dirty) {
      // one of our deps actually did change.
      // reset the tracking state.
      this.dirty_ = false;
      // update the view.
      this.fn_();
    }
  }
};

function view(fn) {
  var v = new View(fn);
  // the view must run once so it can start depending on things.
  // state change: idle -> pending.
  v.pend_();
  if (in_action) {
    // we are running inside an action; defer view update.
    act_queue.push(v);
  } else {
    // manually update the view now.
    v.rdy_(true);
  }
  return v;
}
