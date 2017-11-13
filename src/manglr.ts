'use strict';

// inline all custom-tag templates used.
// inline 'if' tags with true conditions if data is supplied.
// inline copies of 'each' tags if data is supplied.
// inline a placeholder comment otherwise.

// allows <img src="{user.avatar}"> without spurious fetch
// uniquifies id attributes inside components (if enabled, unless prefixed with #?)

import { parseToDOM } from './parse-html';
import { generateHTML } from './gen-html';
import { html5 as html5tags, deprecated as deprecatedTags } from './dom-spec';
import * as ast from './ast';
import * as fs from 'fs';
import * as path from 'path';
import * as URL from 'url';
import mkdirp = require('mkdirp');
import csstree = require('css-tree');

const log = console.log;
function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }

const hasProtocol = /^[A-Za-z]:/;
//const isLocalURL = /^file:\/\/\//;
const absoluteUrlPattern = /^[A-Za-z]:|^\//;
const validForStyleTag = new Set(['inline-fonts','component-styles']);
const validForLinkCSS = new Set(['rel','href','inline','bundle']);
const validForImportTag = new Set(['src']);

//type Object = { [key:string]:any };
type TemplateMap = Map<string, ast.Template>;
type StyleSheetMap = Map<string, ast.StyleSheet>;

const templateCache: TemplateMap = new Map(); // global template cache: template file -> parsed template object.
const templateQueue: ast.Template[] = []; // global queue of templates to load and parse.

const cssCache: StyleSheetMap = new Map(); // global css cache.
const loadedStyleSheets: ast.StyleSheet[] = []; // global queue of css files to load and parse.
const allStyleSheets: ast.StyleSheet[] = []; // global set of style sheets.


var numErrors = 0, numWarnings = 0;
var siteRootURL = "/pad/";
var debugLevel = 0;
var inlineFontFace: ast.Tag|null = null; // first style tag encountered with inline-fonts.
var componentStyles: ast.Tag|null = null; // first style tag encountered with component-styles.
var testDataUrl: string = '';

const builtInTpl = new ast.Template('[builtin]');
const plainDomTag = new ast.TagDefn(builtInTpl, '[DOMTag]', /*rootNodes*/[], /*anyAttrib*/true);
builtInTpl.tags.set('store', new ast.TagDefn(builtInTpl, 'store')); // TODO.
builtInTpl.tags.set('model', new ast.TagDefn(builtInTpl, 'model')); // TODO.

function error(msg: string) {
  log('E: '+msg);
  numErrors++;
}
function warn(msg: string) {
  log('warning: '+msg);
  numWarnings++;
}

function reconstitute(node:ast.Tag) {
  let res = '<'+node.tag;
  for (let [key,val] of node.attribs) {
    res = res + ' ' + key + '="'+val+'"'; // NB. can include un-escaped quotes.
  }
  return res+'>';
}

function reportUnused(node:ast.Tag, allow:Set<string>, filename:string) {
  for (let [key,_] of node.attribs) {
    if (!allow.has(key)) {
      warn('unrecognised "'+key+'" attribute was ignored: '+reconstitute(node)+' in: '+filename);
    }
  }
}

function assertEmpty(node:ast.Tag, filename:string) {
   if (node.children.length) {
    warn('tag should not contain markup: '+reconstitute(node)+' in: '+filename);
  }
}

function compileExpression(source:string, where:string) {
  return new ast.Expression(source, where); // TODO.
}

function parsePlaceholders(source:string, outNodes:ast.TplNode[], where:string) {
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
      log('lint: unclosed "{" in string template '+where);
      close = span.length; // assume at end of span.
    }
    const expr = span.substring(0, close); // text before '}'
    const post = span.substring(close+1); // text after '}'
    outNodes.push(compileExpression(expr, where));
    if (post.length) {
      outNodes.push(new ast.Text(post, where)); // literal text: normWS(post)
    }
  }
}

