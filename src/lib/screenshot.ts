// Screenshot pipeline is disabled in serverless (Vercel).
// Artifact HTML is the source of truth and renders in the iframe.
// To enable screenshots, deploy a separate worker with Puppeteer
// that calls the /render endpoint and uploads PNGs.

export async function captureAndUpload(
  _artifactHtml: string,
  _sessionId: string,
  _frameNumber: number
): Promise<string | null> {
  return null;
}
