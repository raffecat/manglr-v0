import * as ast from './ast';
import csstree = require('css-tree');
import { html5 as html5tags, deprecated as deprecatedTags } from './dom-spec';
import { reconstitute } from './report';
import { ParserState } from './parser-state';

const nonWhiteSpace = /\S/;

function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }

const builtInTpl = new ast.Template('[builtin]');
const plainDomTag = new ast.TagDefn(builtInTpl, '[DOMTag]', /*rootNodes*/[], /*anyAttrib*/true);
builtInTpl.tags.set('store', new ast.TagDefn(builtInTpl, 'store')); // TODO.
builtInTpl.tags.set('model', new ast.TagDefn(builtInTpl, 'model')); // TODO.

function compileExpression(ps:ParserState, source:string, where:string) {
  return new ast.Expression(source, where); // TODO.
}

function parsePlaceholders(ps:ParserState, source:string, outNodes:ast.TplNode[], where:string) {
  // "some {embeds} inside a {text} template."
  // ["some ", {}, " inside a ", {}, " template."]
  const spans = source.split('{');
  // ^ ["some ","embeds} inside a ","text} template."]
  const pre = spans[0]; // text before the first '{' (can be empty)
  if (pre) {
    outNodes.push(new ast.Text(pre, where)); // literal text: normWS(pre)
  }
  for (let i=1; i<spans.length; i++) {
    const span = spans[i]; // e.g. "embeds} inside a "
    var close = span.indexOf('}');
    if (close < 0) {
      ps.lint('unclosed "{" in string template '+where);
      close = span.length; // assume at end of span.
    }
    const expr = span.substring(0, close); // text before '}'
    const post = span.substring(close+1); // text after '}'
    outNodes.push(compileExpression(ps, expr, where));
    if (post.length) {
      outNodes.push(new ast.Text(post, where)); // literal text: normWS(post)
    }
  }
}

function parseAttribute(ps:ParserState, source:string, where:string) {
  // recognise the difference between a direct-value binding and a text template.
  // a direct-value binding contains a single expression, e.g. attrib="{ foo }"
  // and will be passed through as a non-string binding object (the receiver might
  // coerce its value to a string, however.)
  if (/^\{(.*)\}$/.test(source)) {
    // binding is a single expression: provide it as a direct-value binding.
    return compileExpression(ps, source.substring(1,source.length-1), where);
  } else if (source.indexOf('{') >= 0) {
    // binding is a text template: provide a string-value binding.
    const nodes:ast.TextTPlNode[] = [];
    parsePlaceholders(ps, source, nodes, where);
    return new ast.TextTemplate(nodes, where);
  } else {
    // binding to a literal value.
    return new ast.Text(source, where);
  }
}

function appendStyles(ps:ParserState, sheet:ast.StyleSheet, outNodes:ast.TplNode[], filename:string) {
  const genCSS = csstree.translate(sheet.ast);
  if (nonWhiteSpace.test(genCSS)) {
    const cssText = new ast.Text(genCSS, filename, /*markup*/true);
    // walk backwards, skipping text nodes that contain only whitespace.
    var pos = outNodes.length, lastNode = outNodes[--pos];
    while (lastNode instanceof ast.Text && !nonWhiteSpace.test(lastNode.text)) {
      lastNode = outNodes[--pos];
    }
    // now, if the last node is a <style> tag, append this style-sheet to it.
    if (lastNode instanceof ast.TplTag && lastNode.tag === 'style') {
      if (ps.debugLevel) ps.debug(`=> merged adjacent style nodes`);
      lastNode.children.push(cssText);
    } else {
      outNodes.push(new ast.TplTag('style', new Map(), [cssText]));
    }
  }
}

