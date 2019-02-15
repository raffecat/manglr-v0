var ws = new WebSocket('ws://localhost:8080')

// This is our store, it holds the things
var store = {messages: [], messagesIndex = {}}

// this is our store index, it keeps our messagesIndex up to date :)
function _indexStore() {
  var idx = {}
  for(var i=0; i <= store.messages.length; i++) {
    var m = store.messages[i]
    idx[m.id] = m
  }
  store.messagesIndex = idx
}

// These are our message handlers, they process messages from the server
var msgHandlers = {

  // this is poo, but lets go with it for now
  msgupdates: function(msg) {
    for(var i=0; i <= msg.m.length; i++) {
      var m = msg.m[i]
      if(store.messagesIndex[m.id]) {
        // already in our list, update it!
        var keys = Object.keys(m)
        for(var ii=0; ii <= keys.length; ii++) {
          var k = keys[ii]
          store.messagesIndex[m.id][k] = m[k]
        }
      } else {
        // not in our list, add it!
        store.messages.append(m)
      }
      _indexStore()
    }
  }

}

var msgId = 0
function nextId() {
  return ++msgId
}

// add a new dirty message to the store and send it to the server
function newPrayerMessage(msg) {
  var m = {
    id: nextId(),
    dirty: true,
    type: 'prayer',
    body: msg
  }
  // add msg to our store
  store.messages.append(m)
  // reindex store
  _indexStore()
  // send to server !
  send('newmsg', m)
}


// websocket stuff here:
function send(type, msg) {
      var out = JSON.stringify({t: type, msg: msg})
          ws.send(out)
}

ws.onmessage = function (msg) {
  (msgHandlers[msg.type] || function(msg) { console.error('no handler for message', msg) })(msg)
}
