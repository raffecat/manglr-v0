
https://www.quirksmode.org/bugreports/archives/explorer_7/

Internet Explorer (tested in IE7 and IE8) strips leading spaces in text nodes preceded by an empty element, such as this:
<div><span></span> foo</div>

IE7: Text preceded by an empty tag in minimized form (<span />), and styled by CSS rules, is duplicated.
IE7: won't allow document.createElement('style') ?
IE7: elements removed from the DOM via innerHTML='' become broken (in strange ways)
IE7: button=document.createElement("button"); button.type="button"; // error (must use innerHTML)
IE7: cannot change the 'type' of input elements (after inserted into the DOM)
IE7: dynamically created tables must include <tbody>
IE7: setAttribute('style',) doesn't apply styles.
IE7: applies HTML normalization to the data that is assigned to the innerHTML property. This causes incorrect display of whitespace in elements that ought to preserve formatting, such as <pre> and <textarea>