function buildCustomTagOrDomTag(ps:ParserState, tpl:ast.Template, node:ast.Tag, outNodes:ast.TplNode[], customTags:ast.DefnMap) {
  // resolve custom tag to its template so we can recognise its parameters.
  const filename = tpl.filename;
  const tag = node.tag;
  const importedTpl = node.tpl;
  let tagDef;
  if (importedTpl) {
    // tag had an @import attribute specifying the template to import.
    tagDef = importedTpl.tags.get(tag);
    if (!tagDef) {
      ps.error('custom tag <'+tag+'> is not defined in @import '+importedTpl.filename);
      tagDef = plainDomTag;
    }
  } else {
    // check if the tag-name is defined in any locally imported tag library.
    tagDef = customTags.get(tag);
    if (!tagDef) {
      // MUST be a valid HTML5 tag-name, otherwise we'll report it undefined for safety.
      if (!html5tags.has(tag)) {
        if (deprecatedTags.has(tag)) {
          ps.lint('tag is deprecated in HTML5: '+reconstitute(node)+' in: '+filename);
        } else {
          ps.error('custom tag <'+tag+'> is not defined in '+filename);
        }
      }
      tagDef = plainDomTag;
    }
  }

  // find all attributes that contain a binding expression and compile those expressions.
  // warn if it's not a standard html attribute and doesn't match a custom attribute.
  // also warn if it is a standard attribute on a tag that doesn't allow those.
  var condition: ast.Expression|null = null;
  var repeat: ast.Expression|null = null;
  var repeatName: string|null = null;
  const params = tagDef.params, anyAttrib = tagDef.anyAttrib;
  const binds: ast.BindingMap = new Map();
  for (let [key,val] of node.attribs) {
    // directives.
    // TODO: custom directive lookups.
    if (key === 'if') {
      condition = compileExpression(ps, val, reconstitute(node)+' in: '+filename);
    } else if (key === 'repeat') {
      const terms = val.split(' in ');
      if (terms.length !== 2) {
        ps.error('repeat attribute must be of the form repeat="x in y" in '+reconstitute(node)+' in: '+filename);
      } else {
        repeatName = trim(terms[0]);
        const from = trim(terms[1]);
        repeat = compileExpression(ps, from, reconstitute(node)+' in: '+filename);
      }
    } else {
      const pb = params.get(key);
      if (pb == null && !anyAttrib) {
        ps.warn('unrecognised "'+key+'" attribute on tag '+reconstitute(node)+' was ignored in: '+filename);
      } else {
        // TODO: use pb to impose type-checks on bindings.
        // TODO: push these in order to a list.
        binds.set(key, parseAttribute(ps, val, 'in attribute "'+key+'" of '+reconstitute(node)+' in '+filename));
      }
    }
  }
  // add defaults for any bindings that were not specified.
  for (let [key,val] of params) {
    if (!binds.has(key)) {
      binds.set(key, new ast.Text(val, filename));
    }
  }

  // FIXME: buildTagDefn needs to be in a scope that contains the 'repeat' variable, if any.
  const childNodes: ast.TplNode[] = [];
  buildTagDefn(ps, tpl, node.children, childNodes, customTags);

  var appendNode: ast.TplNode;
  if (anyAttrib) {
    // standard DOM tag: wrap the child nodes; embed within any condition/repeat.
    appendNode = new ast.TplTag(tag, binds, childNodes);
  } else {
    // custom tag: capture any child nodes for <content> inside the custom tag,
    // and inline a copy of the custom tag here within any condition/repeat.
    appendNode = new ast.CustomTag(tagDef, binds, childNodes);
  }

  // wrap the resulting node within any condition/repeat and append it to the template.
  if (repeat != null && repeatName != null) {
    appendNode = new ast.TplRepeat(repeatName, repeat, [appendNode]);
  }
  if (condition != null) {
    appendNode = new ast.TplCond(condition, [appendNode]);
  }
  outNodes.push(appendNode);
}

function normalizeEOL(text:string) {
  if (nonWhiteSpace.test(text)) {
    return text; // contains text content (might be in a 'white-space:pre' element)
  }
  const norm = text.replace(/\r/g,'\n');
  let firstEOL = norm.indexOf('\n'); if (firstEOL<0) firstEOL = 0;
  let lastEOL = norm.lastIndexOf('\n'); if (lastEOL<0) lastEOL = norm.length;
  return norm.substr(0,firstEOL) + norm.substr(lastEOL);
}

