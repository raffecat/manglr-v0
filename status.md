Phase 1
-------

Page assembly: parse an input page template, inline all of the components used,
substitute in the attribute bindings, output generated static HTML.

There is a basic transformation here: inlining components, coalescing their
styles and scripts.

If demo data is supported, this is enough to do what Hugo does (minus fan-out)

There are three output formats: static HTML, server code, client templates.
^ note that server code embeds fragments of static HTML.

Intermediate format:
Tags become TagNode.
Attributes with placeholders become TextTemplate[scope] or Expression[scope].
Text with placeholders become TextTemplate[scope].
Plain attributes and body text become Text.
Flattened Tags and Text become Markup.

Whitespace directives: m-norm-ws [default] m-strip-ws m-keep-ws.
https://css-tricks.com/fighting-the-space-between-inline-block-elements/

Phase 2
-------

Make client-side data bindings (and if/each templates) work: the runtime library.

Phase 3
-------

Generate server-side rendering code with data bindings, if/each.
