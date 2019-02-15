"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_phase_1 = require("./component-phase");
const parse_css_1 = require("./parse-css");
const ast = require("./ast");
const path = require("path");
const URL = require("url");
const queue = require("queue");
const hasProtocol = /^[A-Za-z]:/;
class ParserState {
    constructor(siteRootURL) {
        this.siteRootURL = siteRootURL;
        this.queue = queue(); // async jobs.
        this.templateCache = new Map(); // global template cache: template file -> parsed template object.
        this.allTemplates = []; // global list of templates to compile.
        this.cssCache = new Map(); // global css cache.
        this.loadedStyleSheets = []; // global queue of css files to load and parse.
        this.allScripts = []; // global list of script tags.
        // FIXME: use of this is always wrong: the set of style-sheets that matter
        // in any top-level html-page depend on the set of components actually used.
        this.allStyleSheets = []; // global set of style sheets.
        this.debugLevel = 0;
        this.numErrors = 0;
        this.numWarnings = 0;
    }
    error(msg) {
        console.log('E: ' + msg);
        this.numErrors++;
    }
    warn(msg) {
        console.log('warning: ' + msg);
        this.numWarnings++;
    }
    lint(msg) {
        console.log('lint: ' + msg);
    }
    debug(msg) {
        console.log('debug: ' + msg);
    }
    resolveURL(url, usedFrom) {
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
    useTemplate(filename, usedFrom) {
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
        this.queue.push((cb) => {
            component_phase_1.loadTemplate(this, tpl, cb);
        });
        return tpl;
    }
    importCSS(url, usedFrom) {
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
        this.queue.push((cb) => {
            parse_css_1.loadStyleSheet(this, sheet, cb);
        });
        return sheet;
    }
}
exports.ParserState = ParserState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VyLXN0YXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BhcnNlci1zdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHVEQUFpRDtBQUNqRCwyQ0FBNkM7QUFDN0MsNkJBQTZCO0FBQzdCLDZCQUE2QjtBQUM3QiwyQkFBMkI7QUFDM0IsK0JBQWdDO0FBS2hDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQztBQUVqQztJQW9CRSxZQUFtQixXQUFtQjtRQUFuQixnQkFBVyxHQUFYLFdBQVcsQ0FBUTtRQWxCN0IsVUFBSyxHQUFRLEtBQUssRUFBRSxDQUFDLENBQUMsY0FBYztRQUVwQyxrQkFBYSxHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsa0VBQWtFO1FBQzFHLGlCQUFZLEdBQW1CLEVBQUUsQ0FBQyxDQUFDLHVDQUF1QztRQUUxRSxhQUFRLEdBQWtCLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQyxvQkFBb0I7UUFDekQsc0JBQWlCLEdBQXFCLEVBQUUsQ0FBQyxDQUFDLCtDQUErQztRQUV6RixlQUFVLEdBQWlCLEVBQUUsQ0FBQyxDQUFDLDhCQUE4QjtRQUV0RSwwRUFBMEU7UUFDMUUsNEVBQTRFO1FBQ25FLG1CQUFjLEdBQXFCLEVBQUUsQ0FBQyxDQUFDLDhCQUE4QjtRQUU5RSxlQUFVLEdBQVcsQ0FBQyxDQUFDO1FBQ3ZCLGNBQVMsR0FBVyxDQUFDLENBQUM7UUFDdEIsZ0JBQVcsR0FBVyxDQUFDLENBQUM7SUFFaUIsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBVztRQUNmLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBRUQsSUFBSSxDQUFDLEdBQVc7UUFDZCxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3QixJQUFJLENBQUMsV0FBVyxFQUFF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