function parseAttribute(source:string, where:string) {
  // recognise the difference between a direct-value binding and a text template.
  // a direct-value binding contains a single expression, e.g. attrib="{ foo }"
  // and will be passed through as a non-string binding object (the receiver might
  // coerce its value to a string, however.)
  if (/^\{(.*)\}$/.test(source)) {
    // binding is a single expression: provide it as a direct-value binding.
    return compileExpression(source.substring(1,source.length-1), where);
  } else if (source.indexOf('{') >= 0) {
    // binding is a text template: provide a string-value binding.
    const nodes:ast.TextTPlNode[] = [];
    parsePlaceholders(source, nodes, where);
    return new ast.TextTemplate(nodes, where);
  } else {
    // binding to a literal value.
    return new ast.Text(source, where);
  }
}

function resolveURL(url:string, usedFrom:string) {
  // url: remote 'http://', absolute '/foo/bar' or relative 'foo/bar'
  // usedFrom: remote 'http://' or local 'file:///' (from makeAbsolute)
  if (hasProtocol.test(url)) {
    return url; // already resolved if it has a protocol.
  }
  // resolve as a relative path from either the configured siteRootURL (if absolute)
  // or relative to the URL of the resource it was included from.
  const baseURL = /^\//.test(url) ? siteRootURL : usedFrom;
  const relPath = /^\//.test(url) ? url.substring(1) : url;
  return URL.resolve(baseURL, relPath);
}

function useTemplate(filename:string, usedFrom:string) {
  // get a Template (an empty, un-loaded proxy) by filename.
  const fullPath = path.resolve(path.dirname(usedFrom), filename);
  const cachedTpl = templateCache.get(fullPath);
  if (cachedTpl) {
    cachedTpl.usedFrom.push(usedFrom);
    return cachedTpl;
  }
  const tpl = new ast.Template(fullPath, usedFrom);
  templateCache.set(fullPath, tpl);
  templateQueue.push(tpl);
  return tpl;
}

function importCSS(url:string, usedFrom:string) {
  // get a CSSFile (an empty, un-loaded proxy) by filename.
  const absUrl = resolveURL(url, usedFrom);
  const cached = cssCache.get(absUrl);
  if (cached) {
    cached.usedFrom.push(usedFrom);
    return cached;
  }
  const proxy = new ast.StyleSheet(absUrl, usedFrom);
  allStyleSheets.push(proxy);
  loadedStyleSheets.push(proxy);
  cssCache.set(absUrl, proxy);
  return proxy;
}


// Phase 1 CSS.

function loadStyleSheet(sheet:ast.StyleSheet) {
  const filename = sheet.filename, usedFrom: string|null = sheet.usedFrom[0];
  if (!fs.existsSync(filename)) {
    error('not found: '+filename+(usedFrom ? ' imported from '+usedFrom : ''));
    return; // cannot load.
  }
  const source = fs.readFileSync(filename, 'utf8');
  parseStyleSheet(sheet, source);
}

