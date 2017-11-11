Manglr
------

An opinionated HTML-first framework for single-page apps and web sites.
One-way data flow.
State management.

Start with the minimum viable: a static site.
Add one-way data bindings and provide sample data.
Add interaction via actions and stores.
If necessary, add plugins or custom code.

Server-side rendering: provide stores and render static, or pre-render a view.
Client-side rendering: fetch data and render; interact and update.

NB. client-side "hydration" never fails; the client will just update to match the data.
Should we serialize and inline the state into server-rendered HTML?

Rules for state management (time-travel debugging; snapshots):
- do not rely on object identity [other than for caching]
- after mutation, the framework makes a deep-copy [re-using its own immutable copies]
- actions can therefore mutate or replace whatever they like

Controller files contain [exported] action functions and private functions.
An init function can return the initial state.
A view function returns a [cacheable] projection of the state.
An action function takes (state) and returns state after mutating it.
Action functions are exposed as actions in the node tree below use of the controller.

Vue: Mutations must be synchronous.
Vue: Actions can asynchronously commit() mutations.

v-define="name: expression; foo: expression" (computed properties)

We can take the initial or mutated state and "bless" it with our own helper methods,
or wrap it in an immutable type [immutable.js] for computed projections to access.
We can also wrap or disallow functions and non-basic object types.

We can cross-compile Go code to Javascript for controllers.
We can lint and transpile Javascript to ES3, disallowing assignment in views [and TypeScript]

Declarative testing: pairs of [input state snapshot] and [expected virtual dom]

v-route="/foo?m=1#bar=2" rendered if path matches "/foo" and args match "m=1" and hash matches "bar=2".
Multiple elements can match the same pattern (anywhere, in any component)

Vue: "The data we need to fetch is determined by the route visited"
So embed data-fetches inside each v-route, either as directives or as code in controllers.

Store: is an async-cache holding items by type and id [compound key of any length?]
Coalesce requests to avoid more than one round-trip.

Loading indicator plugin: intercept route changes, determine all data needed,
show the indicator and lock navigation while loading the data, commit the route
change after all data is loaded.

Web Font fallbacks: directive that loads the webfont then replaces the font, for
progressive enhancement. https://www.youtube.com/watch?v=tO01ul1WNW8
fontfaceobserver.js -> add fonts-loaded class to body once fonts are loaded [css switch]
cssfontstack.com -> use font-style-matcher to tune font-matching

webpack: AOT: ahead-of-time compiler for the browser.

Inline SVG focus marker: https://www.youtube.com/watch?v=af4ZQJ14yu8
document.addEventListener('invalid', (e)=>{ e.target.dataset.touched = true; });
document.addEventListener('blur', (e)=>{ e.target.dataset.touched = true; });
.Input[data-touched]:invalid { border-color: hsl(0, 100%, 40%) }

--pack: do the web-pack thing (trverse and bundle assets)

<script type="text/x-manglr-state">{...}</script>

In each template, a name can only be bound once [unique rule] OR
In each template, shadowing is not permitted [no-shadow rule]

"defer" in IE4 and HTML4: runs just before [or after] DOMContentLoaded.
^ IE<=9 bug: modifying the DOM yields to other deferred scripts!
^ only works consistently on static script tags with src.

<script>
!function(d,e,f){for(;e<f.length;e++)d.createElement(f[e])}(document,0,['article','section','custom-tag'])
// dynamic async scripts execute in-order as they become ready, without blocking rendering.
!function(d,e,f,r){for(;e<f.length;e++)(r=d.createElement('script')).src=f[e],r.async=!1,d.head.appendChild(r)}(document,0,[
  '//other-domain.com/1.js',
  '2.js'
])
</script>

function DOMReady(a,b,c){b=document,c='addEventListener';b[c]?b[c]('DOMContentLoaded',a):window.attachEvent('onload',a)}

"Sera was never" - Dragon Age: Inquisition OST

Concerns:
- Quick-start and Codepen with client-side js
- Embedded code:

Mark D:
Embed the less powerful stuff inside the more powerful stuff.
It looks like JS; it shouldn't be a restricted subset.

https://github.com/cubiq/iscroll

cheerio (jQuery-ish)
htmlparser2
rework (css manipulation) - cf. www.myth.io

Developer Wars

Using GitHub open APIs.
Two random devs - how?
List top 5 repos by stars/popularity.
List preferred Languages.
Part of these Orgs.
Top one has 3 stars.
Random bio facts.
Pick the winningest developer.

https://api.github.com
Accept: application/vnd.github.v3+json

Josh's thing:

Template strings are available in: node 4+, chrome 41, firefox 34, edge, opera 28, safari 9

https://facebook.github.io/jsx/#why-not-template-literals
https://facebook.github.io/immutable-js/docs/#/List

"A generic but well defined syntax enables a community of independent parsers
and syntax highlighters to conform to a single specification."

acorn-jsx: A fork of acorn.
esprima-fb: A fork of esprima.
jsx-reader: A sweet.js macro.

pattern: (tag|component, attrs, children)

HTML [markup] is your glue:
- compose [common] components hierarchically
- bind to [common] styles with CSS classes
- bind to [common] data with {expressions}
- bind to [common] actions via on-attributes
- filter data via | (pipe) commands in expressions
- chain actions via | (pipe) commands


