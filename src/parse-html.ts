'use strict';

import htmlparser = require("htmlparser2");
import { Fragment, Text, Tag, Element, Node, AttrMap } from './ast';

type RawAttrs = { [key:string]:string };
const hasOwn = Object.prototype.hasOwnProperty;
const log = console.log;

function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }

export function parseToDOM(source:string, filename:string): Fragment {
  // Parse the source HTML into a simple DOM tree structure.
  // This handles concerns such as valid tag nesting and self-closing tags.
  const where = 'in '+filename;
  const doc = new Fragment();
  const tagStack: Element[] = [doc];
  let children: Node[] = doc.children; // collect tags as children of the document.
  let inCDATA = false;
  const parser = new htmlparser.Parser({
    onopentag: function(tag:string, attribs:RawAttrs) {
      tag = tag.toLowerCase();
      const attrs: AttrMap = new Map();
      for (let key in attribs) {
        if (hasOwn.call(attribs, key)) {
          attrs.set(key, attribs[key]);
        }
      }
      const node = new Tag(tag, attrs);
      children.push(node); // include in parent's children.
      tagStack.push(node); // tag is now open.
      children = node.children; // collect tags as children of this node.
    },
    onclosetag: function(tag:string) {
      tag = tag.toLowerCase();
      if (!tagStack.length) {
        return log('unmatched closing tag </'+tag+'> outside of any open tag in '+filename);
      }
      const openTag = tagStack[tagStack.length-1];
      if (tag == openTag.tag) {
        tagStack.pop();
        const parentTag = tagStack[tagStack.length-1];
        if (!parentTag) {
          // the document should always remain on the stack.
          return log('stack underrun (missing #document) in '+filename);
        }
        children = parentTag.children; // collect tags as children of the parent.
      } else {
        log('unmatched closing tag </'+tag+'> does not match currently open tag <'+openTag.tag+'> in '+filename);
      }
    },
    ontext: function(text:string) {
      if (tagStack.length > 1) {
        children.push(new Text(text, where, inCDATA));
      } else {
        if (/\S/.test(text)) { // are there any non-whitespace characters?
          log("lint: ignored text "+JSON.stringify(text)+" between top-level tags, in "+filename);
        }
      }
    },
    oncdatastart: function() {
      log("lint: CDATA section is deprecated in HTML5, in "+filename);
      children.push(new Text('<![CDATA[', where, true));
      inCDATA = true;
    },
    oncdataend: function() {
      children.push(new Text(']]>', where, true));
      inCDATA = false;
    },
    onprocessinginstruction: function(piname:string, data:string) {
      if (trim(data).toLowerCase() == '!doctype html') {
        doc.hasDocType = true;
        if (trim(data) != '!DOCTYPE html') {
          log('lint: <!DOCTYPE html> has incorrect upper/lower case in '+filename);
        }
      } else {
        log('lint: ignored processing instruction: <'+piname+' '+data+'> in '+filename);
      }
    },
    onerror: function(error:any) {
      // under what conditions will this happen?
      log("parse error:", error);
    }
  }, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: false,
    decodeEntities: true,
    recognizeSelfClosing: true,
    recognizeCDATA: true
  });
  parser.write(source);
  parser.end();
  while (tagStack.length > 1) { // stop at #document.
    const openTag = tagStack.pop() as Element; // "can be null" because Array can be sparse.
    log('lint: unclosed tag <'+openTag.tag+'> in '+filename);
  }
  return doc;
}
