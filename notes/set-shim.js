  // ---- set shim ----

  var Set = window.Set || (function(){
    function Set(){ this.s = {}; }
    Set.prototype.add = function(key){ this.s[key] = 1; }
    Set.prototype.has = function(key){ return hasOwn.call(this.s, key); }
    Set.prototype['delete'] = function(key){ delete this.s[key]; }
    Set.prototype.clear = function(){ this.s = {}; }
  })();

