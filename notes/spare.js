
function parseHTML(filename, usedFrom, isRoot) {
  // parse HTML template and generate json-dom.
  let customTags = {}; // templates imported in this file (might want locals for inline templates)
  let template_stack = []; // stack of inline 'template' tags being parsed.
  let decl = {
    tagName: path.posix.basename(filename).replace(/\.[^\.]+$/,'').toLowerCase(), // default if not declared within this template.
    outTag: 'div', // root tag to output for this tempate.
    params: {}, // declared within this template.
    dom: [], // output dom nodes in this decl.
    tagStack: [], // currently open tags.
    binds: {}
  }
  // TODO: recognise tag="foo" (or use root tag name) and any m-params on the root tag of the template.
  let dom = decl.dom; // cached decl.dom.
  let tagStack = decl.tagStack; // cached decl.tagStack.
  if (isRoot) {
    dom.push('<!DOCTYPE html>');
  }
  const parser = new htmlparser.Parser({
    onopentag: function(tag, attribs) {
      tag = tag.toLowerCase(); // all html and custom tags are mapped to lower-case.
      log("O "+tag);
      let stat = {};
      let binds = {};
      if (tag === "script" && attribs.type === "manglr/tag") {
      } else {
      tagStack.push({ tag:tag, line:1 }); // TODO: line numbers!
    },
    onclosetag: function(tag) {
      log("C "+tag);
      if (!tagStack.length) {
        return log('unmatched closing tag </'+tag+'> outside of any open tag in '+filename);
      }
      let openTag = tagStack[tagStack.length-1].tag;
      if (tag == openTag) {
        tagStack.pop();
      } else {
        return log('unmatched closing tag </'+tag+'> does not match currently open tag <'+openTag+'> in '+filename);
      }
      if (tag == 'template') {
        decl = template_stack.pop();
        dom = decl.dom; // cached decl.dom.
        tagStack = decl.tagStack; // cached decl.tagStack.
      } else {
        dom.push('</'+tag+'>');
      }
    },
    ontext: function(val) {
    },
    onerror: function() {
      log("parser error:", error);
    },
    oncomment: function(data) {
      log("comment: "+data);
    },
    oncdatastart: function() {
      log("warning: CDATA section is deprecated in HTML5, in "+filename);
      dom.push('<![CDATA[');
    },
    oncdataend: function() {
      dom.push(']]>');
    },
    onprocessinginstruction: function(piname, data) {
      if (trim(data).toLowerCase() == '!doctype html') {
        if (trim(data) != '!DOCTYPE html') {
          log('lint: <!DOCTYPE html> has incorrect upper/lower case in '+filename);
        }
        foundDocType = true;
      } else {
        log('ignored processing instruction: <'+piname+' '+data+'> in '+filename);
      }
    }
  }, {decodeEntities: false});

  // read and parse the source file.
  if (!fs.existsSync(filename)) {
    log('not found: '+filename+(usedFrom ? ' imported from '+usedFrom : ''));
    return decl;
  }
  let source = fs.readFileSync(filename, 'utf8');
  let dom = parseToDOM(source, filename);
  if (isRoot) {
    if (!dom.hasDocType) {
      log('lint: missing <!DOCTYPE html> in '+filename);
    }
  }
  return decl;
}

return parseHTML(mainFile, null, true);

