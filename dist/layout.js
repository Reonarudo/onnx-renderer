import { measure } from './measure.js';
/** Netron's proportions, in pixels: a header row, then one row per attribute or weight. */
export const HEADER = 22;
export const ROW = 17;
export const PAD = 12;
export const TYPE_SIZE = 12;
export const ROW_SIZE = 11;
export const LABEL_SIZE = 10;
const MIN_WIDTH = 60;
/** Text of a row inside an operator: `name = value` or `name ⟨shape⟩`. */
export function rowText(row) {
    if (row.value !== undefined)
        return row.value === '' ? row.name : `${row.name} = ${row.value}`;
    return row.shape ? `${row.name} ⟨${row.shape}⟩` : row.name;
}
export function sizeOf(node) {
    if (node.kind === 'operator') {
        const rows = [...node.attributes, ...node.weights].map((row) => measure(rowText(row), ROW_SIZE));
        const header = measure(node.type, TYPE_SIZE, true) + (node.name ? measure(` ${node.name}`, ROW_SIZE) : 0);
        const width = Math.max(MIN_WIDTH, header + 2 * PAD, ...rows.map((row) => row + 2 * PAD));
        return { width: Math.ceil(width), height: HEADER + ROW * rows.length };
    }
    const name = measure(node.name, TYPE_SIZE, true);
    const type = node.type ? measure(node.type, ROW_SIZE) : 0;
    return { width: Math.ceil(Math.max(MIN_WIDTH, name + 2 * PAD, type + 2 * PAD)), height: node.type ? HEADER + ROW : HEADER };
}
export async function layoutGraph(graph, layout, direction = 'down') {
    const options = {
        'org.eclipse.elk.algorithm': 'layered',
        'org.eclipse.elk.direction': direction === 'right' ? 'RIGHT' : 'DOWN',
        'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
        'org.eclipse.elk.spacing.nodeNode': '28',
        'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '36',
        'org.eclipse.elk.spacing.edgeNode': '20',
        'org.eclipse.elk.spacing.edgeEdge': '14',
        'org.eclipse.elk.spacing.edgeLabel': '4',
        'org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers': '16',
        'org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers': '14',
        'org.eclipse.elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        'org.eclipse.elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'org.eclipse.elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'org.eclipse.elk.layered.edgeLabels.sideSelection': 'SMART_DOWN'
    };
    const children = graph.nodes.map((node) => ({ id: node.id, ...sizeOf(node) }));
    const edges = graph.edges.map((edge, index) => {
        const result = { id: `e${index}`, sources: [edge.from], targets: [edge.to] };
        if (edge.label) {
            result.labels = [{ text: edge.label, width: Math.ceil(measure(edge.label, LABEL_SIZE)), height: LABEL_SIZE + 2 }];
        }
        return result;
    });
    const laid = await layout({ id: 'root', layoutOptions: options, children, edges });
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const placed = (laid.children ?? []).map((child) => ({
        node: byId.get(child.id), x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0
    }));
    const wires = (laid.edges ?? []).map((edge) => {
        const section = edge.sections?.[0];
        const points = section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] : [];
        const label = edge.labels?.[0];
        return label ? { points, label: labelOf(label) } : { points };
    });
    return { placed, wires, width: laid.width ?? 0, height: laid.height ?? 0 };
}
function labelOf(label) {
    return { text: label.text ?? '', x: label.x ?? 0, y: label.y ?? 0, width: label.width ?? 0, height: label.height ?? 0 };
}
