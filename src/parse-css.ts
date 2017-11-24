import * as fs from 'fs';
import * as ast from './ast';
import { ParserState } from './parser-state';
import csstree = require('css-tree');

const absoluteUrlPattern = /^[A-Za-z]:|^\//;

export function loadStyleSheet(ps:ParserState, sheet:ast.StyleSheet) {
  const filename = sheet.filename, usedFrom: string|null = sheet.usedFrom[0];
  if (!fs.existsSync(filename)) {
    ps.error('not found: '+filename+(usedFrom ? ' imported from '+usedFrom : ''));
    return; // cannot load.
  }
  const source = fs.readFileSync(filename, 'utf8');
  parseStyleSheet(ps, sheet, source);
}

export function parseStyleSheet(ps:ParserState, sheet:ast.StyleSheet, source:string) {

  sheet.ast = csstree.parse(source, {
    context: 'stylesheet',
    positions: true,
    tolerant: false,
    filename: sheet.filename,
    offset: 0, // node.offset, // FIXME: node must have these too.
    line: 1, // node.line,
    column: 1, // node.column,
    onParseError: function(error:{message:string}) {
      ps.error("CSS parse error: "+error.message+" in "+sheet.filename);
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
          const proxy = ps.importCSS(url, sheet.filename);
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
