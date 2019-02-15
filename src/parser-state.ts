import { loadTemplate } from './component-phase';
import { loadStyleSheet } from './parse-css';
import * as ast from './ast';
import * as path from 'path';
import * as URL from 'url';
import queue = require('queue');

type TemplateMap = Map<string, ast.Template>;
type StyleSheetMap = Map<string, ast.StyleSheet>;

const hasProtocol = /^[A-Za-z]:/;

export class ParserState {

  readonly queue: any = queue(); // async jobs.

  readonly templateCache: TemplateMap = new Map(); // global template cache: template file -> parsed template object.
  readonly allTemplates: ast.Template[] = []; // global list of templates to compile.

  readonly cssCache: StyleSheetMap = new Map(); // global css cache.
  readonly loadedStyleSheets: ast.StyleSheet[] = []; // global queue of css files to load and parse.

  readonly allScripts: ast.Script[] = []; // global list of script tags.

  // FIXME: use of this is always wrong: the set of style-sheets that matter
  // in any top-level html-page depend on the set of components actually used.
  readonly allStyleSheets: ast.StyleSheet[] = []; // global set of style sheets.

  debugLevel: number = 0;
  numErrors: number = 0;
  numWarnings: number = 0;

  constructor(public siteRootURL: string) {}

  error(msg: string) {
    console.log('E: '+msg);
    this.numErrors++;
  }

  warn(msg: string) {
    console.log('warning: '+msg);
    this.numWarnings++;
  }

  lint(msg: string) {
    console.log('lint: '+msg);
  }

  debug(msg: string) {
    console.log('debug: '+msg);
  }

  resolveURL(url:string, usedFrom:string) {
    // url: remote 'http://', absolute '/foo/bar' or relative 'foo/bar'
    // usedFrom: remote 'http://' or local 'file:///' (from makeAbsolute)
    if (hasProtocol.test(url)) {
      return url; // already resolved if it has a protocol.
    }
    // resolve as a relative path from either the configured siteRootURL (if absolute)
    // or relative to the URL of the resource it was included from.
    const baseURL = /^\//.test(url) ? this.siteRootURL : usedFrom;
    const relPath = /^\//.test(url) ? url.substring(1) : url;
    return URL.resolve(baseURL, relPath);
  }

  useTemplate(filename:string, usedFrom:string) {
    // get a Template (an empty, un-loaded proxy) by filename.
    const fullPath = path.resolve(path.dirname(usedFrom), filename);
    const cachedTpl = this.templateCache.get(fullPath);
    if (cachedTpl) {
      cachedTpl.usedFrom.push(usedFrom);
      return cachedTpl;
    }
    const tpl = new ast.Template(fullPath, usedFrom);
    this.allTemplates.push(tpl);
    this.templateCache.set(fullPath, tpl);
    this.queue.push((cb:any) => {
      loadTemplate(this, tpl, cb);
    });
    return tpl;
  }

  importCSS(url:string, usedFrom:string) {
    // get a CSSFile (an empty, un-loaded proxy) by filename.
    const absUrl = this.resolveURL(url, usedFrom);
    const cached = this.cssCache.get(absUrl);
    if (cached) {
      cached.usedFrom.push(usedFrom);
      return cached;
    }
    const sheet = new ast.StyleSheet(absUrl, usedFrom);
    this.allStyleSheets.push(sheet);
    this.loadedStyleSheets.push(sheet);
    this.cssCache.set(absUrl, sheet);
    this.queue.push((cb:any) => {
      loadStyleSheet(this, sheet, cb);
    });
    return sheet;
  }

}
