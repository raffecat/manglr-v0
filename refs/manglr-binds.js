(function(){
  var m = manglr;
  var log = m.log;

  // ––~,–`~–{@   Built-in "if" Binding   @}–~,–`~––

  m.reg("v-if", manglr_if_binding);

  function manglr_if_binding(text, node, scope) {
    var expr = scope.compile(text);
    node.cond(expr);
    log("bound condition to "+node.path());
  }

  // ––~,–`~–{@   Built-in "value" Binding   @}–~,–`~––

  m.reg("v-value", manglr_value_binding);

  function manglr_value_binding(text, node, scope) {
    // the binding must be something we can set.
    var expr = scope.compile(text);
    if (typeof expr.set !== 'function') {
      throw new Error("bound expression is not settable; changes cannot be written.");
    }
    expr.view(function(value){
      log("value updated: value = "+value);
      node.value = value ? value.toString() : '';
    });
    function value_changed() {
      // some browsers change the value after the event.
      setTimeout(function(){ expr.set(node.value) },0);
    }
    node.on('keyup', value_changed);
    node.on('changed', value_changed);
    node.on('blur', value_changed);
  }

  // ––~,–`~–{@   Built-in "va-" Binding   @}–~,–`~––

  // Bind an attribute's value to a text-template expression.
  // e.g. va-src="/images/{flag}.png"

  m.reg("va-", manglr_va_binding);

  function manglr_va_binding(text, node, scope, suffix) {
    var expr = scope.text(text);
    // suffix = suffix.replace(/\-(.)/g, function(t){ return t.toUpperCase(); }); // DOM properties.
    log("bound view to attribute '"+suffix+"' of "+node.path());
    expr.view(function(value){
      log("attribute updated: "+suffix+" = "+value);
      node.domNode.setAttribute(suffix, value);
    });
  }

  // ––~,–`~–{@   "v-menu" Binding   @}–~,–`~––

  // Make a group of menu items where only one can be active at a time.
  // Activates a menu item when it is clicked.
  // Adds the class "active" to the active menu item.

  m.reg("v-menu", manglr_menu);
  m.reg("v-menu-item", manglr_menu_item);

  function manglr_menu(text, node, scope) {
    // provide an observable value to hold the selected item.
    node.provide("v-menu:selected", scope.value());
  }

  function manglr_menu_item(text, node, scope) {
    // bind to the ancestor's selected item observable.
    // when it changes, update this item's view state.
    var selected = node.ancestor("v-menu:selected", "must be inside a v-menu element");
    selected.view(function(which){
      if (which === node) {
        node.addClass("active");
      } else {
        node.removeClass("active");
      }
    });
    // when this item is clicked, make it the selected item.
    function select() { selected.set(node) }
    node.on('click', select);
    node.on('touchstart', select);
  }

  // ––~,–`~–{@   "v-route" Binding   @}–~,–`~––

})();
