import type { Site } from '@site-rescue/content-schema';

export interface DetectionInput {
  url: string;
  html: string;
}

export interface DetectionEvidence {
  signal: string;
  weight: number;
}

export interface DetectionResult {
  platform: string;
  detected: boolean;
  confidence: number;
  evidence: DetectionEvidence[];
}

export interface CapturedPageInput {
  url: string;
  html: string;
  title: string;
}

export interface CaptureWarningInput {
  url: string;
  message: string;
}

export interface NormalizeSiteInput {
  baseUrl: string;
  pages: CapturedPageInput[];
  capturedAt?: string;
  warnings?: CaptureWarningInput[];
}

export interface SourceAdapter {
  readonly id: string;
  readonly displayName: string;
  detect(input: DetectionInput): DetectionResult;
  normalize(input: NormalizeSiteInput): Site;
}

export interface SourceAdapterMatch {
  adapter: SourceAdapter;
  detection: DetectionResult;
}

function validateAdapter(adapter: SourceAdapter, result: DetectionResult): void {
  if (adapter.id.trim() === '') {
    throw new Error('Source adapter IDs must not be empty.');
  }
  if (result.platform !== adapter.id) {
    throw new Error(
      `Source adapter ${adapter.id} returned detection for ${result.platform}.`,
    );
  }
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    throw new Error(`Source adapter ${adapter.id} returned an invalid confidence.`);
  }
}

export function selectSourceAdapter(
  input: DetectionInput,
  adapters: readonly SourceAdapter[],
): SourceAdapterMatch | undefined {
  const adapterIds = new Set<string>();
  let selected: SourceAdapterMatch | undefined;

  for (const adapter of adapters) {
    if (adapterIds.has(adapter.id)) {
      throw new Error(`Duplicate source adapter ID: ${adapter.id}`);
    }
    adapterIds.add(adapter.id);
    const detection = adapter.detect(input);
    validateAdapter(adapter, detection);
    if (
      detection.detected &&
      (selected === undefined || detection.confidence > selected.detection.confidence)
    ) {
      selected = { adapter, detection };
    }
  }

  return selected;
}
