'use strict';

// abstract types.

export type AttrMap = Map<string, string>;

export interface Node {
  tag: string;
}

export interface Element extends Node {
  attribs: AttrMap;
  children: Node[];
}

// concrete HTML types.

export class Fragment implements Element {
  readonly tag: string = '#document';
  attribs: AttrMap = new Map();
  children: Node[] = [];
  hasDocType: boolean = false;
}

export class Tag implements Element {
  children: Node[] = [];
  sheet: StyleSheet|null = null; // optional style-sheet to inline.
  //elide: boolean = false;
  constructor(readonly tag:string, public attribs:AttrMap=new Map()) {}
}

export class Text implements Node {
  readonly tag = '#text';
  constructor(public text:string, public where:string, public markup:boolean=false) {}
}

// concrete template types.

export type TextTPlNode = Text | Expression;
export type BindingNode = Text | Expression | TextTemplate;
export type BindingMap = Map<string, BindingNode>;
export type TplNode = Text | Expression | TextTemplate | TplTag | CustomTag | TplCond | TplRepeat;
export type DefnMap = Map<string, TagDefn>;

export class Expression {
  constructor(public source:string, public where:string) {}
}

export class TextTemplate {
  constructor(public nodes:TextTPlNode[], public where:string) {}
}

export interface Loader {
  filename: string;
  usedFrom: string[];
}

export class StyleSheet implements Loader {
  usedFrom: string[] = [];
  ast: CSSTree.Node|null = null; // parsed csstree AST.
  sheetsImported: StyleSheet[] = [];
  constructor(public filename:string, usedIn:string) {
    this.usedFrom.push(usedIn);
  }
}

export class Template implements Loader {
  // contains multiple TagDefn parsed from a single template (file)
  isMain: boolean = false;
  usedFrom: string[] = [];
  tags: DefnMap = new Map();
  tplsImported: Template[] = [];
  sheetsImported: StyleSheet[] = [];
  constructor(public filename:string, usedIn:string='') {
    if (usedIn) this.usedFrom.push(usedIn);
  }
}

export class TagDefn {
  // a custom tag definition within a Template.
  nodes: TplNode[] = [];
  outTag: string = '';
  params: AttrMap = new Map();
  constructor(public tpl:Template, public tagName:string, public rootNodes:Node[]=[], public anyAttrib:boolean=false) {
  }
}

export class TplTag {
  // a standard DOM node within a TagDefn.
  constructor(
    readonly tag:string,
    readonly binds:BindingMap,
    readonly children:TplNode[]) {}
}

export class CustomTag {
  // an instance of a TagDefn for a custom tag.
  constructor(
    readonly defn: TagDefn,
    readonly binds: BindingMap,
    readonly capture: TplNode[]) {}
}

export class TplCond {
  // a conditional group of nodes.
  constructor(
    readonly condExpr: Expression,
    readonly children: TplNode[]) {}
}

export class TplRepeat {
  // a repeating group of nodes.
  constructor(
    readonly bindName: string,
    readonly eachExpr: Expression,
    readonly children: TplNode[]) {}
}
