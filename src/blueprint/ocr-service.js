// @ts-nocheck
/**
 * OCR Service - Google Cloud Vision Integration
 * Bid Extractor v1.4.0
 *
 * Extracts title block data from blueprint images using Google Vision API
 */

const OCRService = (() => {
  // OCR patterns for title block extraction
  const PATTERNS = {
    sheetNumber: [
      /(?:Sheet|Dwg|Drawing)\s*(?:#|No\.?|Number)?\s*([A-Z]+-?\d+(?:\.\d+)?)/i,
      /^([A-Z]{1,2}-?\d{2,4}(?:\.\d+)?)\b/m,
      /\b([A-Z]\d{3})\b/
    ],
    projectName: [
      /(?:Project|Job)\s*(?:Name)?\s*:?\s*(.+?)(?:\n|$)/i,
      /^(.{10,60}?)(?:\s+Sheet|\s+Page|\s+Dwg)/im
    ],
    revision: [
      /(?:Rev\.?|Revision)\s*([A-Z0-9]+)/i,
      /\bR(\d+)\b/,
      /(?:Issue|Version)\s*:?\s*([A-Z0-9]+)/i
    ],
    date: [
      /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
      /(?:Date|Dated?)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      /(\w+\s+\d{1,2},?\s+\d{4})/,
      /(\d{4}[/-]\d{1,2}[/-]\d{1,2})/
    ],
    scale: [
      /(?:Scale)\s*:?\s*([\d/'"\s=:-]+)/i,
      /(1\s*[:/]\s*\d+)/,
      /(\d+\/\d+['"]?\s*=\s*1['"]?-?0?['"]?)/,
      /(\d+['"]?\s*=\s*\d+['"]?-?\d*['"]?)/
    ],
    drawnBy: [
      /(?:Drawn|Drafted|By)\s*:?\s*([A-Z]{2,4})\b/i,
      /(?:Author|Designer|Engineer)\s*:?\s*(.+?)(?:\n|$)/i,
      /\b([A-Z]{2,4})\s*\/\s*[A-Z]{2,4}\b/ // Common format: DRN/CHK
    ]
  };

  // Title block regions to focus on (relative coordinates)
  const TITLE_BLOCK_REGIONS = [
    { name: 'bottom-right', x: 0.65, y: 0.85, width: 0.35, height: 0.15 },
    { name: 'bottom-center', x: 0.25, y: 0.90, width: 0.50, height: 0.10 },
    { name: 'right-side', x: 0.85, y: 0.50, width: 0.15, height: 0.50 }
  ];

  /**
   * Call Google Vision API for text detection
   * @param {string} imageBase64 - Base64 encoded image
   * @param {string} apiKey - Google Cloud Vision API key
   * @returns {Promise<object>} OCR response
   */
  async function callVisionAPI(imageBase64, apiKey) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    const requestBody = {
      requests: [{
        image: { content: imageBase64 },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 50 },
          { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
        ]
      }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Vision API request failed');
    }

    return response.json();
  }

  /**
   * Extract structured data from OCR text
   * @param {string} text - Raw OCR text
   * @returns {object} Extracted fields
   */
  function parseOCRText(text) {
    const result = {
      projectName: null,
      sheetNumber: null,
      revision: null,
      date: null,
      scale: null,
      drawnBy: null,
      confidence: 0
    };

    let matchCount = 0;
    const totalFields = Object.keys(PATTERNS).length;

    // Try each pattern for each field
    for (const [field, patterns] of Object.entries(PATTERNS)) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          result[field] = cleanExtractedValue(field, match[1]);
          matchCount++;
          break;
        }
      }
    }

    // Calculate confidence based on matched fields
    result.confidence = matchCount / totalFields;

    return result;
  }

  /**
   * Clean and normalize extracted values
   * @param {string} field - Field name
   * @param {string} value - Raw extracted value
   * @returns {string} Cleaned value
   */
  function cleanExtractedValue(field, value) {
    let cleaned = value.trim();

    switch (field) {
      case 'sheetNumber':
        // Normalize sheet numbers (A-101, A101, etc.)
        cleaned = cleaned.toUpperCase().replace(/\s+/g, '');
        break;

      case 'projectName':
        // Capitalize properly, remove extra whitespace
        cleaned = cleaned
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .substring(0, 100);
        break;

      case 'revision':
        // Uppercase revision letters/numbers
        cleaned = cleaned.toUpperCase();
        break;

      case 'date':
        // Normalize date format
        cleaned = normalizeDate(cleaned);
        break;

      case 'scale':
        // Clean up scale notation
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        break;

      case 'drawnBy':
        // Uppercase initials
        cleaned = cleaned.toUpperCase();
        break;
    }

    return cleaned;
  }

  /**
   * Normalize date to consistent format
   * @param {string} dateStr - Raw date string
   * @returns {string} Normalized date
   */
  function normalizeDate(dateStr) {
    // Try to parse various date formats
    const date = new Date(dateStr);

    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }

    return dateStr;
  }

  /**
   * Extract title block data from image
   * @param {string} imageBase64 - Base64 encoded image (without data URL prefix)
   * @param {string} apiKey - Google Cloud Vision API key
   * @returns {Promise<object>} Extraction result
   */
  async function extractTitleBlock(imageBase64, apiKey) {
    try {
      // Call Vision API
      const response = await callVisionAPI(imageBase64, apiKey);

      if (!response.responses || !response.responses[0]) {
        return { success: false, error: 'No response from Vision API' };
      }

      const ocrResult = response.responses[0];

      // Check for errors
      if (ocrResult.error) {
        return { success: false, error: ocrResult.error.message };
      }

      // Get full text from document text annotation (better formatting)
      const fullText = ocrResult.fullTextAnnotation?.text ||
                       ocrResult.textAnnotations?.[0]?.description || '';

      if (!fullText) {
        return { success: false, error: 'No text detected in image' };
      }

      // Parse the OCR text
      const extractedData = parseOCRText(fullText);

      // Also try to extract from individual text blocks for better accuracy
      if (ocrResult.textAnnotations) {
        enhanceWithTextBlocks(extractedData, ocrResult.textAnnotations);
      }

      return {
        success: true,
        data: extractedData,
        rawText: fullText
      };

    } catch (error) {
      console.error('OCR extraction error:', error);
      return {
        success: false,
        error: error.message || 'OCR extraction failed'
      };
    }
  }

  /**
   * Enhance extracted data with individual text blocks
   * Text blocks can help identify labels and their associated values
   * @param {object} data - Current extracted data
   * @param {array} textAnnotations - Text annotations from Vision API
   */
  function enhanceWithTextBlocks(data, textAnnotations) {
    // Skip first annotation (it's the full text)
    const blocks = textAnnotations.slice(1);

    // Look for labeled values (e.g., "SCALE:" followed by scale value)
    const labels = {
      'PROJECT': 'projectName',
      'SHEET': 'sheetNumber',
      'REV': 'revision',
      'REVISION': 'revision',
      'DATE': 'date',
      'SCALE': 'scale',
      'DRAWN': 'drawnBy',
      'BY': 'drawnBy'
    };

    for (let i = 0; i < blocks.length - 1; i++) {
      const block = blocks[i];
      const text = block.description.toUpperCase().replace(/[:\s]/g, '');

      if (labels[text] && !data[labels[text]]) {
        // Next block might be the value
        const nextBlock = blocks[i + 1];
        if (nextBlock) {
          const field = labels[text];
          const value = cleanExtractedValue(field, nextBlock.description);
          if (value && value.length > 0) {
            data[field] = value;
            data.confidence = Math.min(data.confidence + 0.1, 1);
          }
        }
      }
    }
  }

  /**
   * Test API key validity
   * @param {string} apiKey - API key to test
   * @returns {Promise<boolean>} Whether the key is valid
   */
  async function testApiKey(apiKey) {
    try {
      // Send a minimal request to check if key is valid
      const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  // Public API
  return {
    extractTitleBlock,
    testApiKey,
    parseOCRText // Exposed for testing
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.OCRService = OCRService;
}
