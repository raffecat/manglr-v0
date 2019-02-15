"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function reconstitute(node) {
    let res = '<' + node.tag;
    for (let key of Object.keys(node.attribs)) {
        const val = node.attribs.get(key);
        res = res + ' ' + key + '="' + val + '"'; // NB. can include un-escaped quotes.
    }
    return res + '>';
}
exports.reconstitute = reconstitute;
function reportUnused(ps, node, allow, filename) {
    for (let key of Object.keys(node.attribs)) {
        if (!allow.has(key)) {
            ps.warn('unrecognised "' + key + '" attribute was ignored: ' + reconstitute(node) + ' in: ' + filename);
        }
    }
}
exports.reportUnused = reportUnused;
function assertEmpty(ps, node, filename) {
    if (node.children.length) {
        ps.warn('tag should not contain markup: ' + reconstitute(node) + ' in: ' + filename);
    }
}
exports.assertEmpty = assertEmpty;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3JlcG9ydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLHNCQUE2QixJQUFZO0lBQ3ZDLElBQUksR0FBRyxHQUFHLEdBQUcsR0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ3ZCLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFDLEdBQUcsR0FBQyxHQUFHLENBQUMsQ0FBQyxxQ0FBcUM7SUFDN0UsQ0FBQztJQUNELE1BQU0sQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDO0FBQ2pCLENBQUM7QUFQRCxvQ0FPQztBQUVELHNCQUE2QixFQUFjLEVBQUUsSUFBWSxFQUFFLEtBQWlCLEVBQUUsUUFBZTtJQUMzRixHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFDLEdBQUcsR0FBQywyQkFBMkIsR0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUMsT0FBTyxHQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hHLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQU5ELG9DQU1DO0FBRUQscUJBQTRCLEVBQWMsRUFBRSxJQUFZLEVBQUUsUUFBZTtJQUN0RSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDMUIsRUFBRSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsR0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUMsT0FBTyxHQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7QUFDSCxDQUFDO0FBSkQsa0NBSUMifQ==