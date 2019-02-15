"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ast = require("./ast");
const csstree = require("css-tree");
const dom_spec_1 = require("./dom-spec");
const report_1 = require("./report");
const nonWhiteSpace = /\S/;
function trim(s) { return s.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); }
const builtInTpl = new ast.Template('[builtin]');
const plainDomTag = new ast.TagDefn(builtInTpl, '[DOMTag]', /*rootNodes*/ [], /*anyAttrib*/ true);
builtInTpl.tags.set('store', new ast.TagDefn(builtInTpl, 'store')); // TODO.
builtInTpl.tags.set('model', new ast.TagDefn(builtInTpl, 'model')); // TODO.
function compileExpression(ps, source, where) {
    return new ast.Expression(source, where); // TODO.
}
function parsePlaceholders(ps, source, outNodes, where) {
    // "some {embeds} inside a {text} template."
    // ["some ", {}, " inside a ", {}, " template."]
    const spans = source.split('{');
    // ^ ["some ","embeds} inside a ","text} template."]
    const pre = spans[0]; // text before the first '{' (can be empty)
    if (pre) {
        outNodes.push(new ast.Text(pre, where)); // literal text: normWS(pre)
    }
    for (let i = 1; i < spans.length; i++) {
        const span = spans[i]; // e.g. "embeds} inside a "
        var close = span.indexOf('}');
        if (close < 0) {
            ps.lint('unclosed "{" in string template ' + where);
            close = span.length; // assume at end of span.
        }
        const expr = span.substring(0, close); // text before '}'
        const post = span.substring(close + 1); // text after '}'
        outNodes.push(compileExpression(ps, expr, where));
        if (post.length) {
            outNodes.push(new ast.Text(post, where)); // literal text: normWS(post)
        }
    }
}
function parseAttribute(ps, source, where) {
    // recognise the difference between a direct-value binding and a text template.
    // a direct-value binding contains a single expression, e.g. attrib="{ foo }"
    // and will be passed through as a non-string binding object (the receiver might
    // coerce its value to a string, however.)
    if (/^\{(.*)\}$/.test(source)) {
        // binding is a single expression: provide it as a direct-value binding.
        return compileExpression(ps, source.substring(1, source.length - 1), where);
    }
    else if (source.indexOf('{') >= 0) {
        // binding is a text template: provide a string-value binding.
        const nodes = [];
        parsePlaceholders(ps, source, nodes, where);
        return new ast.TextTemplate(nodes, where);
    }
    else {
        // binding to a literal value.
        return new ast.Text(source, where);
    }
}
function appendStyles(ps, sheet, outNodes, filename) {
    const genCSS = csstree.translate(sheet.ast);
    if (nonWhiteSpace.test(genCSS)) {
        const cssText = new ast.Text(genCSS, filename, /*markup*/ true);
        // walk backwards, skipping text nodes that contain only whitespace.
        var pos = outNodes.length, lastNode = outNodes[--pos];
        while (lastNode instanceof ast.Text && !nonWhiteSpace.test(lastNode.text)) {
            lastNode = outNodes[--pos];
        }
        // now, if the last node is a <style> tag, append this style-sheet to it.
        if (lastNode instanceof ast.TplTag && lastNode.tag === 'style') {
            if (ps.debugLevel)
                ps.debug(`=> merged adjacent style nodes`);
            lastNode.children.push(cssText);
        }
        else {
            outNodes.push(new ast.TplTag('style', new Map(), [cssText]));
        }
    }
}
function buildCustomTagOrDomTag(ps, tpl, node, outNodes, customTags) {
    const filename = tpl.filename;
    // resolve custom tag to its template so we can recognise its parameters.
    // warn if it's not a standard html tag and doesn't match a custom template.
    // TODO: find imports as a pre-pass, so import can be after the first use,
    // or register a proxy with a list of use-sites for reporting later.
    const tag = node.tag;
    const importedTpl = node.tpl;
    let tagDef;
    if (importedTpl) {
        tagDef = importedTpl.tags.get(tag);
        if (!tagDef) {
            ps.error('custom tag <' + tag + '> is not defined in @import ' + importedTpl.filename);
            tagDef = plainDomTag;
        }
    }
    else {
        tagDef = customTags.get(tag);
        if (!tagDef) {
            if (!dom_spec_1.html5.has(tag)) {
                // not a valid HTML5 tag.
                if (dom_spec_1.deprecated.has(tag)) {
                    ps.lint('tag is deprecated in HTML5: ' + report_1.reconstitute(node) + ' in: ' + filename);
                }
                else {
                    ps.error('custom tag <' + tag + '> is not defined in ' + filename);
                }
            }
            tagDef = plainDomTag;
        }
    }
    // find all attributes that contain a binding expression and compile those expressions.
    // warn if it's not a standard html attribute and doesn't match a custom attribute.
    // also warn if it is a standard attribute on a tag that doesn't allow those.
    var condition = null;
    var repeat = null;
    var repeatName = null;
    const params = tagDef.params, anyAttrib = tagDef.anyAttrib;
    const binds = new Map();
    for (let [key, val] of node.attribs) {
        // directives.
        // TODO: custom directive lookups.
        if (key === 'if') {
            condition = compileExpression(ps, val, report_1.reconstitute(node) + ' in: ' + filename);
        }
        else if (key === 'repeat') {
            const terms = val.split(' in ');
            if (terms.length !== 2) {
                ps.error('repeat attribute must be of the form repeat="x in y" in ' + report_1.reconstitute(node) + ' in: ' + filename);
            }
            else {
                repeatName = trim(terms[0]);
                const from = trim(terms[1]);
                repeat = compileExpression(ps, from, report_1.reconstitute(node) + ' in: ' + filename);
            }
        }
        else {
            const pb = params.get(key);
            if (pb == null && !anyAttrib) {
                ps.warn('unrecognised "' + key + '" attribute on tag ' + report_1.reconstitute(node) + ' was ignored in: ' + filename);
            }
            else {
                // TODO: use pb to impose type-checks on bindings.
                // TODO: push these in order to a list.
                binds.set(key, parseAttribute(ps, val, 'in attribute "' + key + '" of ' + report_1.reconstitute(node) + ' in ' + filename));
            }
        }
    }
    // add defaults for any bindings that were not specified.
    for (let [key, val] of params) {
        if (!binds.has(key)) {
            binds.set(key, new ast.Text(val, filename));
        }
    }
    // FIXME: buildTagDefn needs to be in a scope that contains the 'repeat' variable, if any.
    const childNodes = [];
    buildTagDefn(ps, tpl, node.children, childNodes, customTags);
    var appendNode;
    if (anyAttrib) {
        // standard DOM tag: wrap the child nodes; embed within any condition/repeat.
        appendNode = new ast.TplTag(tag, binds, childNodes);
    }
    else {
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
function normalizeEOL(text) {
    if (nonWhiteSpace.test(text)) {
        return text; // contains text content (might be in a 'white-space:pre' element)
    }
    const norm = text.replace(/\r/g, '\n');
    let firstEOL = norm.indexOf('\n');
    if (firstEOL < 0)
        firstEOL = 0;
    let lastEOL = norm.lastIndexOf('\n');
    if (lastEOL < 0)
        lastEOL = norm.length;
    return norm.substr(0, firstEOL) + norm.substr(lastEOL);
}
function buildTagDefn(ps, tpl, nodelist, outNodes, customTags) {
    // phase 2: parse dom nodes and build the template.
    const filename = tpl.filename;
    for (let node of nodelist) {
        if (node instanceof ast.Text) {
            // merge adjacent text nodes (caused by elided tags)
            // remove blank lines between tags (often caused by elided tags)
            let text = node.text;
            if (!nonWhiteSpace.test(text)) {
                if (outNodes.length > 0) {
                    const last = outNodes[outNodes.length - 1];
                    if (last instanceof ast.Text && !nonWhiteSpace.test(last.text)) {
                        last.text = normalizeEOL(last.text + text);
                        continue;
                    }
                }
                text = normalizeEOL(text);
            }
            // parse any embedded expressions in the text content.
            parsePlaceholders(ps, text, outNodes, 'text node in ' + filename);
        }
        else if (node instanceof ast.Tag) {
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
        }
        else {
            ps.error('unexpected node <' + node.tag + '> in: ' + filename);
        }
    }
}
function customTagsForDefn(ps, tpl, defn) {
    // build the set of custom tags from the templates imported into this template.
    const customTags = new Map();
    // start with all the built-in tags in our custom-tags map.
    for (let [name, defn] of builtInTpl.tags) {
        customTags.set(name, defn);
    }
    // add the custom tags imported into this TagDefn.
    // TODO: selective imports and renames?
    for (let srcTpl of defn.tplsImported) {
        for (let [name, defn] of srcTpl.tags) {
            // detect name conflicts.
            const other = customTags.get(name);
            if (other) {
                ps.error('duplicate custom tag name "' + name + '" imported from "' + srcTpl.filename + '" and "' + other.tpl.filename + '" in: ' + tpl.filename);
            }
            else {
                if (ps.debugLevel)
                    ps.debug(`=> register custom tag: '${name}' in ${tpl.filename}`);
                customTags.set(name, defn);
            }
        }
    }
    // add the custom tags imported into this Template.
    // TODO: selective imports and renames.
    for (let srcTpl of tpl.tplsImported) {
        for (let [name, defn] of srcTpl.tags) {
            // detect name conflicts.
            const other = customTags.get(name);
            if (other) {
                ps.error('duplicate custom tag name "' + name + '" imported from "' + srcTpl.filename + '" and "' + other.tpl.filename + '" in: ' + tpl.filename);
            }
            else {
                if (ps.debugLevel)
                    ps.debug(`=> register custom tag: '${name}' in ${tpl.filename}`);
                customTags.set(name, defn);
            }
        }
    }
    return customTags;
}
function buildTagsInTpl(ps, tpl) {
    // phase 2: parse dom nodes and build the template.
    for (let [_, defn] of tpl.tags) {
        // build the set of custom tags from the components imported into this TagDefn and Template.
        const customTags = customTagsForDefn(ps, tpl, defn);
        buildTagDefn(ps, tpl, defn.rootNodes, defn.nodes, customTags);
    }
}
exports.buildTagsInTpl = buildTagsInTpl;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0LXBoYXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL291dHB1dC1waGFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZCQUE2QjtBQUM3QixvQ0FBcUM7QUFDckMseUNBQThFO0FBQzlFLHFDQUF3QztBQUd4QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUM7QUFFM0IsY0FBYyxDQUFRLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQyxDQUFDO0FBRTlFLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUNqRCxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxhQUFhLENBQUEsRUFBRSxFQUFFLGFBQWEsQ0FBQSxJQUFJLENBQUMsQ0FBQztBQUNoRyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUTtBQUM1RSxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUTtBQUU1RSwyQkFBMkIsRUFBYyxFQUFFLE1BQWEsRUFBRSxLQUFZO0lBQ3BFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUTtBQUNwRCxDQUFDO0FBRUQsMkJBQTJCLEVBQWMsRUFBRSxNQUFhLEVBQUUsUUFBc0IsRUFBRSxLQUFZO0lBQzVGLDRDQUE0QztJ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