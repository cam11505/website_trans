import { load } from 'cheerio';

export interface DetectionInput {
  url: string;
  html: string;
}

export interface DetectionEvidence {
  signal: string;
  weight: number;
}

export interface DetectionResult {
  platform: 'weebly';
  detected: boolean;
  confidence: number;
  evidence: DetectionEvidence[];
}

export interface SourceAdapter {
  readonly id: string;
  readonly displayName: string;
  detect(input: DetectionInput): DetectionResult;
}

function addEvidence(
  evidence: DetectionEvidence[],
  condition: boolean,
  signal: string,
  weight: number,
): void {
  if (condition) {
    evidence.push({ signal, weight });
  }
}

export function detectWeebly(input: DetectionInput): DetectionResult {
  const url = new URL(input.url);
  const $ = load(input.html);
  const evidence: DetectionEvidence[] = [];
  const hostname = url.hostname.toLowerCase();
  const generator = $('meta[name="generator"]').attr('content')?.toLowerCase() ?? '';
  const documentHtml = $.html().toLowerCase();

  addEvidence(evidence, /(^|\.)weebly\.com$/u.test(hostname), 'Hostname is on weebly.com', 0.65);
  addEvidence(evidence, generator.includes('weebly'), 'Generator metadata names Weebly', 0.55);
  addEvidence(
    evidence,
    /(?:cdn\d*\.editmysite\.com|assets\.weebly\.com|weeblycloud\.com)/u.test(documentHtml),
    'Document references Weebly-hosted assets',
    0.35,
  );
  addEvidence(
    evidence,
    $('[class*="wsite-"], [id*="wsite-"]').length > 0,
    'Document contains Weebly wsite markers',
    0.3,
  );
  addEvidence(
    evidence,
    $('script[src*="weebly.com"], script[src*="editmysite.com"]').length > 0,
    'Document loads a Weebly script',
    0.25,
  );

  const confidence = Math.min(
    1,
    Number(evidence.reduce((total, item) => total + item.weight, 0).toFixed(2)),
  );

  return {
    platform: 'weebly',
    detected: confidence >= 0.5,
    confidence,
    evidence,
  };
}

export const weeblyAdapter: SourceAdapter = {
  id: 'weebly',
  displayName: 'Weebly',
  detect: detectWeebly,
};

