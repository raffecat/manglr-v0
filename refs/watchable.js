// http://johndyer.name/native-browser-get-set-properties-in-javascript/
// Old Firefox: __defineGetter__ and __defineSetter__
// Old IE: onpropertychanged
// iOS: only supports defineProperty on non-DOM nodes
// Modern: Object.defineProperty (DOM-only in IE8, in-document)

// IE7,8 are the problem for watching properties for changes.
// It can be done with onpropertychanged DOM nodes, but how scalable is that?
// Probably less so than using Angular-style checking (just scan every object for changes)

// Super amazing, cross browser property function, based on http://thewikies.com/
function addProperty(obj, name, onGet, onSet) {

    // wrapper functions
    var
        oldValue = obj[name],
        getFn = function () {
            return onGet.apply(obj, [oldValue]);
        },
        setFn = function (newValue) {
            return oldValue = onSet.apply(obj, [newValue]);
        };

    // Modern browsers, IE9+, and IE8 (must be a DOM object),
    if (Object.defineProperty) {

        Object.defineProperty(obj, name, {
            get: getFn,
            set: setFn
        });

    // Older Mozilla
    } else if (obj.__defineGetter__) {

        obj.__defineGetter__(name, getFn);
        obj.__defineSetter__(name, setFn);

    // IE6-7
    // must be a real DOM object (to have attachEvent) and must be attached to document (for onpropertychange to fire)
    } else {

        var onPropertyChange = function (e) {

            if (event.propertyName == name) {
                // temporarily remove the event so it doesn't fire again and create a loop
                obj.detachEvent("onpropertychange", onPropertyChange);

                // get the changed value, run it through the set function
                var newValue = setFn(obj[name]);

                // restore the get function
                obj[name] = getFn;
                obj[name].toString = getFn;

                // restore the event
                obj.attachEvent("onpropertychange", onPropertyChange);
            }
        };  

        obj[name] = getFn;
        obj[name].toString = getFn;

        obj.attachEvent("onpropertychange", onPropertyChange);

    }
}


// http://webreflection.blogspot.com.au/2009/01/internet-explorer-object-watch.html

(function(watch, unwatch){
createWatcher = watch && unwatch ?
    // Andrea Giammarchi - Mit Style License
    function(obj){
        var handlers = [];
        return {
            destroy:function(){
                handlers.forEach(function(prop){
                    unwatch.call(this, prop);
                }, this);
                handlers=null;
            },
            watch:function(prop, handler){
                if(-1 === handlers.indexOf(prop))
                    handlers.push(prop);
                watch.call(this, prop, function(prop, prevValue, newValue){
                    return obj[prop] = handler.call(obj, prop, prevValue, newValue);
                });
            },
            unwatch:function(prop){
                var i = handlers.indexOf(prop);
                if(-1 !== i){
                    unwatch.call(this, prop);
                    handlers.splice(i, 1);
                };
            }
        }
    }:(Object.prototype.__defineSetter__?
    function(obj){
        var handlers = [];
        return {
            destroy:function(){
                handlers.forEach(function(prop){
                    delete this[prop];
                }, this);
                delete handlers;
            },
            watch:function(prop, handler){
                if(-1 === handlers.indexOf(prop))
                    handlers.push(prop);
                if(!this.__lookupGetter__(prop))
                    this.__defineGetter__(prop, function(){return obj[prop]});
                this.__defineSetter__(prop, function(newValue){
                    obj[prop] = handler.call(obj, prop, obj[prop], newValue);
                });
            },
            unwatch:function(prop){
                var i = handlers.indexOf(prop);
                if(-1 !== i){
                    delete this[prop];
                    handlers.splice(i, 1);
                };
            }
        };
    }:
    function(obj){
        function onpropertychange(){
            var prop = event.propertyName,
                newValue = empty[prop]
                prevValue = obj[prop],
                handler = handlers[prop];
            if(handler) {
                empty[prop] = obj[prop] = handler.call(obj, prop, prevValue, newValue);
                detachEvent();
                attachEvent();
            }
        };
        function attachEvent(){empty.attachEvent("onpropertychange", onpropertychange)};
        function detachEvent(){empty.detachEvent("onpropertychange", onpropertychange);return empty};
        var empty = document.createElement("empty"), handlers = {};
        empty.destroy = function(){
            detachEvent();
            empty.parentNode.removeChild(empty);
            empty = handlers = null;
        };
        empty.watch = function(prop, handler){handlers[prop] = handler};
        empty.unwatch = function(prop){delete handlers[prop]};
        attachEvent();
        return (document.getElementsByTagName("head")[0] || document.documentElement).appendChild(empty);
    }
    )
;
})(Object.prototype.watch, Object.prototype.unwatch);

