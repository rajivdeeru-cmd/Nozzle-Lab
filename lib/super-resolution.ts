export type SuperResolutionProvider = "realesrgan" | "swinir";

export type SuperResolutionConfig = {
  provider: SuperResolutionProvider;
  modelUrl: string;
  scale: 2 | 4;
};

/**
 * Integration boundary for a pretrained browser model.
 * The UI uses a deterministic 2x preview until a converted ONNX/TF.js
 * weight file is supplied at the configured model URL.
 */
export async function upscaleWithPretrainedModel(
  image: HTMLImageElement,
  config: SuperResolutionConfig
): Promise<HTMLCanvasElement> {
  const response = await fetch(config.modelUrl);
  if (!response.ok) throw new Error(`Unable to load ${config.provider} model weights.`);
  throw new Error("Model weights were found, but the ONNX/TF.js runtime adapter is not configured yet.");
}
