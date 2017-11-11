'use strict';

import { TagDefn, TplNode, Text, Expression, TextTemplate, TplTag, CustomTag, TplCond, TplRepeat } from './ast';

const log = console.log;

function htmlEscape(text:string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function attrEscape(text:string) {
  return htmlEscape(text).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function generateHTML(mainTpl: TagDefn) {
  const dom = ['<!DOCTYPE html>\n']; // captured in walkNodes closure.
  function walkNodes(nodelist: TplNode[]) {
    for (let node of nodelist) {
      if (node instanceof Text) {
        dom.push(node.markup ? node.text : htmlEscape(node.text));
      } else if (node instanceof TextTemplate) {
        // nodes are: Text | Expression | TextTemplate.
        for (let child of node.nodes) {
          if (child instanceof Text) {
            dom.push(child.text);
          } else {
            const code = (child as Expression).source;
            dom.push('<manglr bind="',attrEscape(code),'"></manglr>');
          }
        }
      } else if (node instanceof Expression) {
        const code = node.source;
        dom.push('<manglr bind="',attrEscape(code),'"></manglr>');
      } else if (node instanceof TplTag) {
        // resolve and reduce attribute-binding expressions using incoming arguments.
        // some will fold down to constants; others will yield view-expressions.
        // for server-rendering, evaluate view-expressions and pre-render the result,
        // while also tagging if/each nodes with unique ids for client-side mounting.
        // for static-hosting, 
        dom.push('<'+node.tag);
        const exprs: {name:string,value:string}[] = [];
        for (let [name,value] of node.binds) {
          if (value instanceof Text) {
            // literal attribute value.
            dom.push(' '+name);
            if (value.text.length > 0) dom.push('="',attrEscape(value.text),'"');
          } else if (value instanceof TextTemplate) {
            // TODO: might resolve down to literal text.
            const children = value.nodes;
            let code = '';
            for (let child of children) {
              if (child instanceof Text) {
                code += "'" + child.text.replace(/'/g, "\\'") + "'";
              } else {
                const expr = (child as Expression);
                code += '+(' + expr.source + ')';
              }
            }
            exprs.push({ name:name, value:'('+code+')' });
          } else if (value instanceof Expression) {
            // TODO: might resolve down to literal text.
            let code = value.source;
            exprs.push({ name:name, value:'('+code+')' });
          } else {
            log("internal error: bad binding '"+name+"' in generateHTML: "+JSON.stringify(node));
          }
        }
        // encode all binding expressions.
        if (exprs.length) {
          for (let expr of exprs) {
            dom.push(' m-bind-'+expr.name+'="', attrEscape(expr.value), '"');
          }
        }
        dom.push('>');
        // recurse into child nodes.
        walkNodes(node.children);
        dom.push('</'+node.tag+'>');
      } else if (node instanceof CustomTag) {
        // inline the contents of the custom tag template.
        if (node.capture.length) {
          log("unused child nodes in custom tag <"+node.defn.tagName+"> : "+JSON.stringify(node.capture));
        }
        walkNodes(node.defn.nodes);
      } else if (node instanceof TplCond) {
        dom.push('<if cond="'+node.condExpr.source+'">');
        walkNodes(node.children);
        dom.push('</if>');
      } else if (node instanceof TplRepeat) {
        dom.push('<each in="'+node.eachExpr.source+'">');
        walkNodes(node.children);
        dom.push('</each>');
      } else {
        log("internal error: bad Node in generateHTML: "+JSON.stringify(node));
      }
    }
  }
  walkNodes(mainTpl.nodes);
  return dom.join("");
}
