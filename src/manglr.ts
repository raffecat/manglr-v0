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
import csstree = require("css-tree");

const log = console.log;

const hasProtocol = /^[A-Za-z]:/;
//const isLocalURL = /^file:\/\/\//;
const absoluteUrlPattern = /^[A-Za-z]:|^\//;
const validForScriptImport = new Set(['src']);
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

function reconstitute(tag:string, attribs:ast.AttrMap) {
  let res = '<'+tag;
  for (let [key,val] of attribs) {
    res = res + ' ' + key + '="' + val.replace(/"/g,'&quot;') + '"'
  }
  return res; // NB. closing '>' or '/>' is up to the caller.
}

function reportUnused(tag:string, attribs:ast.AttrMap, allow:Set<string>, filename:string) {
  for (let [key,_] of attribs) {
    if (!allow.has(key)) {
      warn('unrecognised "'+key+'" attribute was ignored: '+reconstitute(tag,attribs)+'> in: '+filename);
    }
  }
}

function compileExpression(source:string, where:string) {
  return new ast.Expression(source, where); // TODO.
}

function textTemplate(source:string, where:string) {
  // "some {embeds} inside a {text} template."
  // ["some ", {}, " inside a ", {}, " template."]
  const nodes: ast.TextTPlNode[] = [];
  const spans = source.split('{');
  // ^ ["some ","embeds} inside a ","text} template."]
  const pre = spans[0]; // text before the first '{' (can be empty)
  if (pre) {
    nodes.push(new ast.Text(pre, where)); // literal text: normWS(pre)
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
    nodes.push(compileExpression(expr, where));
    if (post.length) {
      nodes.push(new ast.Text(post, where)); // literal text: normWS(post)
    }
  }
  return new ast.TextTemplate(nodes, where);
}

function parseText(source:string, where:string) {
  // recognise the difference between a direct-value binding and a text template.
  // a direct-value binding contains a single expression, e.g. attrib="{ foo }"
  // and will be passed through as a non-string binding object (the receiver might
  // coerce its value to a string, however.)
  if (/^\{(.*)\}$/.test(source)) {
    // binding is a single expression: provide it as a direct-value binding.
    return compileExpression(source.substring(1,source.length-1), where);
  } else if (source.indexOf('{') >= 0) {
    // binding is a text template: provide a string-value binding.
    return textTemplate(source, where);
  } else {
    // attribute has a literal value.
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

function loadTemplate(tpl:ast.Template) {
  // Load and compile a template from its source file.
  const filename = tpl.filename, usedFrom: string|null = tpl.usedFrom[0];
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
  for (let rootNode of rootNodes) {
    if (rootNode instanceof ast.Tag) {
      // make a tag defn for each root element.
      const domNodes = tpl.isMain ? [rootNode] : rootNode.children;
      const defn = new ast.TagDefn(tpl, rootNode.tag, domNodes);
      if (debugLevel) log(`=> new TagDefn '${defn.tagName}' in tpl ${tpl.filename}`);
      tpl.tags.set(defn.tagName, defn);
      // parse the attributes (parameters of the custom tag)
      for (let [name,val] of rootNode.attribs) {
        defn.params.set(name, val);
      }
      // phase 1: find inline components and imports.
      findComponents(tpl, rootNode.children);
    } else {
      log('lint: ignored root element of type '+rootNode.tag+' in template: '+tpl.filename);
    }
  }
}

function findComponents(tpl:ast.Template, nodelist:ast.Node[]) {
  // phase 1: find "import" and inline "component" nodes.
  const filename = tpl.filename;
  for (let node of nodelist) {
    if (node instanceof ast.Tag) {

      const tag = node.tag, attribs = node.attribs;
      if (tag === "import") {

        // import tag (elided from output)
        const src = attribs.get('src');
        if (debugLevel) log(`=> import: '${src}' in ${tpl.filename}`);
        if (src) {
          const pendingTpl = useTemplate(src, filename);
          tpl.tplsImported.push(pendingTpl);
          reportUnused(tag, attribs, validForScriptImport, filename);
          if (node.children.length) {
            error('import tag cannot have children: '+reconstitute(tag,attribs)+'> in: '+filename);
          }
        } else {
          error('missing "src" attribute on template import: '+reconstitute(tag,attribs)+'> in: '+filename);
        }

        reportUnused(tag, attribs, validForImportTag, filename);

      } else if (tag === "component") {

        // inline template tag (elided from output)
        const tagName = attribs.get('name');
        if (tagName) {
          const other = tpl.tags.get(tagName);
          if (other) {
            error('duplicate custom tag name "'+tagName+'" declared on '+reconstitute(tag,attribs)+'> (and elsewhere in the same file) in: '+filename);
          } else {
            // make a tag defn for the inline component.
            const defn = new ast.TagDefn(tpl, tagName, node.children);
            // parse the attributes (parameters of the custom tag)
            for (let [name,val] of attribs) {
              if (name !== 'name') {
                defn.params.set(name, val);
              }
            }
            tpl.tags.set(defn.tagName, defn);
          }
        } else {
          error('missing name attribute on inline component: '+reconstitute(tag,attribs)+'> in: '+filename);
        }

        // walk child nodes recursively to find components.
        findComponents(tpl, node.children);

      } else if (tag === 'link' && attribs.get('rel') === 'stylesheet') {

        const href = attribs.get('href');
        if (!href) {
          warn('missing "href" attribute on tag: '+reconstitute(tag,attribs)+'> in: '+filename);
        } else {
          const proxy = importCSS(href, filename);
          tpl.sheetsImported.push(proxy);

          // inline
          // move the contents of this style-sheet (and its imports) into an inline <style> tag.
          if (attribs.get('inline') != null) {
            if (debugLevel) log('=> replacing '+reconstitute(tag,attribs)+'> with contents of "'+href+'" in: '+filename);
            node.sheet = proxy; // mark this tag to be replaced with inline styles.
          }
        }

        reportUnused(tag, attribs, validForLinkCSS, filename);

      } else if (tag === 'style') {

        // collect the text node(s) inside the tag.
        const fragments: string[] = [];
        for (let child of node.children) {
          if (child instanceof ast.Text) {
            fragments.push(child.text);
          } else {
            error('unexpected tag <'+child.tag+'> inside style tag: '+reconstitute(tag,attribs)+'> in: '+filename);
          }
        }

        const sheet = new ast.StyleSheet(filename, filename);
        allStyleSheets.push(sheet);
        parseStyleSheet(sheet, fragments.join(""));
        node.sheet = sheet;

        // inline-fonts
        // collect @font-face directives from all CSS files in this style tag.
        if (attribs.get('inline-fonts') != null && inlineFontFace == null) {
          inlineFontFace = node;
        }

        // component-styles
        // collect inline styles for all components in this style tag.
        if (attribs.get('component-styles') != null && componentStyles == null) {
          componentStyles = node;
        }

        reportUnused(tag, attribs, validForStyleTag, filename);

      } else {

        // template import can be placed on the tag itself (elided from output)
        // TODO: does this still make sense when an import can define multiple tags?
        const importSrc = attribs.get('import');
        if (importSrc) {
          const pendingTpl = useTemplate(importSrc, filename);
          tpl.tplsImported.push(pendingTpl);
        }

        // walk child nodes recursively to find components.
        findComponents(tpl, node.children);
      }
    }
  }
}

// XXX: decide on the runtime formats here: the template will be compiled as static HTML
// for the purposes of rendering its initial state or rendering pre-populated views.
// -> on the client side we need to be able to synthesize dom trees for if/each nodes.
//    generate a doc-fragment template for each one on the client-side? [many ways, pick one!]
//    avoid adjacent comments. use empty text nodes as placeholders.

// server-side rendering: ideally we want something of the form:
// return ['<!DOCTYPE html><html><body><div>', esc(.. generated data expr ..), '</div></body></html>'].join('');

// client-side rendering: walk a flat array of the form:
// [tag-idx, tpl-idx, n-stat, ( name-idx, val-idx ), n-bind, ( name-idx, binder-idx ), n-child, ( data for n children ... ) ]
// tag-idx is into a table of DOM node types and re-use lists of same.
// tpl-idx is into a list of template bind functions (custom tag controllers)



// Phase 2.

function customTagsForTpl(tpl:ast.Template):ast.DefnMap {
  // build the set of custom tags from the templates imported into this template.
  const customTags: ast.DefnMap = new Map();
  // start with all the built-in tags in our custom-tags map.
  for (let [name,defn] of builtInTpl.tags) {
    customTags.set(name, defn);
  }
  // now add the custom tags defined in each imported template.
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
  // build the set of custom tags from the templates imported into this template.
  const customTags = customTagsForTpl(tpl);
  // phase 2: parse dom nodes and build the template.
  for (let [_,defn] of tpl.tags) {
    buildTagDefn(tpl, defn.rootNodes, defn.nodes, customTags);
  }
}

const nonWhiteSpace = /\S/;

function appendStyles(sheet:ast.StyleSheet, outNodes:ast.TplNode[], filename:string) {
  const cssText = new ast.Text(csstree.translate(sheet.ast), filename, /*markup*/true);
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

function buildTagDefn(tpl:ast.Template, nodelist:ast.Node[], outNodes:ast.TplNode[], customTags:ast.DefnMap) {
  // phase 2: parse dom nodes and build the template.
  const filename = tpl.filename;
  for (let node of nodelist) {
    if (node instanceof ast.Text) {
      // parse any embedded expressions in the text content.
      outNodes.push(parseText(node.text, 'text node in '+filename));
    } else if (node instanceof ast.Tag) {
      const tag = node.tag, attribs = node.attribs;
      if (tag === 'style') {
        // output CSS into an inline style tag.
        if (node.sheet) {
          appendStyles(node.sheet, outNodes, filename);
        }
      } else if (tag === 'link' && attribs.get('rel') === 'stylesheet' && node.sheet != null) {
        // replace the link tag with a style tag containing the css.
        appendStyles(node.sheet, outNodes, filename);
      } else if (tag !== "import" && tag !== "component") {

        // resolve custom tag to its template so we can recognise its parameters.
        // warn if it's not a standard html tag and doesn't match a custom template.
        // TODO: find imports as a pre-pass, so import can be after the first use,
        // or register a proxy with a list of use-sites for reporting later.
        let tagDef = customTags.get(tag);
        if (!tagDef) {
          if (!html5tags.has(tag)) {
            // not a valid HTML5 tag.
            if (deprecatedTags.has(tag)) {
              log('lint: tag is deprecated in HTML5: '+reconstitute(tag,attribs)+'> in: '+filename);
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
        const params = tagDef.params, anyAttrib = tagDef.anyAttrib;
        const binds: ast.BindingMap = new Map();
        for (let [key,val] of attribs) {
          // directives.
          // TODO: custom directive lookups.
          if (key === 'if') {
            condition = compileExpression(val, reconstitute(tag,attribs)+'> in: '+filename);
          } else if (key === 'repeat') {
            repeat = compileExpression(val, reconstitute(tag,attribs)+'> in: '+filename);
          } else {
            const pb = params.get(key);
            if (!pb && !anyAttrib) {
              warn('unrecognised "'+key+'" attribute on tag was ignored: '+reconstitute(tag,attribs)+'> in: '+filename);
            }
            // TODO: use pb to impose type-checks on bindings.
            // TODO: push these in order to a list.
            binds.set(key, parseText(val, "in attribute '"+key+"' of "+reconstitute(tag,attribs)+"> in "+filename));
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
        if (repeat != null) {
          appendNode = new ast.TplRepeat('TODO', repeat, [appendNode]);
        }
        if (condition != null) {
          appendNode = new ast.TplCond(condition, [appendNode]);
        }
        outNodes.push(appendNode);
      }
    } else {
      error('unexpected node <'+node.tag+'> in: '+filename);
    }
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
  // phase 2: compile each custom tag defined in each template.
  for (let tpl of templateQueue) {
    buildTagsInTpl(tpl);
  }
  fs.writeFileSync('out/index.json', toJSON(mainTpl), 'utf8');
  const htmlTag = mainTpl.tags.get('html');
  if (htmlTag) {
    const html = generateHTML(htmlTag);
    fs.writeFileSync('out/index.html', html, 'utf8');
  } else {
    error('the main template must contain a <html> tag entry-point: '+filename);
  }
  if (numWarnings) log(`${numWarnings} warning${numWarnings>1?'s':''}.`);
  if (numErrors) log(`${numErrors} error${numErrors>1?'s':''}.`);
  //fs.writeFileSync('out/binds.js', JSON.stringify(decl.binds), 'utf8');
}
