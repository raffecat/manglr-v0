"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const csstree = require("css-tree");
function inlineFontFaceTransform(ps, hostTag, filename) {
    // move @font-face directives from all CSS files and <style> tags to the specified <style> tag.
    const hostStyles = hostTag.sheet && hostTag.sheet.ast;
    if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
        const uniqueFonts = new Map();
        for (let sheet of ps.allStyleSheets) {
            const styles = sheet.ast;
            if (styles && styles.type === 'StyleSheet' && styles.children) {
                const children = styles.children;
                children.each(function (rule, listItem) {
                    if (rule.type === 'Atrule' && rule.name === 'font-face') {
                        const key = csstree.translate(rule);
                        if (ps.debugLevel)
                            ps.debug(`=> remove ${key} from: ${sheet.filename}`);
                        children.remove(listItem); // NB. remove updates the 'each' iterator.
                        uniqueFonts.set(key, listItem);
                    }
                });
            }
            else {
                ps.error('inline-fonts: <style> tag is invalid in: ' + sheet.filename);
            }
        }
        for (let [_, rule] of uniqueFonts) {
            hostStyles.children.append(rule); // take ownership of ListItem.
        }
    }
    else {
        ps.error('inline-fonts: <style> tag is invalid in: ' + filename);
    }
}
exports.inlineFontFaceTransform = inlineFontFaceTransform;
function componentStylesTransform(ps, hostTag, filename) {
    // move inline component styles from all components to the specified <style> tag.
    const hostStyles = hostTag.sheet && hostTag.sheet.ast;
    if (hostStyles && hostStyles.type === 'StyleSheet' && hostStyles.children) {
        for (let sheet of ps.allStyleSheets) {
            if (sheet.fromComponent) {
                const styles = sheet.ast;
                if (styles && styles.type === 'StyleSheet' && styles.children) {
                    const children = styles.children;
                    children.each(function (rule, listItem) {
                        children.remove(listItem); // NB. remove updates the 'each' iterator.
                        hostStyles.children.append(listItem); // take ownership of ListItem.
                    });
                }
                else {
                    ps.error('component-styles: <style> tag is invalid in: ' + sheet.filename);
                }
            }
        }
    }
    else {
        ps.error('component-styles: <style> tag is invalid in: ' + filename);
    }
}
exports.componentStylesTransform = componentStylesTransform;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNmb3Jtcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy90cmFuc2Zvcm1zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsb0NBQXFDO0FBRXJDLGlDQUF3QyxFQUFjLEVBQUUsT0FBZ0IsRUFBRSxRQUFnQjtJQUN4RiwrRkFBK0Y7SUFDL0YsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUN0RCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLElBQUksS0FBSyxZQUFZLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDMUUsTUFBTSxXQUFXLEdBQWtDLElBQUksR0FBRyxFQUFFLENBQUM7UUFDN0QsR0FBRyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztZQUN6QixFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxZQUFZLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQzlELE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBUyxJQUFJLEVBQUUsUUFBUTtvQkFDbkMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDO3dCQUN4RCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNwQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDOzRCQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLFVBQVUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7d0JBQ3hFLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQywwQ0FBMEM7d0JBQ3JFLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUNqQyxDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLEVBQUUsQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEdBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7UUFDSCxDQUFDO1FBQ0QsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsOEJBQThCO1FBQ2xFLENBQUM7SUFDSCxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixFQUFFLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxHQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7QUFDSCxDQUFDO0FBM0JELDBEQTJCQztBQUVELGtDQUF5QyxFQUFjLEVBQUUsT0FBZ0IsRUFBRSxRQUFnQjtJQUN6RixpRkFBaUY7SUFDakYsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUN0RCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLElBQUksS0FBSyxZQUFZLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDMUUsR0FBRyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7Z0JBQ3pCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFlBQVksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDOUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztvQkFDakMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFTLElBQUksRUFBRSxRQUFRO3dCQUNuQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsMENBQTBDO3dCQUNyRSxVQUFVLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtvQkFDdEUsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixFQUFFLENBQUMsS0FBSyxDQUFDLCtDQUErQyxHQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDM0UsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sRUFBRSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsR0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyRSxDQUFDO0FBQ0gsQ0FBQztBQXJCRCw0REFxQkMifQ==