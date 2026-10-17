# ONNX Graph Preview

## A small CNN in the ONNX text syntax

```onnx
<ir_version: 8, opset_import: ["" : 17]>
cnn (float[N, 3, 32, 32] x, float[8, 3, 3, 3] w = {}, float[8] b = {}) => (float[N, 10] y) {
  c = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (x, w, b)
  bn = BatchNormalization <epsilon = 0.00001> (c, scale, bias, mean, var)
  r = Relu (bn)
  p = MaxPool <kernel_shape = [2, 2], strides = [2, 2]> (r)
  g = GlobalAveragePool (p)
  f = Flatten (g)
  y = Gemm <transB = 1> (f, fc_w, fc_b)
}
```

## A residual block, laid out to the right

```onnx {caption="Figure 1: a basic residual block" align="center" direction="right"}
block (float[N, 64, 56, 56] x) => (float[N, 64, 56, 56] y) {
  c1 = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (x, w1)
  b1 = BatchNormalization (c1, s1, bias1, m1, v1)
  r1 = Relu (b1)
  c2 = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (r1, w2)
  b2 = BatchNormalization (c2, s2, bias2, m2, v2)
  s = Add (b2, x)
  y = Relu (s)
}
```

## Attention, with a nested graph noted but not drawn

```onnx
attention (float[B, T, 512] x, bool mask) => (float[B, T, 512] y) {
  q = MatMul (x, wq)
  k = MatMul (x, wk)
  v = MatMul (x, wv)
  kt = Transpose <perm = [0, 2, 1]> (k)
  scores = MatMul (q, kt)
  scaled = Div (scores, scale)
  masked = If <then_branch = yes () => (float[B, T, T] t) { t = Where (mask, scaled, neg_inf) }, else_branch = no () => (float[B, T, T] e) { e = Identity (scaled) }> (mask)
  p = Softmax <axis = -1> (masked)
  y = MatMul (p, v)
}
```

## The protobuf text form

```onnx
ir_version: 7
producer_name: "hand"
graph {
  name: "mlp"
  node { input: "x" input: "w1" output: "h" op_type: "MatMul" }
  node { input: "h" output: "a" op_type: "Relu" }
  node { input: "a" input: "w2" output: "y" op_type: "MatMul" name: "head" }
  input { name: "x" type { tensor_type { elem_type: 1 shape { dim { dim_param: "N" } dim { dim_value: 784 } } } } }
  output { name: "y" type { tensor_type { elem_type: 1 shape { dim { dim_param: "N" } dim { dim_value: 10 } } } } }
}
```

## A parse error is reported in place

```onnx
g (float[1] x) => (float[1] y) {
  y = Relu (x
}
```
