#!/usr/bin/env node

// Testing the models library.

var models = require('./lib/model');

var root = models.Model();
models.PathObserver(root, 'm.foo.bar', function(val){ console.log("m.foo.bar is:", val); });
root.set('m', 'test');

// build up tree while observing.
console.log("\nbuild up tree while observing:");

var m = models.Model();
root.set('m', m);
m.set('foo', 'awk');

var foo = models.Model();
m.set('foo', foo);

foo.set('bar', 'hello');
foo.set('bar', 'goodbye');

// switch whole subtree.
console.log("\nswitch whole subtree:");

var m2 = models.Model();
var m2foo = models.Model();
m2.set('foo', m2foo);
m2foo.set('bar', 'in the depths');

root.set('m', m2);

// switch parent, same child.
console.log("\nswitch parent, same child:");

var m3 = models.Model();
m3.set('foo', m2foo);

root.set('m', m3);

// collections test.
console.log("\ncollections test:");

var c1 = models.Collection();
root.set('seq', c1);

// fails because Collection.observe expects a single 'fn' argument.
models.PathObserver(root, 'seq', function(val){ console.log("seq is:", val); });

c1.observe(function(val){ console.log(val); });
c1.push(1, 2, 3, 4, 5);
c1.push(6);

