'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// concrete HTML types.
class Fragment {
    constructor() {
        this.tag = '#document';
        this.attribs = new Map();
        this.children = [];
        this.hasDocType = false;
    }
}
exports.Fragment = Fragment;
class Tag {
    constructor(tag, attribs = new Map()) {
        this.tag = tag;
        this.attribs = attribs;
        this.children = [];
        this.sheet = null; // optional style-sheet to inline.
        this.elide = false;
        this.tpl = null; // for @import attribute.
    }
}
exports.Tag = Tag;
class Text {
    constructor(text, where, markup = false) {
        this.text = text;
        this.where = where;
        this.markup = markup;
        this.tag = '#text';
    }
}
exports.Text = Text;
class Expression {
    constructor(source, where) {
        this.source = source;
        this.where = where;
        this.path = source.split('.');
    }
}
exports.Expression = Expression;
class TextTemplate {
    constructor(nodes, where) {
        this.nodes = nodes;
        this.where = where;
    }
}
exports.TextTemplate = TextTemplate;
class StyleSheet {
    constructor(filename, usedIn) {
        this.filename = filename;
        this.fromComponent = false;
        this.usedFrom = [];
        this.ast = null; // parsed csstree AST.
        this.sheetsImported = [];
        this.usedFrom.push(usedIn);
    }
}
exports.StyleSheet = StyleSheet;
class Script {
    constructor(filename, usedIn) {
        this.filename = filename;
        this.fromComponent = false;
        this.usedFrom = [];
        this.script = '';
        this.usedFrom.push(usedIn);
    }
}
exports.Script = Script;
class Template {
    constructor(filename, usedIn = '') {
        this.filename = filename;
        // contains multiple TagDefn parsed from a single template (file)
        this.isMain = false;
        this.usedFrom = [];
        this.tags = new Map();
        this.tplsImported = [];
        this.sheetsImported = [];
        this.inlineFontFace = null; // first style tag encountered with inline-fonts.
        this.componentStyles = null; // first style tag encountered with component-styles.
        this.componentScripts = null; // first script tag encountered with component-scripts.
        this.testDataUrl = '';
        if (usedIn)
            this.usedFrom.push(usedIn);
    }
}
exports.Template = Template;
class TagDefn {
    constructor(tpl, tagName, rootNodes = [], anyAttrib = false) {
        this.tpl = tpl;
        this.tagName = tagName;
        this.rootNodes = rootNodes;
        this.anyAttrib = anyAttrib;
        // a custom tag definition within a Template.
        this.nodes = [];
        this.outTag = '';
        this.params = new Map();
        this.tplsImported = []; // templates imported inside this component.
        this.componentsUsed = []; // components used in this component (NB. cannot be conditional!)
        this.metaTags = []; // <meta> within the component.
        this.linkTags = []; // <link> within the component.
        this.styleTags = []; // <style> within the component.
        this.headScripts = []; // <script move-to-head> within the component.
        this.footScripts = []; // <script move-to-body> within the component.
    }
}
exports.TagDefn = TagDefn;
class TplTag {
    // a standard DOM node within a TagDefn.
    constructor(tag, binds, children) {
        this.tag = tag;
        this.binds = binds;
        this.children = children;
    }
}
exports.TplTag = TplTag;
class CustomTag {
    // an instance of a TagDefn for a custom tag.
    constructor(defn, binds, capture) {
        this.defn = defn;
        this.binds = binds;
        this.capture = capture;
    }
}
exports.CustomTag = CustomTag;
class TplCond {
    // a conditional group of nodes.
    constructor(condExpr, children) {
        this.condExpr = condExpr;
        this.children = children;
    }
}
exports.TplCond = TplCond;
class TplRepeat {
    // a repeating group of nodes.
    constructor(bindName, eachExpr, children) {
        this.bindName = bindName;
        this.eachExpr = eachExpr;
        this.children = children;
    }
}
exports.TplRepeat = TplRepeat;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2FzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7O0FBZWIsdUJBQXVCO0FBRXZCO0lBQUE7UUFDVyxRQUFHLEdBQVcsV0FBVyxDQUFDO1FBQ25DLFlBQU8sR0FBWSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdCLGFBQVEsR0FBVyxFQUFFLENBQUM7UUFDdEIsZUFBVSxHQUFZLEtBQUssQ0FBQztJQUM5QixDQUFDO0NBQUE7QUFMRCw0QkFLQztBQUVEO0lBS0UsWUFBbUIsR0FBVSxFQUFTLFVBQWdCLElBQUksR0FBRyxFQUFFO1FBQTVDLFFBQUcsR0FBSCxHQUFHLENBQU87UUFBUyxZQUFPLEdBQVAsT0FBTyxDQUFrQjtRQUovRCxhQUFRLEdBQVcsRUFBRSxDQUFDO1FBQ3RCLFVBQUssR0FBb0IsSUFBSSxDQUFDLENBQUMsa0NBQWtDO1FBQ2pFLFVBQUssR0FBWSxLQUFLLENBQUM7UUFDdkIsUUFBRyxHQUFrQixJQUFJLENBQUMsQ0FBQyx5QkFBeUI7SUFDYyxDQUFDO0NBQ3BFO0FBTkQsa0JBTUM7QUFFRDtJQUVFLFlBQW1CLElBQVcsRUFBUyxLQUFZLEVBQVMsU0FBZSxLQUFLO1FBQTdELFNBQUksR0FBSixJQUFJLENBQU87UUFBUyxVQUFLLEdBQUwsS0FBSyxDQUFPO1FBQVMsV0FBTSxHQUFOLE1BQU0sQ0FBYztRQUR2RSxRQUFHLEdBQUcsT0FBTyxDQUFDO0lBQzRELENBQUM7Q0FDckY7QUFIRCxvQkFHQztBQVVEO0lBRUUsWUFBbUIsTUFBYSxFQUFTLEtBQVk7UUFBbEMsV0FBTSxHQUFOLE1BQU0sQ0FBTztRQUFTLFVBQUssR0FBTCxLQUFLLENBQU87UUFDbkQsSUFBSSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDRjtBQUxELGdDQUtDO0FBRUQ7SUFDRSxZQUFtQixLQUFtQixF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