// @ts-nocheck
/**
 * Steel Member Detector
 * Bid Extractor v1.5.0
 *
 * Automatically detects steel member callouts from blueprint drawings
 * using Google Cloud Vision OCR and pattern matching
 */

const MemberDetector = (() => {
  // Regex patterns for steel member callouts
  const MEMBER_PATTERNS = {
    // W shapes: W12X26, W 12 X 26, W12x26
    W_SHAPE: /\bW\s*(\d{1,2})\s*[Xx×]\s*(\d{1,3}(?:\.\d)?)\b/gi,

    // HSS: HSS6X6X1/4, HSS 6X4X3/8, HSS6x6x.250
    HSS_SHAPE: /\bHSS\s*(\d{1,2})\s*[Xx×]\s*(\d{1,2})\s*[Xx×]\s*(\d\/\d|\d*\.?\d+)\b/gi,

    // Pipe: PIPE6STD, PIPE 4 XS, 6" PIPE
    PIPE_SHAPE: /\b(?:PIPE\s*(\d{1,2}(?:-\d\/\d)?)\s*(STD|XS|XXS)?|(\d{1,2})[""]?\s*(?:DIA\.?)?\s*PIPE)\b/gi,

    // Angles: L4X4X1/4, L 4 X 4 X 3/8, ∠4X4X1/4
    ANGLE_SHAPE: /\b[L∠]\s*(\d{1,2}(?:-\d\/\d)?)\s*[Xx×]\s*(\d{1,2}(?:-\d\/\d)?)\s*[Xx×]\s*(\d\/\d|\d*\.?\d+)\b/gi,

    // Channels: C10X30, MC8X22.8, C 12 X 25
    CHANNEL_SHAPE: /\b(M?C)\s*(\d{1,2})\s*[Xx×]\s*(\d{1,3}(?:\.\d{1,2})?)\b/gi,

    // WT shapes: WT12X52, WT 18 X 150
    WT_SHAPE: /\bWT\s*(\d{1,2})\s*[Xx×]\s*(\d{1,3})\b/gi,

    // Plates: PL 1/2 X 12, PL1X6, PLATE 3/4 X 8
    PLATE: /\b(?:PL|PLATE)\s*(\d\/\d|\d*\.?\d+)\s*[Xx×]\s*(\d{1,2})\b/gi,

    // Generic beam/column marks: B1, B-1, C1, G1, etc.
    MARK: /\b([BCGJS])-?(\d{1,3}[A-Z]?)\b/g
  };

  // Normalize detected member to standard format
  function normalizeMember(type, match) {
    switch (type) {
      case 'W_SHAPE':
        return `W${match[1]}X${match[2]}`.toUpperCase();
      case 'HSS_SHAPE':
        return `HSS${match[1]}X${match[2]}X${match[3]}`.toUpperCase();
      case 'PIPE_SHAPE':
        if (match[1]) {
          return `PIPE${match[1]}${match[2] || 'STD'}`.toUpperCase();
        }
        return `PIPE${match[3]}STD`.toUpperCase();
      case 'ANGLE_SHAPE':
        return `L${match[1]}X${match[2]}X${match[3]}`.toUpperCase();
      case 'CHANNEL_SHAPE':
        return `${match[1]}${match[2]}X${match[3]}`.toUpperCase();
      case 'WT_SHAPE':
        return `WT${match[1]}X${match[2]}`.toUpperCase();
      case 'PLATE':
        return `PL${match[1]}X${match[2]}`.toUpperCase();
      default:
        return match[0].toUpperCase();
    }
  }

  // Extract all steel members from OCR text with positions
  function extractMembers(ocrResult) {
    const detectedMembers = [];
    const seen = new Set();

    // Google Vision returns annotations with bounding boxes
    const annotations = ocrResult.textAnnotations || [];

    // First annotation is the full text
    const fullText = annotations[0]?.description || '';

    // Process each pattern
    for (const [patternType, regex] of Object.entries(MEMBER_PATTERNS)) {
      if (patternType === 'MARK') continue; // Skip marks for now

      let match;
      const patternCopy = new RegExp(regex.source, regex.flags);

      while ((match = patternCopy.exec(fullText)) !== null) {
        const normalized = normalizeMember(patternType, match);
        const key = normalized;

        if (seen.has(key)) continue;
        seen.add(key);

        // Try to find position from word annotations
        const position = findMemberPosition(annotations, match[0]);

        // Validate against steel database
        let weight = null;
        let isValid = false;
        if (typeof SteelDatabase !== 'undefined') {
          const parsed = SteelDatabase.parseMember(normalized);
          if (parsed.valid) {
            weight = parsed.weight;
            isValid = true;
          }
        }

        detectedMembers.push({
          raw: match[0],
          normalized,
          type: patternType.replace('_SHAPE', '').replace('_', ''),
          weight,
          isValid,
          position,
          context: getContext(fullText, match.index, 30)
        });
      }
    }

    // Sort by validity (valid first) then by type
    detectedMembers.sort((a, b) => {
      if (a.isValid !== b.isValid) return b.isValid - a.isValid;
      return a.type.localeCompare(b.type);
    });

    return detectedMembers;
  }

  // Find the bounding box position for a member in annotations
  function findMemberPosition(annotations, searchText) {
    if (!annotations || annotations.length < 2) return null;

    const searchNorm = searchText.replace(/\s+/g, '').toUpperCase();

    // Look through word-level annotations (skip first which is full text)
    for (let i = 1; i < annotations.length; i++) {
      const ann = annotations[i];
      const text = (ann.description || '').replace(/\s+/g, '').toUpperCase();

      if (text.includes(searchNorm) || searchNorm.includes(text)) {
        const vertices = ann.boundingPoly?.vertices;
        if (vertices && vertices.length === 4) {
          return {
            x: vertices[0].x || 0,
            y: vertices[0].y || 0,
            width: (vertices[1].x || 0) - (vertices[0].x || 0),
            height: (vertices[2].y || 0) - (vertices[0].y || 0)
          };
        }
      }
    }
    return null;
  }

  // Get surrounding context for a match
  function getContext(text, index, radius) {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    let context = text.substring(start, end).replace(/\n/g, ' ').trim();
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    return context;
  }

  // Scan current PDF page using Google Vision OCR
  async function scanPage(canvas, apiKey) {
    if (!apiKey) {
      throw new Error('Google Vision API key required');
    }

    // Convert canvas to base64
    const imageData = canvas.toDataURL('image/png').split(',')[1];

    // Call Google Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageData },
            features: [
              { type: 'TEXT_DETECTION', maxResults: 500 },
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
            ]
          }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Vision API request failed');
    }

    const result = await response.json();
    const ocrResult = result.responses?.[0];

    if (ocrResult?.error) {
      throw new Error(ocrResult.error.message);
    }

    return ocrResult;
  }

  // Main detection function
  async function detectMembers(pdfDoc, pageNum, apiKey, scale = 2.0) {
    // Render page to high-res canvas
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Run OCR
    const ocrResult = await scanPage(canvas, apiKey);

    // Extract members
    const members = extractMembers(ocrResult);

    // Scale positions back to original viewport
    const originalScale = scale;
    members.forEach(m => {
      if (m.position) {
        m.position.x /= originalScale;
        m.position.y /= originalScale;
        m.position.width /= originalScale;
        m.position.height /= originalScale;
      }
    });

    return {
      members,
      fullText: ocrResult.textAnnotations?.[0]?.description || '',
      pageNum
    };
  }

  // Count unique member types
  function summarizeDetection(members) {
    const byType = {};
    members.forEach(m => {
      if (!byType[m.type]) {
        byType[m.type] = [];
      }
      byType[m.type].push(m);
    });

    return {
      total: members.length,
      valid: members.filter(m => m.isValid).length,
      byType
    };
  }

  // Public API
  return {
    detectMembers,
    extractMembers,
    scanPage,
    summarizeDetection,
    MEMBER_PATTERNS
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.MemberDetector = MemberDetector;
}
