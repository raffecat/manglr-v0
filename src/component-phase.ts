import * as fs from 'fs';
import * as ast from './ast';
import { parseToDOM } from './parse-html';
import { ParserState } from './parser-state';
import { html5 as html5tags } from './dom-spec';
import { reconstitute, reportUnused, assertEmpty } from './report';
import { parseStyleSheet } from './parse-css';

const validForStyleTag = new Set(['inline-fonts','component-styles']);
const validForLinkCSS = new Set(['rel','href','inline','bundle']);
const validForImportTag = new Set(['src']);

// A pre-pass to find <import> and <component> tags (to load HTML)
// and <link rel='stylesheet' inline> tags (to load CSS)

// also record <style inline-fonts> and <style component-styles> on
// main templates so we can move styles there in a later pass.

// also attach <meta>, <link>, <script move-to-> tags to the tag-defn within
// components and index the components used within each component, so each
// main template can build its own set of head and footer tags.

function parseImportTag(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn|null, node:ast.Tag) {
  // import tag (elided from output)
  node.elide = true;
  const filename = tpl.filename;
  const src = node.attribs.get('src');
  if (src) {
    if (ps.debugLevel) ps.debug(`=> import: '${src}' in ${filename}`);
    const pendingTpl = ps.useTemplate(src, filename);
    if (defn != null) {
      // scope the import to this TagDefn, instead of the whole template.
      defn.tplsImported.push(pendingTpl);
    } else {
      // scope the import to the whole template (and every TagDefn inside it)
      tpl.tplsImported.push(pendingTpl);
    }
  } else {
    ps.error('missing "src" attribute on '+reconstitute(node)+' in: '+filename);
  }
  reportUnused(ps, node, validForImportTag, filename);
  assertEmpty(ps, node, filename);
}

function parseComponentTag(ps:ParserState, tpl:ast.Template, node:ast.Tag) {
  // inline component tag (elided from output)
  node.elide = true;
  const tagName = node.attribs.get('name');
  if (tagName) {
    const other = tpl.tags.get(tagName);
    if (other) {
      ps.error('duplicate custom tag name "'+tagName+'" declared on '+reconstitute(node)+' (and elsewhere in the same file) in: '+tpl.filename);
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
      findComponents(ps, tpl, defn, node.children);
    }
  } else {
    ps.error('missing "name" attribute on '+reconstitute(node)+' in: '+tpl.filename);
  }
}

function parseHTMLTag(ps:ParserState, tpl:ast.Template, node:ast.Tag) {
  if (tpl.isMain) {
    const children = [node]; // the <html> tag is part of the contents of this "component".
    const defn = new ast.TagDefn(tpl, 'html', children);
    if (tpl.tags.get('html')) {
      ps.error('more than one top-level <html> tag found, in: '+tpl.filename);
    }
    tpl.tags.set('html', defn);
    findComponents(ps, tpl, defn, children);
  } else {
    ps.error('imported HTML components cannot have a top-level <html> tag, in: '+tpl.filename);
  }
}

function parseTestDataTag(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  node.elide = true;
  const href = node.attribs.get('href');
  if (!href) {
    ps.warn('missing "href" attribute on tag: '+reconstitute(node)+' in: '+tpl.filename);
  } else {
    tpl.testDataUrl = href;
  }
}

