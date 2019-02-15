'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ast_1 = require("./ast");
const log = console.log;
function htmlEscape(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attrEscape(text) {
    return htmlEscape(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function evaluateExpression(expr, bindings) {
    // resolve the expression using a set of local bindings.
    let value = bindings;
    for (let name of expr.path) {
        if (value instanceof Map) {
            value = value.get(name);
        }
        else {
            value = (value || {})[name];
        }
        if (value instanceof ast_1.Text) {
            value = value.text;
        }
        else if (value instanceof ast_1.Expression) {
            value = evaluateExpression(value, bindings);
        }
    }
    return value;
}
function evaluateTextTemplate(nodes, bindings) {
    let text = '';
    for (let child of nodes) {
        if (child instanceof ast_1.Text) {
            text += child.text;
        }
        else if (child instanceof ast_1.Expression) {
            const result = evaluateExpression(child, bindings);
            if (result != null && typeof (result) !== 'object') {
                text += result.toString();
            }
        }
    }
    return text;
}
function generateHTML(mainTpl, bindings) {
    const dom = ['<!DOCTYPE html>\n']; // captured in walkNodes closure.
    function walkNodes(nodelist, bindings) {
        for (let node of nodelist) {
            if (node instanceof ast_1.Text) {
                // literal body text.
                dom.push(node.markup ? node.text : htmlEscape(node.text));
            }
            else if (node instanceof ast_1.Expression) {
                // an expression that yields body text (ignored otherwise)
                const result = evaluateExpression(node, bindings);
                if (result != null && typeof (result) !== 'object') {
                    dom.push(htmlEscape(result.toString()));
                }
            }
            else if (node instanceof ast_1.TplTag) {
                // a standard HTML tag with attributes that can be bound to expressions.
                dom.push('<' + node.tag);
                for (let [name, value] of node.binds) {
                    if (value instanceof ast_1.Text) {
                        // literal attribute text.
                        dom.push(' ' + name + '="', attrEscape(value.text), '"');
                    }
                    else if (value instanceof ast_1.TextTemplate) {
                        // one or more expressions that yield text (ignored otherwise) intermixed with literal text.
                        const text = evaluateTextTemplate(value.nodes, bindings);
                        dom.push(' ' + name + '="', attrEscape(text), '"');
                    }
                    else if (value instanceof ast_1.Expression) {
                        // a single expression that yields text OR boolean (ignored otherwise)
                        const result = evaluateExpression(value, bindings);
                        if (typeof (result) === 'boolean') {
                            if (result === true) {
                                dom.push(' ' + name);
                            }
                        }
                        else if (result != null && typeof (result) !== 'object') {
                            dom.push(' ' + name + '="', attrEscape(result.toString()), '"');
                        }
                    }
                    else {
                        log("internal error: bad binding '" + name + "' in generateHTML: " + JSON.stringify(node));
                    }
                }
                dom.push('>');
                // recurse into child nodes.
                walkNodes(node.children, bindings);
                dom.push('</' + node.tag + '>');
            }
            else if (node instanceof ast_1.CustomTag) {
                // TODO: pass in captured <contents>
                if (node.capture.length) {
                    log("unused child nodes in custom tag <" + node.defn.tagName + "> : " + JSON.stringify(node.capture));
                }
                // TODO: need to evaluate the bound expressions here,
                // and pass a map of those results into the component.
                // recurse into the component using the bindings on this custom-tag.
                walkNodes(node.defn.nodes, node.binds);
            }
            else if (node instanceof ast_1.TplCond) {
                const result = evaluateExpression(node.condExpr, bindings);
                if (result) {
                    walkNodes(node.children, bindings);
                }
            }
            else if (node instanceof ast_1.TplRepeat) {
                const result = evaluateExpression(node.eachExpr, bindings);
                // TODO: Array or a Store type?
                if (result instanceof Array) {
                    // TODO: an Object or a Map?
                    const bindName = node.bindName;
                    const inner = bindings || {};
                    const oldBind = (inner instanceof Map) ? inner.get(bindName) : inner[bindName];
                    for (let obj of result) {
                        if (inner instanceof Map) {
                            inner.set(bindName, obj);
                        }
                        else {
                            inner[bindName] = obj;
                        }
                        walkNodes(node.children, inner);
                    }
                    if (inner instanceof Map) {
                        inner.set(bindName, oldBind);
                    }
                    else {
                        inner[bindName] = oldBind;
                    }
                }
            }
            else {
                log("internal error: bad Node in generateHTML: " + JSON.stringify(node));
            }
        }
    }
    walkNodes(mainTpl.nodes, bindings);
    return dom.join("");
}
exports.generateHTML = generateHTML;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuLWh0bWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZ2VuLWh0bWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDOztBQUViLCtCQUE2SDtBQUU3SCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBRXhCLG9CQUFvQixJQUFXO0lBQzdCLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUMsTUFBTSxDQUFDLENBQUM7QUFDOUUsQ0FBQztBQUVELG9CQUFvQixJQUFXO0lBQzdCLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRCw0QkFBNEIsSUFBZ0IsRUFBRSxRQUFhO0lBQ3pELHdEQUF3RDtJQUN4RCxJQUFJLEtBQUssR0FBTyxRQUFRLENBQUM7SUFDekIsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDM0IsRUFBRSxDQUFDLENBQUMsS0FBSyxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekIsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUIsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ04sS0FBSyxHQUFHLENBQUMsS0FBSyxJQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxLQUFLLFlBQVksVUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxQixLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNyQixDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssWUFBWSxnQkFBVSxDQUFDLENBQUMsQ0FBQztZQUN2QyxLQUFLLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRCw4QkFBOEIsS0FBb0IsRUFBRSxRQUFhO0lBQy9ELElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUNkLEdBQUcsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDeEIsRUFBRSxDQUFDLENBQUMsS0FBSyxZQUFZLFVBQUksQ0FBQyxDQUFDLENBQUM7WUFDMUIsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDckIsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFlBQVksZ0JBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkMsTUFBTSxNQUFNLEdBQU8sa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZELEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxJQUFJLElBQUksT0FBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xELElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDNUIsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRCxzQkFBNkIsT0FBZ0IsRUFBRSxRQUFhO0lBQzFELE1BQU0sR0FBRyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztJQUNwRSxtQkFBbUIsUUFBbUIsRUFBRSxRQUFhO1FBQ25ELEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDMUIsRUFBRSxDQUFDLENBQUMsSUFBSSxZQUFZLFVBQUksQ0FBQyxDQUFDLENBQUM7Z0JBRXpCLHFCQUFxQjtnQkFDckIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFFNUQsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLFlBQVksZ0JBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBRXRDLDBEQUEwRDtnQkFDMUQsTUFBTSxNQUFNLEdBQU8sa0JBQWtCLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN0RCxFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxJQUFJLE9BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNsRCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO1lBRUgsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLFlBQVksWUFBTSxDQUFDLENBQUMsQ0FBQztnQkFFbEMsd0VBQXdFO2dCQUN4RSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3ZCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLEVBQUUsQ0FBQyxDQUFDLEtBQUssWUFBWSxVQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUMxQiwwQkFBMEI7d0JBQzFCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFDdkQsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxZQUFZLGtCQUFZLENBQUMsQ0FBQyxDQUFDO3dCQUN6Qyw0RkFBNEY7d0JBQzVGLE1BQU0sSUFBSSxHQUFHLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7d0JBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNqRCxDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFlBQVksZ0JBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZDLHNFQUFzRTt3QkFDdEUsTUFBTSxNQUFNLEdBQU8sa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO3dCQUN2RCxFQUFFLENBQUMsQ0FBQyxPQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQzs0QkFDakMsRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0NBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNyQixDQUFDO3dCQUNILENBQUM7d0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxJQUFJLElBQUksT0FBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO3dCQUM5RCxDQUFDO29CQUNILENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ04sR0FBRyxDQUFDLCtCQUErQixHQUFDLElBQUksR0FBQyxxQkFBcUIsR0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3ZGLENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNkLDRCQUE0QjtnQkFDNUIsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ25DLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDLENBQUM7WUFFOUIsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLFlBQVksZUFBUyxDQUFDLENBQUMsQ0FBQztnQkFFckMsb0NBQW9DO2dCQUNwQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ3hCLEdBQUcsQ0FBQyxvQ0FBb0MsR0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEcsQ0FBQztnQkFFRCxxREFBcUQ7Z0JBQ3JELHNEQUFzRDtnQkFFdEQsb0VBQW9FO2dCQUNwRSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXpDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxZQUFZLGFBQU8sQ0FBQyxDQUFDLENBQUM7Z0JBRW5DLE1BQU0sTUFBTSxHQUFPLGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQy9ELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ1gsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3JDLENBQUM7WUFFSCxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksWUFBWSxlQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUVyQyxNQUFNLE1BQU0sR0FBTyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUMvRCwrQkFBK0I7Z0JBQy9CLEVBQUUsQ0FBQyxDQUFDLE1BQU0sWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUM1Qiw0QkFBNEI7b0JBQzVCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7b0JBQy9CLE1BQU0sS0FBSyxHQUFHLFFBQVEsSUFBSSxFQUFFLENBQUM7b0JBQzdCLE1BQU0sT0FBTyxHQUFHLENBQUMsS0FBSyxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQy9FLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLEtBQUssWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDOzRCQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO3dCQUFDLENBQUM7d0JBQ3ZELElBQUksQ0FBQyxDQUFDOzRCQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxHQUFHLENBQUM7d0JBQUMsQ0FBQzt3QkFDL0IsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ2xDLENBQUM7b0JBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQUMsQ0FBQztvQkFDM0QsSUFBSSxDQUFDLENBQUM7d0JBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLE9BQU8sQ0FBQztvQkFBQyxDQUFDO2dCQUNyQyxDQUFDO1lBRUgsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLEdBQUcsQ0FBQyw0Q0FBNEMsR0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDekUsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQ0QsU0FBUyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDdEIsQ0FBQztBQTdGRCxvQ0E2RkMifQ==