function buildTagDefn(ps:ParserState, tpl:ast.Template, nodelist:ast.Node[], outNodes:ast.TplNode[], customTags:ast.DefnMap) {
  // phase 2: parse dom nodes and build the template.
  const filename = tpl.filename;
  for (let node of nodelist) {
    if (node instanceof ast.Text) {
      // merge adjacent text nodes (caused by elided tags)
      // remove blank lines between tags (often caused by elided tags)
      let text = node.text;
      if (!nonWhiteSpace.test(text)) {
        if (outNodes.length > 0) {
          const last = outNodes[outNodes.length-1];
          if (last instanceof ast.Text && !nonWhiteSpace.test(last.text)) {
            last.text = normalizeEOL(last.text + text);
            continue;
          }
        }
        text = normalizeEOL(text);
      }
      // parse any embedded expressions in the text content.
      parsePlaceholders(ps, text, outNodes, 'text node in '+filename);
    } else if (node instanceof ast.Tag) {
      if (node.elide) {
        continue;
      }
      switch (node.tag) {
        case 'style': {
          // deferred until all style-sheets have loaded.
          // output CSS into an inline style tag.
          // StyleSheet lacks an 'ast' if the file could not be loaded.
          if (node.sheet && node.sheet.ast) {
            appendStyles(ps, node.sheet, outNodes, filename);
          }
          break;
        }
        case 'contents': {
          // TODO: insert markup placed inside the custom tags. <slot name="foo">?
          // TODO: <content allow="img label my-tag" allow-text /> to restrict contents.
          // TODO: ^ want to be able to redefine <img> as a custom component within <contents>
          ps.error("the <contents> tag is not implemented yet");
          break;
        }
        default: {
          buildCustomTagOrDomTag(ps, tpl, node, outNodes, customTags);
          break;
        }
      }
    } else {
      ps.error('unexpected node <'+node.tag+'> in: '+filename);
    }
  }
}

function customTagsForDefn(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn):ast.DefnMap {
  // build the set of custom tags from the templates imported into this template.
  const customTags: ast.DefnMap = new Map();
  // start with all the built-in tags in our custom-tags map.
  for (let [name,defn] of builtInTpl.tags) {
    customTags.set(name, defn);
  }
  // add the custom tags imported into this TagDefn.
  // TODO: selective imports and renames?
  for (let srcTpl of defn.tplsImported) {
    for (let [name,defn] of srcTpl.tags) {
      // detect name conflicts.
      const other = customTags.get(name);
      if (other) {
        ps.error('duplicate custom tag name "'+name+'" imported from "'+srcTpl.filename+'" and "'+other.tpl.filename+'" in: '+tpl.filename);
      } else {
        if (ps.debugLevel) ps.debug(`=> register custom tag: '${name}' in ${tpl.filename}`);
        customTags.set(name, defn);
      }
    }
  }
  // add the custom tags imported into this Template.
  // TODO: selective imports and renames.
  for (let srcTpl of tpl.tplsImported) {
    for (let [name,defn] of srcTpl.tags) {
      // detect name conflicts.
      const other = customTags.get(name);
      if (other) {
        ps.error('duplicate custom tag name "'+name+'" imported from "'+srcTpl.filename+'" and "'+other.tpl.filename+'" in: '+tpl.filename);
      } else {
        if (ps.debugLevel) ps.debug(`=> register custom tag: '${name}' in ${tpl.filename}`);
        customTags.set(name, defn);
      }
    }
  }
  return customTags;
}

export function buildTagsInTpl(ps:ParserState, tpl:ast.Template) {
  // phase 2: parse dom nodes and build the template.
  for (let [_,defn] of tpl.tags) {
    // build the set of custom tags from the components imported into this TagDefn and Template.
    const customTags = customTagsForDefn(ps, tpl, defn);
    buildTagDefn(ps, tpl, defn.rootNodes, defn.nodes, customTags);
  }
}
