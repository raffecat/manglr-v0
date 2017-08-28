Introduction
------------

Manglr is a DOM bindings library inspired by frameworks such as Knockout and
Angular. Using custom attributes in your HTML, it binds declarative
**expressions** to your **view model** so that changes in your **models**
are reflected automatically in the DOM, without writing any rendering code.

Why another one? Manglr is structured as a set of small, **independent
libraries** that can be combined to make a complete system of live DOM
bindings, expression evaluators and observable data models. Each library
has a small **well-specified interface** to allow use with custom or
3rd-party code.

There are official builds of the combined libraries to support most simple
use-cases. The official builds are around **6 Kb minified** and do not
depend on any other libraries.

**bind.js**

Binds declarative DOM attributes to live *expressions* in a *ViewModel*, and
updates the DOM whenever those expressions change in value.
The ViewModel implementation defines the expression syntax.

**scope.js**

Provides a *ViewModel* for the DOM bindings library. Compiles *expressions*
and links them to observable *Models* belonging to the application.
Must be provided with a root Model, which is used to resolve names in expressions.

**model.js**

Implements **Model** and **Collection** objects that the application can use to
build an observable data model. The *ViewModel* implementation binds these
objects to *expressions* on behalf of the DOM bindings library.
