'use strict';

// inline all custom-tag templates used.
// inline 'if' tags with true conditions if data is supplied.
// inline copies of 'each' tags if data is supplied.
// inline a placeholder comment otherwise.

// allows <img src="{user.avatar}"> without spurious fetch
// uniquifies id attributes inside components (if enabled, unless prefixed with #?)

import { generateHTML } from './gen-html';
import { ParserState } from './parser-state';
import { loadTemplate } from './component-phase';
import { buildTagsInTpl } from './output-phase';
import { inlineFontFaceTransform, componentStylesTransform } from './transforms';
import { dumpJSON } from './dump-json';
import * as ast from './ast';
import * as fs from 'fs';
import * as path from 'path';
import mkdirp = require('mkdirp');

//function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }

//const isLocalURL = /^file:\/\/\//;
//type Object = { [key:string]:any };

export function compileTarget(filename:string) {
  // phase 1: parse the main template and all imported templates.
  const ps = new ParserState("/pad/");
  const outDir = 'build';
  const fullPath = path.resolve(filename);
  const mainTpl = new ast.Template(fullPath);
  mainTpl.isMain = true;
  ps.allTemplates.push(mainTpl);
  ps.templateCache.set(fullPath, mainTpl);
  ps.queue.push((cb:any) => {
    loadTemplate(ps, mainTpl, cb);
  });
  ps.queue.start((err:any) => {
    if (err) throw err;

    // phase 1.5: apply global transforms.
    if (mainTpl.inlineFontFace != null) {
      inlineFontFaceTransform(ps, mainTpl.inlineFontFace, filename);
    }
    if (mainTpl.componentStyles != null) {
      componentStylesTransform(ps, mainTpl.componentStyles, filename);
    }

    // phase 2: compile each custom tag defined in each template.
    for (let tpl of ps.allTemplates) {
      buildTagsInTpl(ps, tpl);
    }

    // load test data.
    var knownData: any = {}; // from <link rel="test-data">
    if (mainTpl.testDataUrl) {
      const dataFile = path.resolve(path.dirname(filename), mainTpl.testDataUrl);
      if (!fs.existsSync(dataFile)) {
        ps.error('not found: '+dataFile+' imported from '+filename);
      } else {
        knownData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      }
    }

    // TODO: move to the queue (but before write-phase)
    mkdirp(outDir, (err)=>{
      if (err) {
        ps.error(`cannot create directory: ${outDir}`);
      } else {
        fs.writeFileSync(`${outDir}/index.json`, dumpJSON(mainTpl), 'utf8');
        const htmlTag = mainTpl.tags.get('html');
        if (htmlTag) {
          const html = generateHTML(htmlTag, knownData);
          fs.writeFileSync(`${outDir}/index.html`, html, 'utf8');
        } else {
          ps.error('the main template must contain a <html> tag entry-point: '+filename);
        }
      }
      if (ps.numWarnings) console.log(`${ps.numWarnings} warning${ps.numWarnings>1?'s':''}.`);
      if (ps.numErrors) console.log(`${ps.numErrors} error${ps.numErrors>1?'s':''}.`);
      //fs.writeFileSync(`${outDir}/binds.js`, JSON.stringify(decl.binds), 'utf8');
    });
  });
}
