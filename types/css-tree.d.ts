declare module 'css-tree';

declare namespace CSSTree {

  interface Options {
    context?: string;
    positions: boolean;
    tolerant: boolean;
    filename: string;
    offset: number;
    line: number;
    column: number;
    onParseError: (error: Error) => void;
  }

  interface ListItem {
    data: Node;
  }

  class List {
    getSize(): number;
    toArray(): Array<any>;
    fromArray(array: Array<any>): List;
    isEmpty(): boolean;
    first(): any;
    last(): any;
    each(cb: (data: any, item: ListItem, list: List) => void): void;
    prepend(item: ListItem): List;
    append(item: ListItem): List;
    insert(item: ListItem, before: ListItem): List;
    remove(item: ListItem): List;
    prependData(data: any): List;
    appendData(data: any): List;
    insertData(data: any, before: ListItem): List;
    appendList(list: List): List;
    insertList(list: List, before: ListItem): List;
    copy(list: List): List;
    clear(): void;
  }

  interface Node {
    type: string;
    name: string;
    children: List;
    value: any;
    expression: Node;
  }

  interface Context {
    root: Node;
    stylesheet: Node;
    atrulePrelude: Node|null;
    rule: Node|null;
    selector: Node|null;
    block: Node|null;
    declaration: Node|null;
    function: Node|null;
  }

}

declare function parse(text: string, options: CSSTree.Options): CSSTree.Node;
declare function walk(ast: CSSTree.Node, cb: (this: CSSTree.Context, node: CSSTree.Node) => void): void;
