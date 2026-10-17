/**
 * Draw a laid-out graph as SVG in Netron's idiom: an operator is a rounded box whose header
 * carries the type on its category's colour, with one row per attribute or weight beneath; an
 * input or output is a pill; an edge is an orthogonal path with rounded bends and an arrowhead,
 * labelled with the tensor's shape.
 *
 * Everything is built through the DOM and serialised, so text from the model reaches the output
 * only as escaped text content. No ids, references or `<style>` are used, so any number of graphs
 * can share a page.
 *
 * The output paints itself: the rules the extension kept in its preview stylesheet are written onto
 * the elements as presentation attributes, which any stylesheet of the consumer's still overrides.
 * The classes those rules selected are kept for that.
 */
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { HEADER, ROW, PAD, TYPE_SIZE, ROW_SIZE, rowText } from './layout.js';
const SVG = 'http://www.w3.org/2000/svg';
const PADDING = 8;
const RADIUS = 4;
const BEND = 6;
const ARROW = 7;
/** Text baselines sit this far below a row's top, for the header's and a row's size. */
const HEADER_BASELINE = 15;
const ROW_BASELINE = 12;
export function drawGraph(drawing, className = 'onnx') {
    const document = new DOMImplementation().createDocument(SVG, 'svg', null);
    const root = document.documentElement;
    const width = drawing.width + 2 * PADDING;
    const height = drawing.height + 2 * PADDING;
    root.setAttribute('class', className);
    root.setAttribute('viewBox', `${-PADDING} ${-PADDING} ${number(width)} ${number(height)}`);
    // Inherited by every label; the widths in measure.ts were taken as Helvetica.
    root.setAttribute('font-family', "'Helvetica Neue', Helvetica, Arial, sans-serif");
    for (const wire of drawing.wires)
        root.appendChild(edge(document, wire));
    for (const item of drawing.placed)
        root.appendChild(item.node.kind === 'operator' ? operator(document, item) : terminal(document, item));
    paint(root);
    return new XMLSerializer().serializeToString(root);
}
/** Netron's category colours (its grapher.css), on an operator's header. */
const CATEGORIES = {
    layer: 'rgb(51, 85, 136)',
    activation: 'rgb(112, 41, 33)',
    pool: 'rgb(51, 85, 51)',
    normalization: 'rgb(51, 85, 68)',
    dropout: 'rgb(69, 71, 112)',
    shape: 'rgb(108, 79, 71)',
    tensor: 'rgb(89, 66, 59)',
    transform: 'rgb(51, 85, 68)',
    data: 'rgb(85, 85, 85)',
    quantization: 'rgb(80, 40, 0)',
    attention: 'rgb(120, 60, 0)',
    constant: '#eee',
    control: '#eee'
};
/** Light headers, whose type is written in black rather than white. */
const LIGHT = new Set(['constant', 'control']);
/** The extension's `svg.onnx …` rules for one class, in the stylesheet's order. */
const BY_CLASS = [
    ['box', [['fill', '#fff'], ['stroke', '#333'], ['stroke-width', '1']]],
    ['header', [['fill', '#333']]],
    ['type', [['fill', '#fff'], ['font-size', '12'], ['font-weight', '600']]],
    ['attribute', [['fill', '#000']]],
    ['weight', [['fill', '#000']]],
    ['key', [['fill', '#333']]],
    ['pill', [['fill', '#eee'], ['stroke', '#333'], ['stroke-width', '1']]],
    ['tensor', [['fill', '#555'], ['font-size', '11']]],
    ['wire', [['fill', 'none'], ['stroke', '#000'], ['stroke-width', '1']]],
    ['arrow', [['fill', '#000'], ['stroke', 'none']]],
    ['label-box', [['fill', '#fff'], ['stroke', 'none']]],
    ['label', [['fill', '#555'], ['font-size', '10']]]
];
const TEXT = [['fill', '#000'], ['stroke', 'none'], ['font-size', '11']];
/**
 * The extension's preview stylesheet (`svg.onnx …` in media/preview.css), as presentation
 * attributes. Each element gets the declarations of every rule that matched it there, the more
 * specific rule winning as it did: a class over `text`, and the descendant and sibling rules
 * (`.type .name`, `.weight .key`, `.input .type`, `.category-constant + .type`) over a class.
 */
