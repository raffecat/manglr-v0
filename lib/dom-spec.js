'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
function split(names) {
    return new Set(names.split(' '));
}
// TODO: https://www.w3.org/TR/html52/dom.html#global-attributes   (itemprop itemscope itemtype - schema.org)
// TODO: https://www.w3.org/TR/html52/dom.html#content-models
exports.html5 = split('html body head base link meta style title ' + // metadata content.
    'address article aside footer h1 h2 h3 h4 h5 h6 header hgroup nav section ' + // flow content.
    'blockquote dd div dl dt figcaption figure hr li main ol p pre ul ' + // text content.
    'a abbr b bdi bdo br cite code data dfn em i kbd mark q rp rt rtc ruby ' + // inline text.
    's samp small span strong sub sup time u var wbr ' +
    'area audio img map track video canvas ' + // audio video.
    'embed object param source iframe picture math svg ' + // embeds.
    'noscript script ' + // scripting.
    'del ins ' + // edits.
    'caption col colgroup table tbody td tfoot th thead tr ' + // table.
    'button fieldset form input label legend optgroup option select textarea ' + // forms.
    'datalist meter output progress ' + // forms (HTML5)
    'details dialog menu menuitem summary ' + // interactive.
    'slot template' // web components.
);
// https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features
// https://www.w3.org/TR/html51/obsolete.html
exports.deprecated = split('applet acronym bgsound dir frame frameset noframes isindex listing nextid ' +
    'noembed plaintext strike xmp ' +
    'basefont big blink center font marquee multicol nobr spacer tt ' +
    'command image keygen ' +
    'content element shadow' // Shadow DOM (v0)
);
// https://www.w3.org/TR/html51/syntax.html#void-elements Section 8.1.2 "Elements"
exports.voidElements = split('area base br col embed hr img input link menuitem meta param source track wbr ' + // html5.
    'basefont command frame isindex keygen' // deprecated.
);
exports.foreignElements = split('circle ellipse line path polygon polyline rect ' + // SVG shapes.
    'stop use' // SVG.
);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tLXNwZWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZG9tLXNwZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDOztBQUViLGVBQWUsS0FBWTtJQUN6QixNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRCw2R0FBNkc7QUFDN0csNkRBQTZEO0FBRWhELFFBQUEsS0FBSyxHQUFHLEtBQUssQ0FDeEIsNENBQTRDLEdBQWtDLG9CQUFvQjtJQUNsRywyRUFBMkUsR0FBRyxnQkFBZ0I7SUFDOUYsbUVBQW1FLEdBQVcsZ0JBQWdCO0lBQzlGLHdFQUF3RSxHQUFNLGVBQWU7SUFDN0Ysa0RBQWtEO0lBQ2xELHdDQUF3QyxHQUFFLGVBQWU7SUFDekQsb0RBQW9ELEdBQUUsVUFBVTtJQUNoRSxrQkFBa0IsR0FBRSxhQUFhO0lBQ2pDLFVBQVUsR0FBRSxTQUFTO0lBQ3JCLHdEQUF3RCxHQUFFLFNBQVM7SUFDbkUsMEVBQTBFLEdBQUUsU0FBUztJQUNyRixpQ0FBaUMsR0FBRSxnQkFBZ0I7SUFDbkQsdUNBQXVDLEdBQUcsZUFBZTtJQUN6RCxlQUFlLENBQUMsa0JBQWtCO0NBQ25DLENBQUM7QUFFRiwrRUFBK0U7QUFDL0UsNkNBQTZDO0FBQ2hDLFFBQUEsVUFBVSxHQUFHLEtBQUssQ0FDN0IsNEVBQTRFO0lBQzVFLCtCQUErQjtJQUMvQixpRUFBaUU7SUFDakUsdUJBQXVCO0lBQ3ZCLHdCQUF3QixDQUFDLGtCQUFrQjtDQUM1QyxDQUFDO0FBRUYsa0ZBQWtGO0FBQ3JFLFFBQUEsWUFBWSxHQUFHLEtBQUssQ0FDL0IsZ0ZBQWdGLEdBQUUsU0FBUztJQUMzRix1Q0FBdUMsQ0FBQyxjQUFjO0NBQ3ZELENBQUM7QUFFVyxRQUFBLGVBQWUsR0FBRyxLQUFLLENBQ2xDLGlEQUFpRCxHQUFFLGNBQWM7SUFDakUsVUFBVSxDQUFDLE9BQU87Q0FDbkIsQ0FBQyJ9