function parseStyleSheet(sheet:ast.StyleSheet, source:string) {

  sheet.ast = csstree.parse(source, {
    context: 'stylesheet',
    positions: true,
    tolerant: false,
    filename: sheet.filename,
    offset: 0, // node.offset, // FIXME: node must have these too.
    line: 1, // node.line,
    column: 1, // node.column,
    onParseError: function(error:{message:string}) {
      log("E: CSS parse error: "+error.message+" in "+sheet.filename);
    }
  });

  // find CSS @import statements within the parsed CSS and queue them for loading.
  csstree.walk(sheet.ast, function(this:CSSTree.Context, node:CSSTree.Node) {
    if (node.type === 'Atrule' && node.name === 'import') {
      // @import directive: fetch the imported resource.
      const expr = node.expression;
      if (expr && expr.type === 'AtruleExpression') {
        const strNode = expr.children.first();
        if (strNode && strNode.type === 'String') {
          const url = strNode.value.substr(1, strNode.value.length - 2); // remove quotes.
          const proxy = importCSS(url, sheet.filename);
          sheet.sheetsImported.push(proxy);
        }
      }
    } else if (this.declaration !== null && node.type === 'Url') {
      // resource url inside a css directive.
      let url = node.value;
      if (url.type === 'Raw') { // 'String' | 'Raw'
        url = url.value;
      } else {
        url = url.value.substr(1, url.value.length - 2); // remove quotes.
      }
      if (!absoluteUrlPattern.test(url)) {
        // URL is relative: make the path absolute.
        // Outcome: all relative resource urls are rebased as absolute (/RootPath/...) urls.
        // Outcome: all resource urls are rebased as absolute (/RootPath/...) urls.
        // Outcome: all resource urls are rebased as CDN (http://cdn/prefix/...) urls.
        // NB. if CSS is inlined into the page or an output.css, MUST rebase its urls.
        // const fullPath = path.resolve(path.dirname(sheet.filename), url);
      }
    }
  });

}


// Phase 1.

// A pre-pass to find <import> and <component> tags (to load HTML)
// and <link rel='stylesheet' inline> tags (to load CSS)

// also record <style inline-fonts> and <style component-styles> on
// main templates so we can move styles there in a later pass.

// also attach <meta>, <link>, <script move-to-> tags to the tag-defn within
// components and index the components used within each component, so each
// main template can build its own set of head and footer tags.

// TODO: <meta charset> handling: convert components to the main template charset?

function loadTemplate(tpl:ast.Template) {
  // Load and compile a template from its source file.
  const filename = tpl.filename;
  const usedFrom: string|null = tpl.usedFrom[0];
  if (!fs.existsSync(filename)) {
    error('not found: '+filename+(usedFrom ? ' imported from '+usedFrom : ''));
    return; // cannot load.
  }
  const source = fs.readFileSync(filename, 'utf8');
  const doc = parseToDOM(source, filename);
  if (tpl.isMain && !doc.hasDocType) {
    // top-level documents must have a doctype.
    log('lint: missing <!DOCTYPE html> in '+filename);
  }
  parseTemplate(tpl, doc.children);
}

function parseTemplate(tpl:ast.Template, rootNodes:ast.Node[]) {
  // each top-level Element is a component declaration.
  for (let node of rootNodes) {
    if (node instanceof ast.Tag) {
      switch (node.tag) {
        case 'import':
          parseImportTag(tpl, null, node);
          break;
        case 'component':
          parseComponentTag(tpl, node);
          break;
        case 'html':
          parseHTMLTag(tpl, node);
          break;
        default:
          // must be a component definition (custom tag)
          if (html5tags.has(node.tag)) {
            warn('HTML component tag '+reconstitute(node)+' should not use a standard HTML5 tag name, in: '+tpl.filename);
          }
          // make a tag defn for each root element.
          const defn = new ast.TagDefn(tpl, node.tag, node.children);
          if (debugLevel) log(`=> new TagDefn '${defn.tagName}' in tpl ${tpl.filename}`);
          tpl.tags.set(defn.tagName, defn);
          // parse the attributes (parameters of the custom tag)
          for (let [name,val] of node.attribs) {
            defn.params.set(name, val);
          }
          // phase 1: find inline components and imports.
          findComponents(tpl, defn, node.children);
          break;
      }
    } else {
      log('lint: ignored root element of type '+node.tag+' in template: '+tpl.filename);
    }
  }
}

