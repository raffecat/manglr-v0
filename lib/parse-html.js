'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const htmlparser = require("htmlparser2");
const ast_1 = require("./ast");
const hasOwn = Object.prototype.hasOwnProperty;
const log = console.log;
function trim(s) { return s.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); }
function parseToDOM(source, filename) {
    // Parse the source HTML into a simple DOM tree structure.
    // This handles concerns such as valid tag nesting and self-closing tags.
    const where = 'in ' + filename;
    const doc = new ast_1.Fragment();
    const tagStack = [doc];
    let children = doc.children; // collect tags as children of the document.
    let inCDATA = false;
    const parser = new htmlparser.Parser({
        onopentag: function (tag, attribs) {
            tag = tag.toLowerCase();
            const attrs = new Map();
            for (let key in attribs) {
                if (hasOwn.call(attribs, key)) {
                    attrs.set(key, attribs[key]);
                }
            }
            const node = new ast_1.Tag(tag, attrs);
            children.push(node); // include in parent's children.
            tagStack.push(node); // tag is now open.
            children = node.children; // collect tags as children of this node.
        },
        onclosetag: function (tag) {
            tag = tag.toLowerCase();
            if (!tagStack.length) {
                return log('unmatched closing tag </' + tag + '> outside of any open tag in ' + filename);
            }
            const openTag = tagStack[tagStack.length - 1];
            if (tag == openTag.tag) {
                tagStack.pop();
                const parentTag = tagStack[tagStack.length - 1];
                if (!parentTag) {
                    // the document should always remain on the stack.
                    return log('stack underrun (missing #document) in ' + filename);
                }
                children = parentTag.children; // collect tags as children of the parent.
            }
            else {
                log('unmatched closing tag </' + tag + '> does not match currently open tag <' + openTag.tag + '> in ' + filename);
            }
        },
        ontext: function (text) {
            if (tagStack.length > 1) {
                children.push(new ast_1.Text(text, where, inCDATA));
            }
            else {
                if (/\S/.test(text)) {
                    log("lint: ignored text " + JSON.stringify(text) + " between top-level tags, in " + filename);
                }
            }
        },
        oncdatastart: function () {
            log("lint: CDATA section is deprecated in HTML5, in " + filename);
            children.push(new ast_1.Text('<![CDATA[', where, true));
            inCDATA = true;
        },
        oncdataend: function () {
            children.push(new ast_1.Text(']]>', where, true));
            inCDATA = false;
        },
        onprocessinginstruction: function (piname, data) {
            if (trim(data).toLowerCase() == '!doctype html') {
                doc.hasDocType = true;
                if (trim(data) != '!DOCTYPE html') {
                    log('lint: <!DOCTYPE html> has incorrect upper/lower case in ' + filename);
                }
            }
            else {
                log('lint: ignored processing instruction: <' + piname + ' ' + data + '> in ' + filename);
            }
        },
        onerror: function (error) {
            // under what conditions will this happen?
            log("parse error:", error);
        }
    }, {
        lowerCaseTags: true,
        lowerCaseAttributeNames: false,
        decodeEntities: true,
        recognizeSelfClosing: true,
        recognizeCDATA: true
    });
    parser.write(source);
    parser.end();
    while (tagStack.length > 1) {
        const openTag = tagStack.pop(); // "can be null" because Array can be sparse.
        log('lint: unclosed tag <' + openTag.tag + '> in ' + filename);
    }
    return doc;
}
exports.parseToDOM = parseToDOM;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UtaHRtbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9wYXJzZS1odG1sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQzs7QUFFYiwwQ0FBMkM7QUFDM0MsK0JBQW9FO0FBR3BFLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDO0FBQy9DLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUM7QUFFeEIsY0FBYyxDQUFRLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQyxDQUFDO0FBRTlFLG9CQUEyQixNQUFhLEVBQUUsUUFBZTtJQUN2RCwwREFBMEQ7SUFDMUQseUVBQXlFO0lBQ3pFLE1BQU0sS0FBSyxHQUFHLEtBQUssR0FBQyxRQUFRLENBQUM7SUFDN0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxjQUFRLEVBQUUsQ0FBQztJQUMzQixNQUFNLFFBQVEsR0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2xDLElBQUksUUFBUSxHQUFXLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyw0Q0FBNEM7SUFDakYsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUNuQyxTQUFTLEVBQUUsVUFBUyxHQUFVLEVBQUUsT0FBZ0I7WUFDOUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN4QixNQUFNLEtBQUssR0FBWSxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ2pDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLENBQUM7WUFDSCxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxTQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxnQ0FBZ0M7WUFDckQsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLG1CQUFtQjtZQUN4QyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLHlDQUF5QztRQUNyRSxDQUFDO1FBQ0QsVUFBVSxFQUFFLFVBQVMsR0FBVTtZQUM3QixHQUFHLEdBQUcsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLE1BQU0sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEdBQUMsR0FBRyxHQUFDLCtCQUErQixHQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RGLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDZixNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUNmLGtEQUFrRDtvQkFDbEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsR0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDaEUsQ0FBQztnQkFDRCxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLDBDQUEwQztZQUMzRSxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sR0FBRyxDQUFDLDBCQUEwQixHQUFDLEdBQUcsR0FBQyx1Q0FBdUMsR0FBQyxPQUFPLENBQUMsR0FBRyxHQUFDLE9BQU8sR0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzRyxDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sRUFBRSxVQUFTLElBQVc7WUFDMUIsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksVUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BCLEdBQUcsQ0FBQyxxQkFBcUIsR0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFDLDhCQUE4QixHQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUMxRixDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFDRCxZQUFZLEVBQUU7WUFDWixHQUFHLENBQUMsaURBQWlELEdBQUMsUUFBUSxDQUFDLENBQUM7WUFDaEUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQUksQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDbEQsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNqQixDQUFDO1FBQ0QsVUFBVSxFQUFFO1lBQ1YsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDNUMsT0FBTyxHQUFHLEtBQUssQ0FBQztRQUNsQixDQUFDO1FBQ0QsdUJBQXVCLEVBQUUsVUFBUyxNQUFhLEVBQUUsSUFBVztZQUMxRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLElBQUksZUFBZSxDQUFDLENBQUMsQ0FBQztnQkFDaEQsR0FBRyxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ3RCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDO29CQUNsQyxHQUFHLENBQUMsMERBQTBELEdBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNFLENBQUM7WUFDSCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sR0FBRyxDQUFDLHlDQUF5QyxHQUFDLE1BQU0sR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxRQUFRLENBQUMsQ0FBQztZQUNsRixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sRUFBRSxVQUFTLEtBQVM7WUFDekIsMENBQTBDO1lBQzFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0IsQ0FBQztLQUNGLEVBQUU7UUFDRCxhQUFhLEVBQUUsSUFBSTtRQUNuQix1QkFBdUIsRUFBRSxLQUFLO1FBQzlCLGNBQWMsRUFBRSxJQUFJO1FBQ3BCLG9CQUFvQixFQUFFLElBQUk7UUFDMUIsY0FBYyxFQUFFLElBQUk7S0FDckIsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNyQixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDYixPQUFPLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDM0IsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBYSxDQUFDLENBQUMsNkNBQTZDO1FBQ3hGLEdBQUcsQ0FBQyxzQkFBc0IsR0FBQyxPQUFPLENBQUMsR0FBRyxHQUFDLE9BQU8sR0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUNiLENBQUM7QUF0RkQsZ0NBc0ZDIn0=