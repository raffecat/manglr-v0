Manglr
======

Manglr is an HTML-first, component-friendly _universal_ framework with an
emphasis on less code and more web standards. It scales from a simple blog
app to a full CMS, and works in any browser.

TL;DR
-----

* HTML-first components and templates
* One-way data bindings; pure-functional projection
* Optional server-side rendering (partial or full data population)
* Static page generation (e.g. S3 deployment)
* Local server for easy development

Manglr is typically used to deploy fast, cache-friendly server-rendered
content that subsequently behaves as a single-page app in the browser.
You can pre-render as much or as little of the page content as you like.
The rest will be populated in-browser after the page loads.

Rationale
---------

We typically perform _some_ kind of pre-processing on our web apps, be it SCSS,
webpack, rollup, or some hand-written tweaks.

Manglr builds on this premise: if you're going to have a build step, why not
automate it from day one and take advantage of it up-front: to serve local
files, compose your components, render with demo-data, lint your markup,
pre-verify your data bindings, etc.

The ```manglr``` compiler is re-targetable, allowing you to future-proof your
work: as new browser technologies or runtime techniques become available, the
compiler can be updated to support them.

Your work is also re-targetable: exporters can be used to generate e.g. _react_
components or to move to other frameworks in the future.

Status
------

Please note that this project is still in the early development phase.