function findComponents(tpl:ast.Template, defn:ast.TagDefn, nodelist:ast.Node[]) {
  // phase 1: find "import" and inline "component" nodes.
  for (let node of nodelist) {
    if (node instanceof ast.Tag) {
      switch (node.tag) {
        case 'import':
          parseImportTag(tpl, defn, node);
          break;
        case 'component':
          parseComponentTag(tpl, node);
          break;
        case 'link':
          const rel = node.attribs.get('rel');
          if (!rel) {
            warn('missing "ref" attribute on tag: '+reconstitute(node)+' in: '+tpl.filename);
          } else if (rel === 'test-data') {
            parseTestDataTag(tpl, defn, node);
          } else if (rel === 'stylesheet') {
            parseLinkRelTag(tpl, defn, node);
          }
          break;
        case 'style':
          parseStyleTag(tpl, defn, node);
          break;
        default:
          // walk child nodes recursively.
          findComponents(tpl, defn, node.children);
          break;
      }
    }
  }
}

function parseImportTag(tpl:ast.Template, defn:ast.TagDefn|null, node:ast.Tag) {
  // import tag (elided from output)
  node.elide = true;
  const filename = tpl.filename;
  const src = node.attribs.get('src');
  if (src) {
    if (debugLevel) log(`=> import: '${src}' in ${filename}`);
    const pendingTpl = useTemplate(src, filename);
    if (defn != null) {
      // scope the import to this TagDefn, instead of the whole template.
      defn.tplsImported.push(pendingTpl);
    } else {
      // scope the import to the whole template (and every TagDefn inside it)
      tpl.tplsImported.push(pendingTpl);
    }
  } else {
    error('missing "src" attribute on '+reconstitute(node)+' in: '+filename);
  }
  reportUnused(node, validForImportTag, filename);
  assertEmpty(node, filename);
}

function parseComponentTag(tpl:ast.Template, node:ast.Tag) {
  // inline component tag (elided from output)
  node.elide = true;
  const tagName = node.attribs.get('name');
  if (tagName) {
    const other = tpl.tags.get(tagName);
    if (other) {
      error('duplicate custom tag name "'+tagName+'" declared on '+reconstitute(node)+' (and elsewhere in the same file) in: '+tpl.filename);
    } else {
      // make a tag defn for the inline component.
      const defn = new ast.TagDefn(tpl, tagName, node.children);
      // parse the attributes (parameters of the custom tag)
      for (let [name,val] of node.attribs) {
        if (name !== 'name') {
          defn.params.set(name, val);
        }
      }
      tpl.tags.set(defn.tagName, defn);
      // walk child nodes recursively.
      findComponents(tpl, defn, node.children);
    }
  } else {
    error('missing "name" attribute on '+reconstitute(node)+' in: '+tpl.filename);
  }
}

function parseHTMLTag(tpl:ast.Template, node:ast.Tag) {
  if (tpl.isMain) {
    const children = [node]; // the <html> tag is part of the contents of this "component".
    const defn = new ast.TagDefn(tpl, 'html', children);
    if (tpl.tags.get('html')) {
      error('more than one top-level <html> tag found, in: '+tpl.filename);
    }
    tpl.tags.set('html', defn);
    findComponents(tpl, defn, children);
  } else {
    error('imported HTML components cannot have a top-level <html> tag, in: '+tpl.filename);
  }
}

function parseTestDataTag(tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  node.elide = true;
  const href = node.attribs.get('href');
  if (!href) {
    warn('missing "href" attribute on tag: '+reconstitute(node)+' in: '+tpl.filename);
  } else {
    testDataUrl = href;
  }
}

function parseLinkRelTag(tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  const filename = tpl.filename;
  const href = node.attribs.get('href');
  if (!href) {
    warn('missing "href" attribute on tag: '+reconstitute(node)+' in: '+filename);
  } else {
    const proxy = importCSS(href, filename);
    tpl.sheetsImported.push(proxy);

    // inline
    // move the contents of this style-sheet (and its imports) into an inline <style> tag.
    if (node.attribs.get('inline') != null) {
      if (debugLevel) log('=> replacing '+reconstitute(node)+' with contents of "'+href+'" in: '+filename);
      node.tag = 'style';
      node.attribs.delete('rel');
      node.sheet = proxy;
    } else {
      // not inline
      // if this <link> tag is in a component, move it to the main template.
      if (!tpl.isMain) {
        node.elide = true; // do not emit as part of the component.
        // NB. shallow copy that shares attribs and children, but since the original
        // tag is elided, we can safely take ownership of those on the new tag.
        // const copyOfTag = new ast.Tag('link', node.attribs, node.children);

        // add this to the tag-defn as a head-inject tag, so any page or
        // component that uses this component will include it (unique)
        // ^ such a tag cannot be conditional or repeated -- perhaps later? (OR all conditions)
        defn.linkTags.push(node);
      }
    }
  }

  reportUnused(node, validForLinkCSS, filename);
  assertEmpty(node, filename);
}