function parseLinkRelTag(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  const filename = tpl.filename;
  const href = node.attribs.get('href');
  if (!href) {
    ps.warn('missing "href" attribute on tag: '+reconstitute(node)+' in: '+filename);
  } else {
    const proxy = ps.importCSS(href, filename);
    tpl.sheetsImported.push(proxy);

    // inline
    // move the contents of this style-sheet (and its imports) into an inline <style> tag.
    if (node.attribs.get('inline') != null) {
      if (ps.debugLevel) ps.debug('=> replacing '+reconstitute(node)+' with contents of "'+href+'" in: '+filename);
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

  reportUnused(ps, node, validForLinkCSS, filename);
  assertEmpty(ps, node, filename);
}

function parseStyleTag(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn, node:ast.Tag) {
  // collect the text node(s) inside the tag.
  const filename = tpl.filename;
  const fragments: string[] = [];
  for (let child of node.children) {
    if (child instanceof ast.Text) {
      fragments.push(child.text);
    } else {
      ps.error('unexpected tag <'+child.tag+'> inside style tag: '+reconstitute(node)+' in: '+filename);
    }
  }

  const sheet = new ast.StyleSheet(filename, filename);
  ps.allStyleSheets.push(sheet);
  parseStyleSheet(ps, sheet, fragments.join(""));
  node.sheet = sheet;

  if (!tpl.isMain) {
    sheet.fromComponent = true;
  }

  // inline-fonts
  // collect @font-face directives from all CSS files in this style tag.
  if (node.attribs.get('inline-fonts') != null) {
    if (sheet.fromComponent) {
      ps.error('cannot apply the "inline-fonts" attribute to a <style> tag inside a component, in '+filename);
    } else if (tpl.inlineFontFace == null) {
      tpl.inlineFontFace = node;
    }
  }

  // component-styles
  // collect inline styles for all components in this style tag.
  if (node.attribs.get('component-styles') != null) {
    if (sheet.fromComponent) {
      ps.error('cannot apply the "component-styles" attribute to a <style> tag inside a component, in '+filename);
    } else if (tpl.componentStyles == null) {
      tpl.componentStyles = node;
    }
  }

  reportUnused(ps, node, validForStyleTag, filename);
}

function findComponents(ps:ParserState, tpl:ast.Template, defn:ast.TagDefn, nodelist:ast.Node[]) {
  // phase 1: find "import" and inline "component" nodes.
  for (let node of nodelist) {
    if (node instanceof ast.Tag) {
      switch (node.tag) {
        case 'import':
          parseImportTag(ps, tpl, defn, node);
          break;
        case 'component':
          parseComponentTag(ps, tpl, node);
          break;
        case 'link':
          const rel = node.attribs.get('rel');
          if (!rel) {
            ps.warn('missing "ref" attribute on tag: '+reconstitute(node)+' in: '+tpl.filename);
          } else if (rel === 'test-data') {
            parseTestDataTag(ps, tpl, defn, node);
          } else if (rel === 'stylesheet') {
            parseLinkRelTag(ps, tpl, defn, node);
          }
          break;
        case 'style':
          parseStyleTag(ps, tpl, defn, node);
          break;
        default:
          // walk child nodes recursively.
          findComponents(ps, tpl, defn, node.children);
          break;
      }
    }
  }
}

function parseTemplate(ps:ParserState, tpl:ast.Template, rootNodes:ast.Node[]) {
  // each top-level Element is a component declaration.
  for (let node of rootNodes) {
    if (node instanceof ast.Tag) {
      switch (node.tag) {
        case 'import':
          parseImportTag(ps, tpl, null, node);
          break;
        case 'component':
          parseComponentTag(ps, tpl, node);
          break;
        case 'html':
          parseHTMLTag(ps, tpl, node);
          break;
        default:
          // must be a component definition (custom tag)
          if (html5tags.has(node.tag)) {
            ps.warn('HTML component tag '+reconstitute(node)+' should not use a standard HTML5 tag name, in: '+tpl.filename);
          }
          // make a tag defn for each root element.
          const defn = new ast.TagDefn(tpl, node.tag, node.children);
          if (ps.debugLevel) ps.debug(`=> new TagDefn '${defn.tagName}' in tpl ${tpl.filename}`);
          tpl.tags.set(defn.tagName, defn);
          // parse the attributes (parameters of the custom tag)
          for (let [name,val] of node.attribs) {
            defn.params.set(name, val);
          }
          // phase 1: find inline components and imports.
          findComponents(ps, tpl, defn, node.children);
          break;
      }
    } else {
      ps.lint('ignored root element of type '+node.tag+' in template: '+tpl.filename);
    }
  }
}

// TODO: <meta charset> handling: convert components to the main template charset?

export function loadTemplate(ps:ParserState, tpl:ast.Template) {
  // Load and compile a template from its source file.
  const filename = tpl.filename;
  const usedFrom: string|null = tpl.usedFrom[0];
  if (!fs.existsSync(filename)) {
    ps.error('not found: '+filename+(usedFrom ? ' imported from '+usedFrom : ''));
    return; // cannot load.
  }
  const source = fs.readFileSync(filename, 'utf8');
  const doc = parseToDOM(source, filename);
  if (tpl.isMain && !doc.hasDocType) {
    // top-level documents must have a doctype.
    ps.lint('missing <!DOCTYPE html> in '+filename);
  }
  parseTemplate(ps, tpl, doc.children);
}
