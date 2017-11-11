(function(){
  var m = manglr;

  m.reg("v-form-submit", function (text, node, scope) {
    // parse the options: "json /api/login res | ..."
    var actions = text.split('|');
    var args = m.words(actions.shift());
    if (args.length !== 3) throw new Error("bad options, expecting '(format) (url) (result-name) | (actions...)'");
    if (args[0] !== "json") {
      throw new Error("bad format in options, expecting 'json' or 'post'");
    }

    // prevent the form from being submitted as GET/POST.
    node.domNode.onsubmit = function(ev) {
      m.log("prevented default form submit");
      if (!ev) ev = window.event;
      if (event.preventDefault) event.preventDefault(); // prevent its default action.
      ev.returnValue = false; // old IE prevent-default.
      return false;
    };

    // We must handle the form submit event, otherwise the browser will perform a GET request.
    // This really should just queue an action to be performed.
    node.on('submit', function () {
      // collect v-form-name from all descendants.
      var fields = node.collect("manglr-forms:name");
      // need a helper that does this, building structured values?
      var data = {};
      manglr.forEach(fields, function (field) {
        data[field.name] = field.node.domNode.value;
      });
      m.log("posting:", data);
      // use the data provider to post the stuff?
    });

  });

  m.reg("v-form-name", function (text, node, scope) {
    var name = m.trim(text);
    node.provide("manglr-forms:name", { name: name, node:node });
  });

})();
