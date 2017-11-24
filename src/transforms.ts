import * as ast from './ast';
import { ParserState } from './parser-state';
import csstree = require('css-tree');

export function inlineFontFaceTransform(ps:ParserState, hostTag: ast.Tag, filename: string) {
  // move @font-face directives from all CSS files and <style> tags to the specified <style> tag.
  const hostStyles = hostTag.sheet && hostTag.sheet.ast;
  if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
    const uniqueFonts: Map<string, CSSTree.ListItem> = new Map();
    for (let sheet of ps.allStyleSheets) {
      const styles = sheet.ast;
      if (styles && styles.type === 'StyleSheet' && styles.children) {
        const children = styles.children;
        children.each(function(rule, listItem){
          if (rule.type === 'Atrule' && rule.name === 'font-face') {
            const key = csstree.translate(rule);
            if (ps.debugLevel) ps.debug(`=> remove ${key} from: ${sheet.filename}`);
            children.remove(listItem); // NB. remove updates the 'each' iterator.
            uniqueFonts.set(key, listItem);
          }
        });
      } else {
        ps.error('inline-fonts: <style> tag is invalid in: '+sheet.filename);
      }
    }
    for (let [_,rule] of uniqueFonts) {
      hostStyles.children.append(rule); // take ownership of ListItem.
    }
  } else {
    ps.error('inline-fonts: <style> tag is invalid in: '+filename);
  }
}

export function componentStylesTransform(ps:ParserState, hostTag: ast.Tag, filename: string) {
  // move inline component styles from all components to the specified <style> tag.
  const hostStyles = hostTag.sheet && hostTag.sheet.ast;
  if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
    for (let sheet of ps.allStyleSheets) {
      if (sheet.fromComponent) {
        const styles = sheet.ast;
        if (styles && styles.type === 'StyleSheet' && styles.children) {
          const children = styles.children;
          children.each(function(rule, listItem){
            children.remove(listItem); // NB. remove updates the 'each' iterator.
            hostStyles.children.append(listItem); // take ownership of ListItem.
          });
        } else {
          ps.error('component-styles: <style> tag is invalid in: '+sheet.filename);
        }
      }
    }
  } else {
    ps.error('component-styles: <style> tag is invalid in: '+filename);
  }
}
