"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const csstree = require("css-tree");
const fetch = require("fetch"); // supports redirects with cookies, iconv to utf-8.
const version = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version;
const absoluteUrlPattern = /^[A-Za-z]:|^\//;
const fetchUrlOptions = {
    asyncDnsLoookup: true,
    maxResponseLength: 4096 * 1048576,
    headers: {
        "User-Agent": "manglr/" + version
    }
};
function loadStyleSheet(ps, sheet, cb) {
    if (ps.debugLevel)
        ps.debug(`=> loadStyleSheet: ${sheet.filename}`);
    const usedFrom = sheet.usedFrom[0];
    const url = sheet.filename;
    if (/^https?:\/\/[^\/]+/.test(url)) {
        // ^ otherwise fetch crashes at Resolver.queryA "name" argument must be a string.
        console.log("downloading: " + url);
        fetch.fetchUrl(url, fetchUrlOptions, function (err, meta, body) {
            if (err || meta.status !== 200) {
                ps.error('download failed: ' + url + (usedFrom ? ' imported from ' + usedFrom : ''));
            }
            else {
                parseStyleSheet(ps, sheet, body);
            }
            cb();
        });
    }
    else {
        const filename = url.replace(/\?.*$/, '').replace(/^file:\/\//, ''); // remove query-string and 'file://' prefix.
        console.log("reading: " + filename);
        fs.readFile(filename, 'utf8', function (err, source) {
            if (err) {
                const message = err.code === 'ENOENT' ? `not found: ${filename}` : `${err}`;
                ps.error(message + (usedFrom ? ' imported from ' + usedFrom : ''));
                return cb();
            }
            else {
                const source = fs.readFileSync(filename, 'utf8');
                parseStyleSheet(ps, sheet, source);
                cb();
            }
        });
    }
}
exports.loadStyleSheet = loadStyleSheet;
function parseStyleSheet(ps, sheet, source) {
    sheet.ast = csstree.parse(source, {
        context: 'stylesheet',
        positions: true,
        filename: sheet.filename,
        offset: 0,
        line: 1,
        column: 1,
        tolerant: true,
        onParseError: function (error) {
            ps.error(`${error} in ${sheet.filename}`);
        }
    });
    // find CSS @import statements within the parsed CSS and queue them for loading.
    csstree.walk(sheet.ast, function (node) {
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
        }
        else if (this.declaration !== null && node.type === 'Url') {
            // resource url inside a css directive.
            let url = node.value;
            if (url.type === 'Raw') {
                url = url.value;
            }
            else {
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
exports.parseStyleSheet = parseStyleSheet;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UtY3NzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BhcnNlLWNzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHlCQUF5QjtBQUd6QixvQ0FBcUM7QUFDckMsK0JBQWdDLENBQUMsbURBQW1EO0FBRXBGLE1BQU0sT0FBTyxHQUFVLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLEdBQUMsa0JBQWtCLEVBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7QUFFaEcsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQztBQUU1QyxNQUFNLGVBQWUsR0FBRztJQUN0QixlQUFlLEVBQUUsSUFBSTtJQUNyQixpQkFBaUIsRUFBRSxJQUFJLEdBQUcsT0FBTztJQUNqQyxPQUFPLEVBQUU7UUFDUCxZQUFZLEVBQUUsU0FBUyxHQUFDLE9BQU87S0FDaEM7Q0FDRixDQUFDO0FBRUYsd0JBQStCLEVBQWMsRUFBRSxLQUFvQixFQUFFLEVBQU07SUFDekUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQztRQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3BFLE1BQU0sUUFBUSxHQUFnQixLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7SUFDM0IsRUFBRSxDQUFDLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuQyxpRkFBaUY7UUFDakYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUMsR0FBRyxDQUFDLENBQUM7UUFDakMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFLFVBQVUsR0FBTyxFQUFFLElBQW9CLEVBQUUsSUFBVztZQUN2RixF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