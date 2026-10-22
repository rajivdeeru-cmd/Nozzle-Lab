# Pretrained super-resolution model slot

Place a converted, open-weight Real-ESRGAN or SwinIR model here and connect it
through `lib/super-resolution.ts`.

Recommended browser formats:

- ONNX model + `onnxruntime-web`
- TensorFlow.js GraphModel + `@tensorflow/tfjs`

The analyzer currently labels its canvas enlargement as a deterministic `2x
browser preview`; it does not claim that interpolation is AI super-resolution.
