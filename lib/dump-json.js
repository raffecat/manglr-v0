"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function dumpJSON(data) {
    const seen = new Set();
    function debugReplacer(key, val) {
        if (typeof (val) === 'object' && val !== null) {
            if (seen.has(val)) {
                // duplicate reference to object.
                const ref = val['@id'] || 'ref';
                return '#' + ref;
            }
            seen.add(val);
        }
        if (val instanceof Map || val instanceof Set) {
            // encode these as an array (of arrays for maps)
            return [...val];
        }
        return val;
    }
    return JSON.stringify(data, debugReplacer, 2);
}
exports.dumpJSON = dumpJSON;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHVtcC1qc29uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2R1bXAtanNvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBLGtCQUF5QixJQUFRO0lBRS9CLE1BQU0sSUFBSSxHQUFhLElBQUksR0FBRyxFQUFFLENBQUM7SUFFakMsdUJBQXVCLEdBQU8sRUFBRSxHQUFPO1FBQ3JDLEVBQUUsQ0FBQyxDQUFDLE9BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxRQUFRLElBQUksR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDN0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLGlDQUFpQztnQkFDakMsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztnQkFDaEMsTUFBTSxDQUFDLEdBQUcsR0FBQyxHQUFHLENBQUM7WUFDakIsQ0FBQztZQUNELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEIsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLEdBQUcsWUFBWSxHQUFHLElBQUksR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDN0MsZ0RBQWdEO1lBQ2hELE1BQU0sQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDO0FBckJELDRCQXFCQyJ9