function parseStyleTag(tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  // collect the text node(s) inside the tag.
  const filename = tpl.filename;
  const fragments: string[] = [];
  for (let child of node.children) {
    if (child instanceof ast.Text) {
      fragments.push(child.text);
    } else {
      error('unexpected tag <'+child.tag+'> inside style tag: '+reconstitute(node)+' in: '+filename);
    }
  }

  const sheet = new ast.StyleSheet(filename, filename);
  allStyleSheets.push(sheet);
  parseStyleSheet(sheet, fragments.join(""));
  node.sheet = sheet;

  if (!tpl.isMain) {
    sheet.fromComponent = true;
  }

  // inline-fonts
  // collect @font-face directives from all CSS files in this style tag.
  if (node.attribs.get('inline-fonts') != null) {
    if (sheet.fromComponent) {
      error('cannot apply the "inline-fonts" attribute to a <style> tag inside a component, in '+filename);
    } else if (inlineFontFace == null) {
      inlineFontFace = node;
    }
  }

  // component-styles
  // collect inline styles for all components in this style tag.
  if (node.attribs.get('component-styles') != null) {
    if (sheet.fromComponent) {
      error('cannot apply the "component-styles" attribute to a <style> tag inside a component, in '+filename);
    } else if (componentStyles == null) {
      componentStyles = node;
    }
  }

  reportUnused(node, validForStyleTag, filename);
}


// Phase 2.

function customTagsForDefn(tpl:ast.Template, defn:ast.TagDefn):ast.DefnMap {
  // build the set of custom tags from the templates imported into this template.
  const customTags: ast.DefnMap = new Map();
  // start with all the built-in tags in our custom-tags map.
  for (let [name,defn] of builtInTpl.tags) {
    customTags.set(name, defn);
  }
  // add the custom tags imported into this TagDefn.
  // TODO: selective imports and renames.
  for (let srcTpl of defn.tplsImported) {
    for (let [name,defn] of srcTpl.tags) {
      // detect name conflicts.
      const other = customTags.get(name);
      if (other) {
        error('duplicate custom tag name "'+name+'" imported from "'+srcTpl.filename+'" and "'+other.tpl.filename+'" in: '+tpl.filename);
      } else {
        if (debugLevel) log(`=> register custom tag: '${name}' in ${tpl.filename}`);
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
        error('duplicate custom tag name "'+name+'" imported from "'+srcTpl.filename+'" and "'+other.tpl.filename+'" in: '+tpl.filename);
      } else {
        if (debugLevel) log(`=> register custom tag: '${name}' in ${tpl.filename}`);
        customTags.set(name, defn);
      }
    }
  }
  return customTags;
}

function buildTagsInTpl(tpl:ast.Template) {
  // phase 2: parse dom nodes and build the template.
  for (let [_,defn] of tpl.tags) {
    // build the set of custom tags from the components imported into this TagDefn and Template.
    const customTags = customTagsForDefn(tpl, defn);
    buildTagDefn(tpl, defn.rootNodes, defn.nodes, customTags);
  }
}

const nonWhiteSpace = /\S/;

function appendStyles(sheet:ast.StyleSheet, outNodes:ast.TplNode[], filename:string) {
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
      if (debugLevel) log(`=> merged adjacent style nodes`);
      lastNode.children.push(cssText);
    } else {
      outNodes.push(new ast.TplTag('style', new Map(), [cssText]));
    }
  }
}

