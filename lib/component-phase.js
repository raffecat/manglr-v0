"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const ast = require("./ast");
const parse_html_1 = require("./parse-html");
const dom_spec_1 = require("./dom-spec");
const report_1 = require("./report");
const parse_css_1 = require("./parse-css");
const validForStyleTag = new Set(['type', 'inline-fonts', 'component-styles']);
const validForScriptTag = new Set(['src', 'type', 'component-scripts']);
const validForLinkCSS = new Set(['rel', 'href', 'inline', 'bundle']);
const validForImportTag = new Set(['src']);
// A pre-pass to find <import> and <component> tags (to load HTML)
// and <link rel='stylesheet' inline> tags (to load CSS)
// also record <style inline-fonts> and <style component-styles> on
// main templates so we can move styles there in a later pass.
// also attach <meta>, <link>, <script move-to-> tags to the tag-defn within
// components and index the components used within each component, so each
// main template can build its own set of head and footer tags.
function parseImportTag(ps, tpl, defn, node) {
    // import tag (elided from output)
    node.elide = true;
    const filename = tpl.filename;
    const src = node.attribs.get('src');
    if (src) {
        if (ps.debugLevel)
            ps.debug(`=> import: '${src}' in ${filename}`);
        const pendingTpl = ps.useTemplate(src, filename);
        if (defn != null) {
            // scope the import to this TagDefn, instead of the whole template.
            defn.tplsImported.push(pendingTpl);
        }
        else {
            // scope the import to the whole template (and every TagDefn inside it)
            tpl.tplsImported.push(pendingTpl);
        }
    }
    else {
        ps.error('missing "src" attribute on ' + report_1.reconstitute(node) + ' in: ' + filename);
    }
    report_1.reportUnused(ps, node, validForImportTag, filename);
    report_1.assertEmpty(ps, node, filename);
}
function parseComponentTag(ps, tpl, node) {
    // inline component tag (elided from output)
    node.elide = true;
    const tagName = node.attribs.get('name');
    if (tagName) {
        const other = tpl.tags.get(tagName);
        if (other) {
            ps.error('duplicate custom tag name "' + tagName + '" declared on ' + report_1.reconstitute(node) + ' (and elsewhere in the same file) in: ' + tpl.filename);
        }
        else {
            // make a tag defn for the inline component.
            const defn = new ast.TagDefn(tpl, tagName, node.children);
            // parse the attributes (parameters of the custom tag)
            for (let [name, val] of node.attribs) {
                if (name !== 'name') {
                    defn.params.set(name, val);
                }
            }
            tpl.tags.set(defn.tagName, defn);
            // walk child nodes recursively.
            findComponents(ps, tpl, defn, node.children);
        }
    }
    else {
        ps.error('missing "name" attribute on ' + report_1.reconstitute(node) + ' in: ' + tpl.filename);
    }
}
function parseHTMLTag(ps, tpl, node) {
    if (tpl.isMain) {
        const children = [node]; // the <html> tag is part of the contents of this "component".
        const defn = new ast.TagDefn(tpl, 'html', children);
        if (tpl.tags.get('html')) {
            ps.error('more than one top-level <html> tag found, in: ' + tpl.filename);
        }
        tpl.tags.set('html', defn);
        findComponents(ps, tpl, defn, children);
    }
    else {
        ps.error('imported HTML components cannot have a top-level <html> tag, in: ' + tpl.filename);
    }
}
function parseTestDataTag(ps, tpl, defn, node) {
    node.elide = true;
    const href = node.attribs.get('href');
    if (!href) {
        ps.warn('missing "href" attribute on tag: ' + report_1.reconstitute(node) + ' in: ' + tpl.filename);
    }
    else {
        tpl.testDataUrl = href;
    }
}
function parseLinkRelTag(ps, tpl, defn, node) {
    const filename = tpl.filename;
    const href = node.attribs.get('href');
    if (!href) {
        ps.warn('missing "href" attribute on tag: ' + report_1.reconstitute(node) + ' in: ' + filename);
    }
    else {
        const proxy = ps.importCSS(href, filename);
        tpl.sheetsImported.push(proxy);
        // inline
        // move the contents of this style-sheet (and its imports) into an inline <style> tag.
        if (node.attribs.get('inline') != null) {
            if (ps.debugLevel)
                ps.debug('=> replacing ' + report_1.reconstitute(node) + ' with contents of "' + href + '" in: ' + filename);
            node.tag = 'style';
            node.attribs.delete('inline');
            node.attribs.delete('rel');
            node.attribs.delete('href');
            // attach the sheet to be inlined during the output phase.
            node.sheet = proxy;
        }
        else {
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
    report_1.reportUnused(ps, node, validForLinkCSS, filename);
    report_1.assertEmpty(ps, node, filename);
}
function collectText(ps, tpl, node) {
    const fragments = [];
    for (let child of node.children) {
        if (child instanceof ast.Text) {
            fragments.push(child.text);
        }
        else {
            ps.error('unexpected tag <' + child.tag + '> inside ' + report_1.reconstitute(node) + ' tag in: ' + tpl.filename);
        }
    }
    return fragments.join("");
}
function parseStyleTag(ps, tpl, defn, node) {
    // collect the text node(s) inside the tag.
    const styleText = collectText(ps, tpl, node);
    node.children.length = 0;
    const filename = tpl.filename;
    const sheet = new ast.StyleSheet(filename, filename);
    ps.allStyleSheets.push(sheet);
    parse_css_1.parseStyleSheet(ps, sheet, styleText);
    node.sheet = sheet;
    if (!tpl.isMain) {
        // tag the sheet for the 'component-styles' directive.
        sheet.fromComponent = true;
    }
    // inline-fonts
    // collect @font-face directives from all CSS files in this style tag.
    if (node.attribs.get('inline-fonts') != null) {
        if (sheet.fromComponent) {
            ps.error('cannot apply the "inline-fonts" attribute to a <style> tag inside a component, in ' + filename);
        }
        else if (tpl.inlineFontFace == null) {
            tpl.inlineFontFace = node;
        }
    }
    // component-styles
    // collect inline styles for all components in this style tag.
    if (node.attribs.get('component-styles') != null) {
        if (sheet.fromComponent) {
            ps.error('cannot apply the "component-styles" attribute to a <style> tag inside a component, in ' + filename);
        }
        else if (tpl.componentStyles == null) {
            tpl.componentStyles = node;
        }
    }
    report_1.reportUnused(ps, node, validForStyleTag, filename);
}
function parseScriptTag(ps, tpl, defn, node) {
    // collect the text node(s) inside the tag.
    const scriptText = collectText(ps, tpl, node);
    node.children.length = 0;
    const filename = tpl.filename;
    const script = new ast.Script(scriptText, filename);
    ps.allScripts.push(script);
    if (!tpl.isMain) {
        // tag the script for the 'component-scripts' directive.
        script.fromComponent = true;
    }
    // component-scripts
    // collect inline <script> tags from all components in this script tag.
    if (node.attribs.get('component-scripts') != null) {
        if (script.fromComponent) {
            ps.error('cannot apply the "component-scripts" attribute to a <script> tag inside a component, in ' + filename);
        }
        else if (tpl.componentScripts == null) {
            tpl.componentScripts = node;
        }
    }
    report_1.reportUnused(ps, node, validForScriptTag, filename);
}
function findComponents(ps, tpl, defn, nodelist) {
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
                        ps.warn('missing "rel" attribute on tag: ' + report_1.reconstitute(node) + ' in: ' + tpl.filename);
                    }
                    else if (rel === 'test-data') {
                        parseTestDataTag(ps, tpl, defn, node);
                    }
                    else if (rel === 'stylesheet') {
                        parseLinkRelTag(ps, tpl, defn, node);
                    }
                    break;
                case 'style':
                    parseStyleTag(ps, tpl, defn, node);
                    break;
                case 'script':
                    parseScriptTag(ps, tpl, defn, node);
                    break;
                default:
                    // define a local component if the tag has an @import attribute.
                    const src = node.attribs.get('@import');
                    if (src) {
                        if (ps.debugLevel)
                            ps.debug(`=> @import: '${src}' in ${tpl.filename}`);
                        const pendingTpl = ps.useTemplate(src, tpl.filename);
                        defn.tplsImported.push(pendingTpl);
                        node.attribs.delete('@import');
                        node.tpl = pendingTpl; // for output phase.
                    }
                    // walk child nodes recursively.
                    findComponents(ps, tpl, defn, node.children);
                    break;
            }
        }
    }
}
function parseTemplate(ps, tpl, rootNodes) {
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
                    if (dom_spec_1.html5.has(node.tag)) {
                        ps.warn('HTML component tag ' + report_1.reconstitute(node) + ' should not use a standard HTML5 tag name, in: ' + tpl.filename);
                    }
                    // make a tag defn for each root element.
                    const defn = new ast.TagDefn(tpl, node.tag, node.children);
                    if (ps.debugLevel)
                        ps.debug(`=> new TagDefn '${defn.tagName}' in tpl ${tpl.filename}`);
                    tpl.tags.set(defn.tagName, defn);
                    // parse the attributes (parameters of the custom tag)
                    for (let [name, val] of node.attribs) {
                        defn.params.set(name, val);
                    }
                    // phase 1: find inline components and imports.
                    findComponents(ps, tpl, defn, node.children);
                    break;
            }
        }
        else {
            ps.lint('ignored root element of type ' + node.tag + ' in template: ' + tpl.filename);
        }
    }
}
// TODO: <meta charset> handling: convert components to the main template charset?
function loadTemplate(ps, tpl, cb) {
    // Load and compile a template from its source file.
    if (ps.debugLevel)
        ps.debug(`=> loadTemplate: ${tpl.filename}`);
    const filename = tpl.filename;
    console.log("reading: " + filename);
    fs.readFile(filename, 'utf8', function (err, source) {
        if (err) {
            const usedFrom = tpl.usedFrom[0];
            const message = err.code === 'ENOENT' ? `not found: ${filename}` : `${err}`;
            ps.error(message + (usedFrom ? ' imported from ' + usedFrom : ''));
            return cb();
        }
        else {
            const doc = parse_html_1.parseToDOM(source, filename);
            if (tpl.isMain && !doc.hasDocType) {
                // top-level documents must have a doctype.
                ps.lint('missing <!DOCTYPE html> in ' + filename);
            }
            parseTemplate(ps, tpl, doc.children);
            return cb();
        }
    });
}
exports.loadTemplate = loadTemplate;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LXBoYXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbXBvbmVudC1waGFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsNkNBQTBDO0FBRTFDLHlDQUFnRDtBQUNoRCxxQ0FBbUU7QUFDbkUsMkNBQThDO0FBRTlDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztBQUMvRSxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7QUFDeEUsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRTNDLGtFQUFrRTtBQUNsRSx3REFBd0Q7QUFFeEQsbUVBQW1FO0FBQ25FLDhEQUE4RDtBQUU5RCw0RUFBNEU7QUFDNUUsMEVBQTBFO0FBQzFFLCtEQUErRDtBQUUvRCx3QkFBd0IsRUFBYyxFQUFFLEdBQWdCLEVBQUUsSUFBcUIsRUFBRSxJQUFZO0lBQzNGLGtDQUFrQztJQUNsQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztJQUNsQixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO0lBQzlCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDUixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFD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