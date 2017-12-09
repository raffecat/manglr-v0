import * as fs from 'fs';
import * as ast from './ast';
import { ParserState } from './parser-state';
import csstree = require('css-tree');
import fetch = require('fetch'); // supports redirects with cookies, iconv to utf-8.

const version:string = JSON.parse(fs.readFileSync(__dirname+'/../package.json','utf8')).version;

const absoluteUrlPattern = /^[A-Za-z]:|^\//;

const fetchUrlOptions = {
  asyncDnsLoookup: true,
  maxResponseLength: 4096 * 1048576, // 4 GB.
  headers: {
    "User-Agent": "manglr/"+version
  }
};

export function loadStyleSheet(ps:ParserState, sheet:ast.StyleSheet, cb:any) {
  if (ps.debugLevel) ps.debug(`=> loadStyleSheet: ${sheet.filename}`);
  const usedFrom: string|null = sheet.usedFrom[0];
  const url = sheet.filename;
  if (/^https?:\/\/[^\/]+/.test(url)) {
    // ^ otherwise fetch crashes at Resolver.queryA "name" argument must be a string.
    console.log("downloading: "+url);
    fetch.fetchUrl(url, fetchUrlOptions, function (err:any, meta:{status:number}, body:string) {
      if (err || meta.status !== 200) {
        ps.error('download failed: '+url+(usedFrom ? ' imported from '+usedFrom : ''));
      } else {
        parseStyleSheet(ps, sheet, body);
      }
      cb();
    });
  } else {
    const filename = url.replace(/\?.*$/,'').replace(/^file:\/\//,''); // remove query-string and 'file://' prefix.
    console.log("reading: "+filename);
    fs.readFile(filename, 'utf8', function (err:any, source:string) {
      if (err) {
        const message = err.code==='ENOENT' ? `not found: ${filename}` : `${err}`;
        ps.error(message+(usedFrom ? ' imported from '+usedFrom : ''));
        return cb();
      } else {
        const source = fs.readFileSync(filename, 'utf8');
        parseStyleSheet(ps, sheet, source);
        cb();
      }
    });
  }
}

export function parseStyleSheet(ps:ParserState, sheet:ast.StyleSheet, source:string) {

  sheet.ast = csstree.parse(source, {
    context: 'stylesheet',
    positions: true,
    filename: sheet.filename,
    offset: 0, // node.offset, // FIXME: need location from HTML parser.
    line: 1, // node.line,
    column: 1, // node.column,
    tolerant: true, // activates onParseError handler!
    onParseError: function(error:any) {
      ps.error(`${error} in ${sheet.filename}`);
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
