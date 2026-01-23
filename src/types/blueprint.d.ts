/**
 * Blueprint Management Type Definitions
 * Bid Extractor v1.4.0 - Blueprint Edition
 */

/** Extracted data from blueprint title block */
interface BlueprintExtractedData {
  projectName?: string;
  sheetNumber?: string;
  revision?: string;
  date?: string;
  scale?: string;
  drawnBy?: string;
  confidence?: number;
}

/** Blueprint document metadata */
interface BlueprintData {
  id: string;
  filename: string;
  fileUrl: string;
  pageCount: number;
  currentPage: number;
  extractedData: BlueprintExtractedData;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
}

/** Annotation types supported by the viewer */
type AnnotationType = 'highlight' | 'text' | 'rectangle' | 'arrow' | 'freehand';

/** Annotation coordinates */
interface AnnotationCoordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  points?: Array<{ x: number; y: number }>;
}

/** Single annotation on a blueprint */
interface Annotation {
  id: string;
  type: AnnotationType;
  page: number;
  coordinates: AnnotationCoordinates;
  content?: string;
  color: string;
  strokeWidth?: number;
  fontSize?: number;
  createdAt: string;
}

/** OCR API response structure */
interface OCRResponse {
  success: boolean;
  text?: string;
  blocks?: OCRTextBlock[];
  error?: string;
}

/** OCR text block from Google Vision API */
interface OCRTextBlock {
  text: string;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  confidence: number;
}

/** Blueprint viewer state */
interface ViewerState {
  pdfDoc: any; // PDFDocumentProxy from PDF.js
  currentPage: number;
  totalPages: number;
  zoom: number;
  rotation: number;
  isAnnotating: boolean;
  currentTool: AnnotationType | null;
  annotations: Annotation[];
}

/** Blueprint naming pattern variables */
interface NamingVariables {
  project: string;
  sheet: string;
  rev: string;
  date: string;
  scale: string;
}

/** Blueprint settings stored in chrome.storage */
interface BlueprintSettings {
  googleVisionApiKey?: string;
  autoExtractOnOpen: boolean;
  namingPattern: string;
  autoRenameOnDownload: boolean;
  defaultAnnotationColor: string;
}

/** Message types for blueprint operations */
type BlueprintMessageAction =
  | 'openBlueprintViewer'
  | 'extractBlueprintData'
  | 'saveBlueprintAnnotations'
  | 'getBlueprintAnnotations'
  | 'renameBlueprintFile';

interface BlueprintMessage {
  action: BlueprintMessageAction;
  data?: any;
}

export {
  BlueprintData,
  BlueprintExtractedData,
  Annotation,
  AnnotationType,
  AnnotationCoordinates,
  OCRResponse,
  OCRTextBlock,
  ViewerState,
  NamingVariables,
  BlueprintSettings,
  BlueprintMessage,
  BlueprintMessageAction
};
