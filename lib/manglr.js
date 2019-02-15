'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// inline all custom-tag templates used.
// inline 'if' tags with true conditions if data is supplied.
// inline copies of 'each' tags if data is supplied.
// inline a placeholder comment otherwise.
// allows <img src="{user.avatar}"> without spurious fetch
// uniquifies id attributes inside components (if enabled, unless prefixed with #?)
const gen_html_1 = require("./gen-html");
const parser_state_1 = require("./parser-state");
const component_phase_1 = require("./component-phase");
const output_phase_1 = require("./output-phase");
const transforms_1 = require("./transforms");
const dump_json_1 = require("./dump-json");
const ast = require("./ast");
const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
//function trim(s:string) { return s.replace(/^\s\s*/,'').replace(/\s\s*$/,'') }
//const isLocalURL = /^file:\/\/\//;
//type Object = { [key:string]:any };
function compileTarget(filename) {
    // phase 1: parse the main template and all imported templates.
    const ps = new parser_state_1.ParserState("/pad/");
    const outDir = 'build';
    const fullPath = path.resolve(filename);
    const mainTpl = new ast.Template(fullPath);
    mainTpl.isMain = true;
    ps.allTemplates.push(mainTpl);
    ps.templateCache.set(fullPath, mainTpl);
    ps.queue.push((cb) => {
        component_phase_1.loadTemplate(ps, mainTpl, cb);
    });
    ps.queue.start((err) => {
        if (err)
            throw err;
        // phase 1.5: apply global transforms.
        if (mainTpl.inlineFontFace != null) {
            transforms_1.inlineFontFaceTransform(ps, mainTpl.inlineFontFace, filename);
        }
        if (mainTpl.componentStyles != null) {
            transforms_1.componentStylesTransform(ps, mainTpl.componentStyles, filename);
        }
        // phase 2: compile each custom tag defined in each template.
        for (let tpl of ps.allTemplates) {
            output_phase_1.buildTagsInTpl(ps, tpl);
        }
        // load test data.
        var knownData = {}; // from <link rel="test-data">
        if (mainTpl.testDataUrl) {
            const dataFile = path.resolve(path.dirname(filename), mainTpl.testDataUrl);
            if (!fs.existsSync(dataFile)) {
                ps.error('not found: ' + dataFile + ' imported from ' + filename);
            }
            else {
                knownData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            }
        }
        // TODO: move to the queue (but before write-phase)
        mkdirp(outDir, (err) => {
            if (err) {
                ps.error(`cannot create directory: ${outDir}`);
            }
            else {
                fs.writeFileSync(`${outDir}/index.json`, dump_json_1.dumpJSON(mainTpl), 'utf8');
                const htmlTag = mainTpl.tags.get('html');
                if (htmlTag) {
                    const html = gen_html_1.generateHTML(htmlTag, knownData);
                    fs.writeFileSync(`${outDir}/index.html`, html, 'utf8');
                }
                else {
                    ps.error('the main template must contain a <html> tag entry-point: ' + filename);
                }
            }
            if (ps.numWarnings)
                console.log(`${ps.numWarnings} warning${ps.numWarnings > 1 ? 's' : ''}.`);
            if (ps.numErrors)
                console.log(`${ps.numErrors} error${ps.numErrors > 1 ? 's' : ''}.`);
            //fs.writeFileSync(`${outDir}/binds.js`, JSON.stringify(decl.binds), 'utf8');
        });
    });
}
exports.compileTarget = compileTarget;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL21hbmdsci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7O0FBRWIsd0NBQXdDO0FBQ3hDLDZEQUE2RDtBQUM3RCxvREFBb0Q7QUFDcEQsMENBQTBDO0FBRTFDLDBEQUEwRDtBQUMxRCxtRkFBbUY7QUFFbkYseUNBQTBDO0FBQzFDLGlEQUE2QztBQUM3Qyx1REFBaUQ7QUFDakQsaURBQWdEO0FBQ2hELDZDQUFpRjtBQUNqRiwyQ0FBdUM7QUFDdkMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsaUNBQWtDO0FBRWxDLGdGQUFnRjtBQUVoRixvQ0FBb0M7QUFDcEMscUNBQXFDO0FBRXJDLHVCQUE4QixRQUFlO0lBQzNDLCtEQUErRDtJQUMvRCxNQUFNLEVBQUUsR0FBRyxJQUFJLDBCQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDO0lBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0lBQ3RCLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzlCLEVBQUUsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4QyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQU0sRUFBRSxFQUFFO1FBQ3ZCLDhCQUFZLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUNILEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FB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