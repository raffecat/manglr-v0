// dom.js

function insert(node, before) {
  before.parentNode.insertBefore(node, before);
}

function remove(node) {
  node.parentNode.removeChild(node);
}

function replace(node, marker) {
  var p = node.parentNode;
  p.insertBefore(marker, node);
  p.removeChild(node);
}

function addScript(source) {
  var script = document.createElement("script");
  script.appendChild(document.createTextNode(source));
  document.getElementsByTagName("head")[0].appendChild(script);
}

function logError(message) {
  addScript('throw new Error("'+message.replace(/"/g,'\\"')+'");');
}
