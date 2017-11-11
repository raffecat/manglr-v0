const assert = require('assert');
const { observable, view, computed, action } = require('./mini-frp');

describe("observable:", ()=>{

  it("should be able to create an observable", ()=>{
    assert(observable() != null);
  });

  it("should be able to get the initial value", ()=>{
    var o = observable(42);
    assert.equal(o.get(), 42);
  });

  it("should be able to change the value", ()=>{
    var o = observable(42);
    o.set(12);
  });

  it("should be able to get the changed value", ()=>{
    var o = observable(42);
    o.set(12);
    assert.equal(o.get(), 12);
  });

});

describe("view:", ()=>{

  it("should be able to create a view", ()=>{
    assert(view(()=>{}) != null);
  });

  it("should update once when created", ()=>{
    var updates = 0;
    view(()=>{ updates++ });
    assert.equal(updates, 1, "view must run exactly once");
  });

  it("should be able to read the observable value", ()=>{
    var o = observable(42);
    var value = 0;
    view(()=>{ value = o.get() });
    assert.equal(value, 42);
  });

  it("should run again when the observable value changes", ()=>{
    var o = observable(42);
    var updates = 0;
    view(()=>{ o.get(); ++updates }); // subscribe, and increment.
    o.set(12); // cause the view to update again.
    assert.equal(updates, 2, "view did not run twice");
  });

  it("should see the new value when an observable changes", ()=>{
    var o = observable(42);
    var value = 0;
    view(()=>{ value = o.get() }); // subscribe, and get value.
    assert.equal(value, 42);
    o.set(12);
    assert.equal(value, 12);
  });

});

describe("action:", ()=>{

  it("should be able to declare an action", ()=>{
    action(()=>{});
  });

  it("should be able to call an action", ()=>{
    var a = action(()=>{});
    a();
  });

  it("the action body should run", ()=>{
    var did = false;
    var a = action(()=>{ did=true });
    a();
    assert(did, "action body did not run");
  });

  it("view update should be deferred until action ends", ()=>{
    var o = observable(42);
    var seen = false;
    view(()=>{ o.get(); seen=true }); // subscribe to o.
    seen = false; // reset before action.
    action(()=>{
      o.set(12); // cause the view to update.
      assert.equal(seen, false, "view ran inside the action");
    })();
    assert.equal(seen, true, "view did not run after the action");
  });

});
