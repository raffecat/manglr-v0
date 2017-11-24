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
import { loadStyleSheet } from './parse-css';
import { inlineFontFaceTransform, componentStylesTransform } from './transforms';
import * as ast from './ast';
import * as fs from 'fs';
import * as path from 'path';
import mkdirp = require('mkdirp');

//function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }

//const isLocalURL = /^file:\/\/\//;
//type Object = { [key:string]:any };


function dumpJSON(data:any) {
  const seen: Set<any> = new Set();
  function debugReplacer(key:any, val:any) {
    if (typeof(val)==='object') {
      if (seen.has(val)) {
        return '#ref';
      }
      seen.add(val);
    }
    if (val instanceof Map || val instanceof Set) {
      return [...val];
    }
    return val;
  }
  return JSON.stringify(data,debugReplacer,2);
}


export function compileTarget(filename:string) {
  // phase 1: parse the main template and all imported templates.
  const ps = new ParserState("/pad/");
  const outDir = 'build';
  const fullPath = path.resolve(filename);
  const mainTpl = new ast.Template(fullPath);
  mainTpl.isMain = true;
  ps.templateCache.set(fullPath, mainTpl);
  ps.templateQueue.push(mainTpl);
  for (let ti=0; ti<ps.templateQueue.length; ++ti) { // NB. MUST use a counter; templateQueue grows.
    if (ps.debugLevel) ps.debug(`=> loadTemplate: ${ps.templateQueue[ti].filename}`);
    loadTemplate(ps, ps.templateQueue[ti]);
  }
  for (let si=0; si<ps.loadedStyleSheets.length; ++si) { // NB. MUST use a counter; loadedStyleSheets grows.
    if (ps.debugLevel) ps.debug(`=> loadStyleSheet: ${ps.loadedStyleSheets[si].filename}`);
    loadStyleSheet(ps, ps.loadedStyleSheets[si]);
  }
  // phase 1.5: apply global transforms.
  if (mainTpl.inlineFontFace != null) {
    inlineFontFaceTransform(ps, mainTpl.inlineFontFace, filename);
  }
  if (mainTpl.componentStyles != null) {
    componentStylesTransform(ps, mainTpl.componentStyles, filename);
  }
  // phase 2: compile each custom tag defined in each template.
  for (let tpl of ps.templateQueue) {
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
}
