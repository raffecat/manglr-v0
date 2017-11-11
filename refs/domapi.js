function MistDOM(mist) {

  var tr = Tracer; // Tracing dependency tracker.
  var dom = {};

  // detect browser style prefixes.
  var testDomNode = document.createElement('div');
  var browserPrefixes = ["O","Moz","ms","webkit"];
  function cssPrefix(name) {
    var style = testDomNode.style;
    for (var i=browserPrefixes.length; --i; ) {
      var attr = browserPrefixes[i]+name;
      if (attr in style) return attr;
    }
    return name.toLowerCase();
  }
  var cssTransform = cssPrefix("Transform");
  var cssTransformOrigin = cssPrefix("TransformOrigin");
  var cssBackgroundSize = cssPrefix("BackgroundSize");


  dom.applyTransform = function applyTransform(self, args) {
    var style = self.element.style;
    var x=args.x, y=args.y, a=args.angle, sx=args.scalex, sy=args.scaley;
    var ox=args.originx, oy=args.originy, op=args.opacity;
    self.on([x, y, a, sx, sy], function() {
      style[cssTransform] = 'translate('+x.value+'px,'+y.value+'px) scale('+sx.value+','+sy.value+') rotate('+a.value+'deg)';
    });
    self.on([ox, oy], function() {
      style[cssTransformOrigin] = (100*ox.value)+'% '+(100*oy.value)+'%';
    });
    self.on([op], function() {
      style.opacity = op.value;
    });
  };

  dom.createDiv = function createDiv(parent, cls) {
    var elem = document.createElement("DIV");
    elem.setAttribute('class', cls||'');
    if (parent) parent.appendChild(elem);
    return elem;
  };

  dom.applyText = function appendText(self, args) {
    var text = document.createTextNode();
    self.element.appendChild(text);
    self.on([args.text], function() {
      text.nodeValue = args.text.value;
    });
  };

  dom.applyPos = function applyPos(self, args) {
    var elem = self.element;
    if (args.width.isBound && args.x.isBound && args.right.isBound) {
      self.trace("Visual: 'width' conflicts with 'x' and 'right' anchors");
    }
    if (args.height.isBound && args.y.isBound && args.bottom.isBound) {
      self.trace("Visual: 'height' conflicts with 'y' and 'bottom' anchors");
    }
    self.on([args.width], function() {
      var w = args.width.value||0; if (w<0) w=0;
      elem.style.width = w+'px';
    });
    self.on([args.height], function(val) {
      var h = args.height.value||0; if (h<0) h=0;
      elem.style.height = h+'px';
    });
    self.on([args.x], function(val) {
      elem.style.left = (args.x.value||0)+'px';
    });
    self.on([args.y], function(val) {
      elem.style.top = (args.y.value||0)+'px';
    });
    self.on([args.right], function(val) {
      elem.style.right = (args.right.value||0)+'px';
    });
    self.on([args.bottom], function(val) {
      elem.style.bottom = (args.bottom.value||0)+'px';
    });
  };

  dom.applyBackground = function applyBackground(self, args) {
    var elem = self.element;
    self.preferredSize = self.slot({width:0, height:0}, "preferredSize");
    self.on([args.color], function() {
      var col = '#' + (+args.color.value||0).toString(16);
      elem.style.backgroundColor = col;
    });
    self.on([args.opacity], function() {
      elem.style.opacity = +args.opacity.value||0;
    });
    self.on([args.image], function() {
      //console.log("applyBackground: image updated", image);
      var img = args.image.value;
      if (img) {
        // TODO: sigh, cannot assign an image directly to the background,
        // it must be done with a url, and we cannot find the size of
        // the image from the url or style.
        // TODO: generate css classes instead, so we can avoid using
        // long data urls everywhere, and the browser can hopefully
        // keep one instance of the image underneath.
        elem.style.backgroundImage = "url('"+img.url+"')";
        // update the size of the visual.
        self.preferredSize.set({width:img.width, height:img.height});
        if (args.autoSize.value) {
          elem.style.width = img.width+'px';
          elem.style.height = img.height+'px';
        }
      } else {
        // no image is bound.
        elem.style.backgroundImage = "none";
        // update the size of the visual.
        self.preferredSize.set({width:0, height:0});
        if (args.autoSize.value) {
          elem.style.width = '0';
          elem.style.height = '0';
        }
      }
    });
  };

  dom.applyFont = function applyFont(self, args) {
    var font = self.bind(args.font);
    elem.style.fontFamily = font.family||'sans-serif';
    elem.style.fontSize = (args.size||font.size||12)+'px';
    elem.style.color = font.color||'#fff';
    elem.style.lineHeight = args.lineHeight||font.lineHeight||'normal';
  };

  dom.show = function show(elem) {
    elem.style.display = 'block';
  };

  dom.hide = function hide(elem) {
    elem.style.display = 'none';
  };

  dom.addClass = function addClass(elem, cls) {
    // Add css class(es) to the element.
    // NB. use setAttribute because a pending setAttribute will stomp
    // changes to elem.class when the task ends! (maybe that's because
    // it should be className?)
    elem.setAttribute('class', (elem.getAttribute('class')||'')+' '+cls);
  };

  dom.removeClass = function removeClass(elem, cls) {
    // Remove one css class from the element.
    var lst = (elem.getAttribute('class')||'').split(' '), len = lst.length;
    for (var i=0; i<len; i++) {
      if (lst[i]===cls) {
        lst.splice(i,1); // remove this element.
        i -= 1; len -= 1; // re-test this index, shorter list.
      }
    }
    elem.setAttribute('class', lst.join(' '));
  };

  dom.getMousePos = function getMousePos(ev, pos) {
    // get mouse position in document coords.
    // clientXY is only for IE (documentElement in 6+ standards mode)
    pos.x = ev.pageX || (ev.clientX + document.documentElement.scrollLeft);
    pos.y = ev.pageY || (ev.clientY + document.documentElement.scrollTop);
  };

  dom.getElemPos = function getElemPos(elem, pos) {
    // get element position in document coords.
    var x=0, y=0;
    do {
      x += elem.offsetLeft;
      y += elem.offsetTop;
    } while ((elem=elem.offsetParent)); // assignment.
    pos.x = x; pos.y = y; // return value.
  };

  dom.destroyNode = function destroyNode(node) {
    // TODO: use an innerHtml bin?
    if (node.parentNode)
      node.parentNode.removeChild(node);
  };

  // TODO: record event handlers in a global map,
  // so we can unregister them in destroyNode.
  dom.bindEvent = function bindEvent(element, name, handler, capture) {
    if (element.addEventListener) {
      element.addEventListener(name, handler, capture||false);
    } else {
      var ieShim = handler.__ieshim || (handler.__ieshim =
        function ie_shim() { return handler(window.event); });
      element.attachEvent('on'+name, ieShim);
    }
  };

  dom.unbindEvent = function unbindEvent(element, name, handler, capture) {
    if (element.addEventListener) {
      element.removeEventListener(name, handler, capture||false);
    } else {
      element.detachEvent('on'+name, handler.__ieshim);
    }
  };

  dom.cancelEvent = function cancelEvent(e) {
    // Prevent default and stop event bubbling.
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    e.cancelBubble = true; // IE
    return false;
  };

  dom.bindClick = function bindClick(scope, self, handler) {
    if (typeof handler === 'function') {
      bindEvent(self.element, 'click', function(e) {
        e.scope = scope;
        handler(e);
      });
    } else if (handler) {
      // Binding path like "objId.inputName"
      var clickOut = scope.provideOutput(self, 'click', handler);
      bindEvent(self.element, 'click', function(e) {
        e.scope = scope;
        clickOut.send(e);
      });
    }
  };

  return dom;
}
