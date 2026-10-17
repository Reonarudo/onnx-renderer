/** Models the tests share. */

/** A dense graph: every one of 16 inputs feeds every one of 16 Sum nodes, 256 edges that take ELK most of a second. */
export const DENSE = (() => {
  const inputs = Array.from({ length: 16 }, (_, i) => `float[1] i${i}`).join(', ');
  const outputs = Array.from({ length: 16 }, (_, i) => `float[1] o${i}`).join(', ');
  const nodes = Array.from({ length: 16 }, (_, i) => `  o${i} = Sum (${Array.from({ length: 16 }, (_, j) => `i${j}`).join(', ')})`);
  return `dense (${inputs}) => (${outputs}) {\n${nodes.join('\n')}\n}`;
})();

export const CONV = `<ir_version: 8, opset_import: ["" : 17]>
cnn (float[N, 3, 32, 32] x, float[8, 3, 3, 3] w = {}) => (float[N, 10] y) {
  c = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1], group = 1> (x, w)
  r = Relu (c)
  p = GlobalAveragePool (r)
  y = Gemm <alpha = 1.0, transB = 1> (p, fc_w, fc_b)
}`;
