import * as ast from './ast';
import { ParserState } from './parser-state';

export function reconstitute(node:ast.Tag) {
  let res = '<'+node.tag;
  for (let key of Object.keys(node.attribs)) {
    const val = node.attribs.get(key);
    res = res + ' ' + key + '="'+val+'"'; // NB. can include un-escaped quotes.
  }
  return res+'>';
}

export function reportUnused(ps:ParserState, node:ast.Tag, allow:Set<string>, filename:string) {
  for (let key of Object.keys(node.attribs)) {
    if (!allow.has(key)) {
      ps.warn('unrecognised "'+key+'" attribute was ignored: '+reconstitute(node)+' in: '+filename);
    }
  }
}

export function assertEmpty(ps:ParserState, node:ast.Tag, filename:string) {
   if (node.children.length) {
    ps.warn('tag should not contain markup: '+reconstitute(node)+' in: '+filename);
  }
}