function buildTagDefn(tpl:ast.Template, nodelist:ast.Node[], outNodes:ast.TplNode[], customTags:ast.DefnMap) {
  // phase 2: parse dom nodes and build the template.
  const filename = tpl.filename;
  for (let node of nodelist) {
    if (node instanceof ast.Text) {
      // parse any embedded expressions in the text content.
      parsePlaceholders(node.text, outNodes, 'text node in '+filename);
    } else if (node instanceof ast.Tag) {
      if (node.elide) continue;
      switch (node.tag) {
        case 'style': {
          // deferred until all style-sheets have loaded.
          // output CSS into an inline style tag.
          if (node.sheet) {
            appendStyles(node.sheet, outNodes, filename);
          }
          break;
        }
        default: {
          buildCustomTagOrDomTag(tpl, node, outNodes, customTags);
          break;
        }
      }
    } else {
      error('unexpected node <'+node.tag+'> in: '+filename);
    }
  }
}
      
function buildCustomTagOrDomTag(tpl:ast.Template, node:ast.Tag, outNodes:ast.TplNode[], customTags:ast.DefnMap) {
  const filename = tpl.filename;
  // resolve custom tag to its template so we can recognise its parameters.
  // warn if it's not a standard html tag and doesn't match a custom template.
  // TODO: find imports as a pre-pass, so import can be after the first use,
  // or register a proxy with a list of use-sites for reporting later.
  const tag = node.tag;
  let tagDef = customTags.get(tag);
  if (!tagDef) {
    if (!html5tags.has(tag)) {
      // not a valid HTML5 tag.
      if (deprecatedTags.has(tag)) {
        log('lint: tag is deprecated in HTML5: '+reconstitute(node)+' in: '+filename);
      } else {
        error('custom tag <'+tag+'> is not defined (or imported) in '+filename);
      }
    }
    tagDef = plainDomTag;
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
      condition = compileExpression(val, reconstitute(node)+' in: '+filename);
    } else if (key === 'repeat') {
      const terms = val.split(' in ');
      if (terms.length !== 2) {
        error('repeat attribute must be of the form repeat="x in y" in '+reconstitute(node)+' in: '+filename);
      } else {
        repeatName = trim(terms[0]);
        const from = trim(terms[1]);
        repeat = compileExpression(from, reconstitute(node)+' in: '+filename);
      }
    } else {
      const pb = params.get(key);
      if (pb == null && !anyAttrib) {
        warn('unrecognised "'+key+'" attribute on tag was ignored: '+reconstitute(node)+' in: '+filename);
      } else {
        // TODO: use pb to impose type-checks on bindings.
        // TODO: push these in order to a list.
        binds.set(key, parseAttribute(val, 'in attribute "'+key+'" of '+reconstitute(node)+' in '+filename));
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
  buildTagDefn(tpl, node.children, childNodes, customTags);

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


// Transforms.

function inlineFontFaceTransform(hostTag: ast.Tag, filename:string) {
  // move @font-face directives from all CSS files and <style> tags to the specified <style> tag.
  const hostStyles = hostTag.sheet && hostTag.sheet.ast;
  if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
    const uniqueFonts: Map<string,CSSTree.ListItem> = new Map();
    for (let sheet of allStyleSheets) {
      const styles = sheet.ast;
      if (styles && styles.type === 'StyleSheet' && styles.children) {
        const children = styles.children;
        children.each(function(rule, listItem){
          if (rule.type === 'Atrule' && rule.name === 'font-face') {
            const key = csstree.translate(rule);
            if (debugLevel) log(`=> remove ${key} from: ${sheet.filename}`);
            children.remove(listItem); // NB. remove updates the 'each' iterator.
            uniqueFonts.set(key, listItem);
          }
        });
      } else {
        error('inline-fonts: <style> tag is invalid in: '+sheet.filename);
      }
    }
    for (let [_,rule] of uniqueFonts) {
      hostStyles.children.append(rule); // take ownership of ListItem.
    }
  } else {
    error('inline-fonts: <style> tag is invalid in: '+filename);
  }
}

function componentStylesTransform(hostTag: ast.Tag, filename:string) {
  // move inline component styles from all components to the specified <style> tag.
  const hostStyles = hostTag.sheet && hostTag.sheet.ast;
  if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
    for (let sheet of allStyleSheets) {
      if (sheet.fromComponent) {
        const styles = sheet.ast;
        if (styles && styles.type === 'StyleSheet' && styles.children) {
          const children = styles.children;
          children.each(function(rule, listItem){
            children.remove(listItem); // NB. remove updates the 'each' iterator.
            hostStyles.children.append(listItem); // take ownership of ListItem.
          });
        } else {
          error('component-styles: <style> tag is invalid in: '+sheet.filename);
        }
      }
    }
  } else {
    error('component-styles: <style> tag is invalid in: '+filename);
  }
}


// Controller.

function toJSON(data:any) {
  const seen: Set<any> = new Set();
  function debugReplacer(key:any, val:any) {
    if (typeof(val)==='object') {
      if (seen.has(val)) {
        return '#ref';
      }
      seen.add(val);
    }
    if (val instanceof Map || val instanceof Set) {
      return [...val];
    }
    return val;
  }
  return JSON.stringify(data,debugReplacer,2);
}

const outDir = 'build';

export function compileTarget(filename:string) {
  // phase 1: parse the main template and all imported templates.
  const fullPath = path.resolve(filename);
  const mainTpl = new ast.Template(fullPath);
  mainTpl.isMain = true;
  templateCache.set(fullPath, mainTpl);
  templateQueue.push(mainTpl);
  for (let ti=0; ti<templateQueue.length; ++ti) { // NB. MUST use a counter; templateQueue grows.
    if (debugLevel) log(`=> loadTemplate: ${templateQueue[ti].filename}`);
    loadTemplate(templateQueue[ti]);
  }
  for (let si=0; si<loadedStyleSheets.length; ++si) { // NB. MUST use a counter; loadedStyleSheets grows.
    if (debugLevel) log(`=> loadStyleSheet: ${loadedStyleSheets[si].filename}`);
    loadStyleSheet(loadedStyleSheets[si]);
  }
  // phase 1.5: apply global transforms.
  if (inlineFontFace != null) {
    inlineFontFaceTransform(inlineFontFace, filename);
  }
  if (componentStyles != null) {
    componentStylesTransform(componentStyles, filename);
  }
  // phase 2: compile each custom tag defined in each template.
  for (let tpl of templateQueue) {
    buildTagsInTpl(tpl);
  }
  // load test data.
  var knownData: any = {}; // from <link rel="test-data">
  if (testDataUrl) {
    const dataFile = path.resolve(path.dirname(filename), testDataUrl);
    if (!fs.existsSync(dataFile)) {
      error('not found: '+dataFile+' imported from '+filename);
    } else {
      knownData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  }
  mkdirp(outDir, (err)=>{
    if (err) {
      return error(`cannot create directory: ${outDir}`);
    }
    fs.writeFileSync(`${outDir}/index.json`, toJSON(mainTpl), 'utf8');
    const htmlTag = mainTpl.tags.get('html');
    if (htmlTag) {
      const html = generateHTML(htmlTag, knownData);
      fs.writeFileSync(`${outDir}/index.html`, html, 'utf8');
    } else {
      error('the main template must contain a <html> tag entry-point: '+filename);
    }
    if (numWarnings) log(`${numWarnings} warning${numWarnings>1?'s':''}.`);
    if (numErrors) log(`${numErrors} error${numErrors>1?'s':''}.`);
    //fs.writeFileSync(`${outDir}/binds.js`, JSON.stringify(decl.binds), 'utf8');
  });
}
