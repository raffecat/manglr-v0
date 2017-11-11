'use strict';

function split(names:string) {
  return new Set(names.split(' '));
}

// TODO: https://www.w3.org/TR/html52/dom.html#global-attributes   (itemprop itemscope itemtype - schema.org)
// TODO: https://www.w3.org/TR/html52/dom.html#content-models

export const html5 = split(
  'html body head base link meta style title '+                                 // metadata content.
  'address article aside footer h1 h2 h3 h4 h5 h6 header hgroup nav section '+  // flow content.
  'blockquote dd div dl dt figcaption figure hr li main ol p pre ul '+          // text content.
  'a abbr b bdi bdo br cite code data dfn em i kbd mark q rp rt rtc ruby '+     // inline text.
  's samp small span strong sub sup time u var wbr '+
  'area audio img map track video canvas '+ // audio video.
  'embed object param source iframe picture math svg '+ // embeds.
  'noscript script '+ // scripting.
  'del ins '+ // edits.
  'caption col colgroup table tbody td tfoot th thead tr '+ // table.
  'button fieldset form input label legend optgroup option select textarea '+ // forms.
  'datalist meter output progress '+ // forms (HTML5)
  'details dialog menu menuitem summary '+  // interactive.
  'slot template' // web components.
);

// https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features
// https://www.w3.org/TR/html51/obsolete.html
export const deprecated = split(
  'applet acronym bgsound dir frame frameset noframes isindex listing nextid '+
  'noembed plaintext strike xmp '+
  'basefont big blink center font marquee multicol nobr spacer tt '+
  'command image keygen '+
  'content element shadow' // Shadow DOM (v0)
);

// https://www.w3.org/TR/html51/syntax.html#void-elements Section 8.1.2 "Elements"
export const voidElements = split(
  'area base br col embed hr img input link menuitem meta param source track wbr '+ // html5.
  'basefont command frame isindex keygen' // deprecated.
);

export const foreignElements = split(
  'circle ellipse line path polygon polyline rect '+ // SVG shapes.
  'stop use' // SVG.
);
