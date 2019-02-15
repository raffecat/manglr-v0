var waiting, typing, deleting, charpos, message, msgno = -1;
function on_insert() {
  state.mode = "typing";
  event.typing(); // normally happens in startDeleting()
  startNextMessage();
}
function on_remove() {
  if (waiting) cancelTimeout(waiting);
  if (typing) clearInterval(typing);
  if (deleting) clearInterval(deleting);
}
function startNextMessage() {
  msgno = (msgno + 1) % state.messages.length;
  message = state.messages[msgno] || "";
  typing = setInterval(typeLetter, 1000 * attributes.speed);
}
function typeLetter() {
  if (charpos < message.length) {
    // type the next letter.
    charpos += 1;
    state.text = message.substring(0, charpos);
  } else {
    // stop typing.
    state.mode = "paused";
    clearInterval(typing);
    typing = null;
    event.paused();
    waiting = setTimeout(startDeleting, 1000 * attributes.pause);
  }
}
function startDeleting() {
  state.mode = "typing";
  event.typing();
  deleting = setInterval(deleteLetter, 1000 * attributes.speed);
}
function deleteLetter() {
  if (charpos > 0) {
    // delete the next letter.
    charpos -= 1;
    state.text = message.substring(0, charpos);
  } else {
    // stop deleting.
    clearInterval(deleting);
    deleting = null;
    startNextMessage();
  }
}
