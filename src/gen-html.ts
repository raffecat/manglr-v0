'use strict';

import { TagDefn, TplNode, TextTPlNode, Text, Expression, TextTemplate, TplTag, CustomTag, TplCond, TplRepeat } from './ast';

const log = console.log;

function htmlEscape(text:string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function attrEscape(text:string) {
  return htmlEscape(text).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function evaluateExpression(expr: Expression, bindings: any) {
  // resolve the expression using a set of local bindings.
  let value:any = bindings;
  for (let name of expr.path) {
    if (value instanceof Map) {
      value = value.get(name);
    } else {
      value = (value||{})[name];
    }
    if (value instanceof Text) {
      value = value.text;
    } else if (value instanceof Expression) {
      value = evaluateExpression(value, bindings);
    }
  }
  return value;
}

function evaluateTextTemplate(nodes: TextTPlNode[], bindings: any) {
  let text = '';
  for (let child of nodes) {
    if (child instanceof Text) {
      text += child.text;
    } else if (child instanceof Expression) {
      const result:any = evaluateExpression(child, bindings);
      if (result != null && typeof(result) !== 'object') {
        text += result.toString();
      }
    }
  }
  return text;
}

export function generateHTML(mainTpl: TagDefn, bindings: any) {
  const dom = ['<!DOCTYPE html>\n']; // captured in walkNodes closure.
  function walkNodes(nodelist: TplNode[], bindings: any) {
    for (let node of nodelist) {
      if (node instanceof Text) {

        // literal body text.
        dom.push(node.markup ? node.text : htmlEscape(node.text));

      } else if (node instanceof Expression) {

        // an expression that yields body text (ignored otherwise)
        const result:any = evaluateExpression(node, bindings);
        if (result != null && typeof(result) !== 'object') {
          dom.push(htmlEscape(result.toString()));
        }

      } else if (node instanceof TplTag) {

        // a standard HTML tag with attributes that can be bound to expressions.
        dom.push('<'+node.tag);
        for (let [name,value] of node.binds) {
          if (value instanceof Text) {
            // literal attribute text.
            dom.push(' '+name+'="', attrEscape(value.text), '"');
          } else if (value instanceof TextTemplate) {
            // one or more expressions that yield text (ignored otherwise) intermixed with literal text.
            const text = evaluateTextTemplate(value.nodes, bindings);
            dom.push(' '+name+'="', attrEscape(text), '"');
          } else if (value instanceof Expression) {
            // a single expression that yields text OR boolean (ignored otherwise)
            const result:any = evaluateExpression(value, bindings);
            if (typeof(result) === 'boolean') {
              if (result === true) {
                dom.push(' '+name);
              }
            } else if (result != null && typeof(result) !== 'object') {
              dom.push(' '+name+'="', attrEscape(result.toString()), '"');
            }
          } else {
            log("internal error: bad binding '"+name+"' in generateHTML: "+JSON.stringify(node));
          }
        }
        dom.push('>');
        // recurse into child nodes.
        walkNodes(node.children, bindings);
        dom.push('</'+node.tag+'>');

      } else if (node instanceof CustomTag) {

        // TODO: pass in captured <contents>
        if (node.capture.length) {
          log("unused child nodes in custom tag <"+node.defn.tagName+"> : "+JSON.stringify(node.capture));
        }

        // TODO: need to evaluate the bound expressions here,
        // and pass a map of those results into the component.

        // recurse into the component using the bindings on this custom-tag.
        walkNodes(node.defn.nodes, node.binds);

      } else if (node instanceof TplCond) {

        const result:any = evaluateExpression(node.condExpr, bindings);
        if (result) {
          walkNodes(node.children, bindings);
        }

      } else if (node instanceof TplRepeat) {

        const result:any = evaluateExpression(node.eachExpr, bindings);
        // TODO: Array or a Store type?
        if (result instanceof Array) {
          // TODO: an Object or a Map?
          const bindName = node.bindName;
          const inner = bindings || {};
          const oldBind = (inner instanceof Map) ? inner.get(bindName) : inner[bindName];
          for (let obj of result) {
            if (inner instanceof Map) { inner.set(bindName, obj); }
            else { inner[bindName] = obj; }
            walkNodes(node.children, inner);
          }
          if (inner instanceof Map) { inner.set(bindName, oldBind); }
          else { inner[bindName] = oldBind; }
        }

      } else {
        log("internal error: bad Node in generateHTML: "+JSON.stringify(node));
      }
    }
  }
  walkNodes(mainTpl.nodes, bindings);
  return dom.join("");
}