function paint(root) {
    for (const element of Array.from(root.getElementsByTagName('*'))) {
        const properties = new Map();
        const set = (declarations) => {
            for (const [name, value] of declarations)
                properties.set(name, value);
        };
        const classes = classesOf(element);
        const parent = element.parentNode;
        if (element.tagName === 'text')
            set(TEXT);
        for (const [name, declarations] of BY_CLASS)
            if (classes.has(name))
                set(declarations);
        for (const name of classes) {
            const category = name.startsWith('category-') ? CATEGORIES[name.slice('category-'.length)] : undefined;
            if (category)
                set([['fill', category]]);
        }
        if (classes.has('type')) {
            const group = parent ? classesOf(parent) : new Set();
            const header = previousElement(element);
            const light = header ? [...classesOf(header)].some((name) => LIGHT.has(name.slice('category-'.length))) : false;
            if (group.has('input') || group.has('output') || light)
                set([['fill', '#000']]);
        }
        if (classes.has('name') && parent && classesOf(parent).has('type')) {
            set([['font-weight', 'normal'], ['font-size', '11'], ['opacity', '.85']]);
        }
        if (classes.has('key') && parent && classesOf(parent).has('weight'))
            set([['font-weight', '600']]);
        for (const [name, value] of properties)
            element.setAttribute(name, value);
    }
}
function classesOf(element) {
    return new Set((element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
}
function previousElement(element) {
    let node = element.previousSibling;
    while (node && node.nodeType !== node.ELEMENT_NODE)
        node = node.previousSibling;
    return node;
}
function operator(document, item) {
    const node = item.node;
    if (node.kind !== 'operator')
        throw new Error('not an operator');
    const group = element(document, 'g', { class: 'node', transform: `translate(${number(item.x)},${number(item.y)})` });
    group.appendChild(element(document, 'rect', { x: '0', y: '0', width: number(item.width), height: number(item.height), rx: String(RADIUS), class: 'box' }));
    // The header: a rectangle with rounded top corners only, so it meets the rows flush.
    const w = item.width;
    const r = RADIUS;
    const flush = node.attributes.length + node.weights.length === 0;
    const bottom = flush ? `V${number(HEADER - r)} a${r},${r} 0 0 1 ${-r},${r} H${r} a${r},${r} 0 0 1 ${-r},${-r}` : `V${HEADER} H0`;
    group.appendChild(element(document, 'path', {
        d: `M0,${r} a${r},${r} 0 0 1 ${r},${-r} H${number(w - r)} a${r},${r} 0 0 1 ${r},${r} ${bottom} Z`,
        class: node.category ? `header category-${node.category}` : 'header'
    }));
    const title = text(document, node.type, PAD, HEADER_BASELINE, 'type');
    if (node.name) {
        const name = element(document, 'tspan', { class: 'name' });
        name.appendChild(document.createTextNode(` ${node.name}`));
        title.appendChild(name);
    }
    group.appendChild(title);
    let y = HEADER;
    for (const row of [...node.attributes, ...node.weights]) {
        const line = text(document, '', PAD, y + ROW_BASELINE, 'value' in row ? 'attribute' : 'weight');
        const key = element(document, 'tspan', { class: 'key' });
        key.appendChild(document.createTextNode(row.name));
        line.appendChild(key);
        line.appendChild(document.createTextNode(rowText(row).slice(row.name.length)));
        group.appendChild(line);
        y += ROW;
    }
    const label = element(document, 'title', {});
    label.appendChild(document.createTextNode(node.name ? `${node.type} (${node.name})` : node.type));
    group.insertBefore(label, group.firstChild);
    return group;
}
function terminal(document, item) {
    const node = item.node;
    if (node.kind === 'operator')
        throw new Error('not a terminal');
    const group = element(document, 'g', { class: `node ${node.kind}`, transform: `translate(${number(item.x)},${number(item.y)})` });
    const radius = node.type ? RADIUS * 2 : item.height / 2;
    group.appendChild(element(document, 'rect', { x: '0', y: '0', width: number(item.width), height: number(item.height), rx: number(radius), class: 'pill' }));
    group.appendChild(text(document, node.name, PAD, HEADER_BASELINE, 'type'));
    if (node.type)
        group.appendChild(text(document, node.type, PAD, HEADER + ROW_BASELINE, 'tensor'));
    return group;
}
function edge(document, wire) {
    const group = element(document, 'g', { class: 'edge' });
    const points = wire.points;
    if (points.length >= 2) {
        group.appendChild(element(document, 'path', { d: rounded(points), class: 'wire' }));
        const end = points[points.length - 1];
        const before = points[points.length - 2];
        group.appendChild(element(document, 'path', { d: arrowhead(before, end), class: 'arrow' }));
    }
    if (wire.label) {
        const { text: content, x, y, width, height } = wire.label;
        group.appendChild(element(document, 'rect', { x: number(x - 2), y: number(y), width: number(width + 4), height: number(height), rx: '2', class: 'label-box' }));
        group.appendChild(text(document, content, x, y + height - 3, 'label'));
    }
    return group;
}
/** An orthogonal polyline with its corners rounded by a small quadratic curve. */
function rounded(points) {
    const first = points[0];
    let d = `M${number(first.x)},${number(first.y)}`;
    for (let i = 1; i < points.length - 1; i++) {
        const previous = points[i - 1];
        const corner = points[i];
        const next = points[i + 1];
        const into = Math.min(BEND, distance(previous, corner) / 2);
        const out = Math.min(BEND, distance(corner, next) / 2);
        const a = towards(corner, previous, into);
        const b = towards(corner, next, out);
        d += ` L${number(a.x)},${number(a.y)} Q${number(corner.x)},${number(corner.y)} ${number(b.x)},${number(b.y)}`;
    }
    const last = points[points.length - 1];
    d += ` L${number(last.x)},${number(last.y)}`;
    return d;
}
function arrowhead(from, tip) {
    const length = distance(from, tip) || 1;
    const ux = (tip.x - from.x) / length;
    const uy = (tip.y - from.y) / length;
    const base = { x: tip.x - ux * ARROW, y: tip.y - uy * ARROW };
    const half = ARROW * 0.5;
    const left = { x: base.x - uy * half, y: base.y + ux * half };
    const right = { x: base.x + uy * half, y: base.y - ux * half };
    return `M${number(tip.x)},${number(tip.y)} L${number(left.x)},${number(left.y)} L${number(right.x)},${number(right.y)} Z`;
}
function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}
function towards(from, to, by) {
    const length = distance(from, to) || 1;
    return { x: from.x + (to.x - from.x) / length * by, y: from.y + (to.y - from.y) / length * by };
}
function text(document, content, x, y, className) {
    const node = element(document, 'text', { x: number(x), y: number(y), class: className });
    if (content)
        node.appendChild(document.createTextNode(content));
    return node;
}
function element(document, name, attributes) {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes))
        node.setAttribute(key, value);
    return node;
}
function number(value) {
    return String(Math.round(value * 100) / 100);
}
export { TYPE_SIZE, ROW_SIZE };
