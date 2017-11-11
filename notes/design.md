Manglr

Top-level helpers outside of the main library closure.
Manglr core and a set of plugins.

Binding:
iterate over the DOM attributes, determine which are bindings.
map the bindings to a set of.. { setter, condition, repeat } terms
if any terms are repeats -> remove the contents to a template [what about pre-rendered contents? spills the template?]


### Goal

The goal of manglr is to allow behaviour to be added to HTML elements through
the use of declarative attributes.

Manglr uses attributes with its own prefix.


### Hiding and Showing

When a node is removed from the DOM, it is first hidden (see below), then removed.

When a node is hidden, it is first deactivated (its views will no longer update)
and then its hide-transitions are triggered. When all hide-transitions have
completed, its 'display' style is changed to 'none'.


### Custom Elements

Native custom elements have an attributeChangedCallback which is called after
setAttribute is used on a custom element.

Manglr should support custom elements on all browsers by using a pre-processor
to inline them as a template. It should support the official import syntax.

Consider: http://developer.telerik.com/featured/web-components-ready-production/
Custom elements, but not in IE < 9, all the rest seem ok?

These are from https://w3c.github.io/webcomponents/spec/custom/

<template name="flag-icon" attributes="country">
  <img src="images/flags/{country}.png">
</template>

<!-- must use is="" for extended built-in elements -->
<template name="plastic-button" extends="button" on-click="">
</template>
<button is="plastic-button">Click Me!</button>

<!-- must emulate button behaviour if not extending button -->
<template name="custom-button" attributes="disabled" role="button" on-keydown="32,13:click" v-aria-label="{element|textContent}" v-aria-disabled="{element|has:disabled:true:false}" b-tabindex="{element|has:disabled::0}">
</template>

<!-- custom elements are upgraded when the script registers the custom element -->
<img-viewer filter="Kelvin">
  <img src="images/tree.jpg" alt="A beautiful tree towering over an empty savannah">
</img-viewer>
<script src="js/elements/img-viewer.js" async></script>


### The Good Bits of Angular

Early on, Angular used the idea of binding your HTML View to a ViewModel
by using path-like expressions in HTML attributes. Combined with ng-if and
ng-repeat, these permitted complex views and nested sub-views.

Actions were also performed by binding to events with HTML attributes,
e.g. ng-click="action", where the action is a js function in a normal field
of the ViewModel.

It was possible to build an entire app front-end this way, but the HTML could
become quite large. I ended up using a pre-processor to inline external
HTML files as "template" script tags for ng-include.

The bad bits: Angular scopes use prototypical inheritance, but two-way/writable
bindings write their bound property directly to the scope they are in.
So bindings inside ng-if, ng-include, etc will silently fail to work.

More bad: ng-include is intended for loading dynamic views, each with their
own controller (ViewModel) and interacting with the app only via services.
I actually wanted to use ng-include to nest sub-views, passing arguments (and
output-bindings) into them, i.e. use them as components.

Frustration: a lot of things just "won't work" if they are not done the way
the authors expected. There are a lot of gotchas, and not a lot of diagnostic
messages to tell you why it isn't working.


### Reactive Models

Make a value that can change -> observable.
Compile an expression that includes dotted paths.
Dotted paths form a chain of "named property of value" watchers,
where non-object values yield an undefined value as the result.
Filters update when the source value has changed; if the source
value is a list or object, they yield a mapped/filtered version.
Values and expressions exist in scopes; scopes can be suspended,
resumed, destroyed. The value of a scope is the union of the
set of observables bound in it, and observables bound in inherited
scopes that are not shadowed.

If a two-way binding is declared, in which scope is it bound?
The simple answer is: a nested scope is not a new namespace,
but names can be bound _to_ a nested scope (e.g. v-repeat) by
the directive that creates the scope.

What is the use-case for two-way bindings anyway?
Is it only the creation of data (e.g. could be a property of a
data "thing" bound higher up in the tree?)

In the general case, binding is carried out on an Element to be
made available "in this scope" or "below this point". Both can work,
but things bound "in this scope" inside a repeated Element don't
make a lot of sense outside the repeat node.

"items | sort category, ~ts | filter !deleted, ts < {slider.ts}"

manglr.filter['filter'] = function (left, src, scope) {
  return m.fold(m.terms(src), left, function(left, term) {
    return left.filter(scope.compile(term,'@'));
  });
}
manglr.filter['sort'] = function (left, src, scope) {
  return m.fold(m.terms(src), left, function(left, term) {
    if (term.charAt(0)=='~') return left.sort(scope.compile(term.slice(1),'@'), 'desc');
    else return left.sort(scope.compile(term,'@'));
  });
}

m.terms() should parse brackets and quotes as a single term,
and should recognise and skip commas.


### Compatibility

IE7: <button> is a submit button unless <button type="button">
IE7: clicks the first button on the page when enter is pressed.
IE7: return false to prevent default.
IE7: event.returnValue=false for preventDefault()
IE7: event.cancelBubble=true for stopPropagation()
IE7: getElementById() throws if the id is not found
