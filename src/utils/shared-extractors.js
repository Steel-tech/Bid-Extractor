// @ts-nocheck
// Shared Extractors for Bid Extractor
// Common extraction functions used by Gmail and Outlook content scripts
// Loaded via manifest.json before gmail.js / outlook.js

(function() {
  'use strict';

  // Prevent double-initialization
  if (window.SharedExtractors) return;

  /**
   * Check if text looks like a greeting rather than a project name
   * @param {string} text
   * @returns {boolean}
   */
  function isGreeting(text) {
    const cleaned = text.replace(/^[:\-\s]+|[:\-\s,]+$/g, '').trim();
    return /^(Hello|Hi|Hey|Dear|Good\s+(morning|afternoon|evening))\b/i.test(cleaned);
  }

  /**
   * Extract project name from subject/body
   * @param {string} subject - Email subject line
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractProjectName(subject, body) {
    const patterns = [
      /(?:RFQ|RFP|ITB|Bid|Quote|Proposal)[:\s-]*(.+?)(?:\s*-|\s*\||$)/i,
      /Project[:\s]+(.+?)(?:\s*-|\s*\||$)/i,
      /(?:RE:|FW:)?\s*(.+?)(?:\s*-\s*(?:RFQ|Bid|Steel))/i,
    ];

    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match?.[1]) {
        const result = cleanText(match[1]);
        if (!isGreeting(result)) return result;
      }
    }

    // Fallback: use subject without common prefixes, but reject greetings
    const fallback = cleanText(subject.replace(/^(RE:|FW:|RFQ|RFP|ITB)[:\s]*/gi, ''));
    if (!isGreeting(fallback) && fallback.length > 3) {
      return fallback;
    }

    // Subject was a greeting — try body for explicit project/job name fields
    const bodyPatterns = [
      /Project(?:\s+Name)?[:\s]+(.+?)(?:\n|$)/i,
      /Job(?:\s+Name)?[:\s]+(.+?)(?:\n|$)/i,
    ];

    for (const pattern of bodyPatterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const result = cleanText(match[1]);
        if (!isGreeting(result) && result.length > 3) return result;
      }
    }

    return 'Untitled Project';
  }

  /**
   * Extract General Contractor name
   * @param {string} senderName - Email sender name
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractGCName(senderName, body) {
    const patterns = [
      /(?:General\s+Contractor|GC|Prime)[:\s]+(.+?)(?:\n|$)/i,
      /(?:From|Sent\s+by)[:\s]+(.+?)(?:\n|$)/i,
      /(.+?)\s+(?:Construction|Builders|Contracting|General)/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const gc = cleanText(match[1]);
        if (gc.length > 3 && gc.length < 100) {
          return gc;
        }
      }
    }

    if (senderName) {
      const companyMatch = senderName.match(/(?:at|@|from)\s+(.+)/i);
      if (companyMatch) {
        return cleanText(companyMatch[1]);
      }

      if (senderName.match(/(?:Construction|Builders|Contracting|Inc|LLC|Corp)/i)) {
        return cleanText(senderName);
      }
    }

    return senderName || 'Unknown';
  }

  /**
   * Extract bid date from email body
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractBidDate(body) {
    const patterns = [
      /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /(?:Bid|Due|Deadline)s?\s+(?:due\s+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
      /by\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s+on\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /(?:Bid|Due|Deadline)[:\s]+(\d{1,2}-\d{1,2}-\d{2,4})/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        return formatDate(match[1]);
      }
    }

    // Try to find any date-like pattern near "bid" or "due"
    const contextMatch = body.match(/(?:bid|due|deadline).{0,50}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
    if (contextMatch) {
      return formatDate(contextMatch[1]);
    }

    return '';
  }

  /**
   * Extract location from email body
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractLocation(body) {
    const patterns = [
      /(?:Location|Site|Address|City)[:\s]+(.+?)(?:\n|$)/i,
      /(?:Project\s+)?(?:Location|Site)[:\s]+(.+?)(?:\n|$)/i,
      /in\s+([A-Z][a-z]+(?:,?\s+[A-Z]{2})?)\s+(?:area|region|metro)/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const location = cleanText(match[1]);
        if (location.length > 3 && location.length < 100) {
          return location;
        }
      }
    }

    // Try to find city, state pattern
    const cityStateMatch = body.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\s+\d{5}/);
    if (cityStateMatch) {
      return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
    }

    return '';
  }

  /**
   * Extract scope of work from email body
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractScope(body) {
    const patterns = [
      /(?:Scope|Work|Package)[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is,
      /(?:Steel|Structural)\s+(?:Package|Scope)[:\s]+(.+?)(?:\n|$)/i,
      /(?:includes?|requiring)[:\s]+(.+?)(?:\n\n|$)/is,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const scope = cleanText(match[1]);
        if (scope.length > 10 && scope.length < 500) {
          return scope.substring(0, 200);
        }
      }
    }

    // Look for steel-specific keywords
    const steelKeywords = ['structural steel', 'misc steel', 'miscellaneous metals',
                           'steel fabrication', 'erection', 'joist', 'deck'];
    for (const keyword of steelKeywords) {
      if (body.toLowerCase().includes(keyword)) {
        return 'Structural Steel / Misc Metals';
      }
    }

    return '';
  }

  /**
   * Extract phone number from email body
   * @param {string} body - Email body text
   * @returns {string}
   */
  function extractPhone(body) {
    if (!body || typeof body !== 'string') return '';
    const phoneMatch = body.match(/(?:Phone|Tel|Cell|Mobile|Direct)?[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
    return phoneMatch?.[1] || '';
  }

  /**
   * Extract email from text
   * @param {string} text
   * @returns {string}
   */
  function extractEmailFromText(text) {
    if (!text || typeof text !== 'string') return '';
    const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    return match?.[1] || '';
  }

  /**
   * Get file type from filename
   * @param {string} filename
   * @returns {string}
   */
  function getFileType(filename) {
    if (!filename || typeof filename !== 'string') return 'file';
    const ext = filename.split('.').pop()?.toLowerCase();
    const types = {
      pdf: 'document',
      dwg: 'drawing',
      dxf: 'drawing',
      xlsx: 'spreadsheet',
      xls: 'spreadsheet',
      doc: 'document',
      docx: 'document',
      zip: 'archive'
    };
    return types[ext] || 'file';
  }

  /**
   * Extract download links from bid portals and file sharing services
   * @param {Element} emailBody - DOM element containing email body
   * @param {Object|null} platformsConfig - Platforms config from ConfigLoader
   * @returns {Array} Array of download link objects
   */
  function extractDownloadLinks(emailBody, platformsConfig) {
    const links = [];
    const allLinks = emailBody.querySelectorAll('a[href]');

    // Use platforms from config or fallback to defaults
    const platforms = platformsConfig || {
      'buildingconnected.com': { name: 'BuildingConnected', icon: '🏗️' },
      'planhub.com': { name: 'PlanHub', icon: '📐' },
      'isqft.com': { name: 'iSqFt', icon: '📊' },
      'procore.com': { name: 'Procore', icon: '🔷' },
      'smartbidnet.com': { name: 'SmartBid', icon: '💡' },
      'construction.com': { name: 'Dodge/Construction', icon: '🔶' },
      'constructconnect.com': { name: 'ConstructConnect', icon: '🔗' },
      'plangrid.com': { name: 'PlanGrid', icon: '📱' },
      'bluebeam.com': { name: 'Bluebeam', icon: '🔵' },
      'pipelinesuite.com': { name: 'Pipeline Suite', icon: '🔧' },
      'e-builder.net': { name: 'e-Builder', icon: '🏢' },
      'dropbox.com': { name: 'Dropbox', icon: '📦' },
      'box.com': { name: 'Box', icon: '📁' },
      'drive.google.com': { name: 'Google Drive', icon: '🔷' },
      'docs.google.com': { name: 'Google Docs', icon: '📄' },
      'onedrive.live.com': { name: 'OneDrive', icon: '☁️' },
      'sharepoint.com': { name: 'SharePoint', icon: '📂' },
      '1drv.ms': { name: 'OneDrive', icon: '☁️' },
      'sharefile.com': { name: 'ShareFile', icon: '📤' },
      'wetransfer.com': { name: 'WeTransfer', icon: '📨' },
      'we.tl': { name: 'WeTransfer', icon: '📨' },
      'hightail.com': { name: 'Hightail', icon: '✈️' },
      'egnyte.com': { name: 'Egnyte', icon: '📊' },
      'planswift.com': { name: 'PlanSwift', icon: '📏' },
      'onscreentakeoff.com': { name: 'On-Screen Takeoff', icon: '📐' },
      'bluebeamcloud.com': { name: 'Bluebeam Cloud', icon: '🔵' },
      'amazonaws.com': { name: 'AWS Download', icon: '☁️' },
      'blob.core.windows.net': { name: 'Azure Storage', icon: '☁️' },
    };

    const seenUrls = new Set();

    allLinks.forEach(link => {
      const href = link.href?.toLowerCase() || '';
      const text = link.innerText?.trim() || '';

      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

      // Check if link matches any platform
      for (const [domain, info] of Object.entries(platforms)) {
        if (href.includes(domain)) {
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          links.push({
            url: link.href,
            platform: info.name,
            icon: info.icon,
            text: text || info.name,
            type: 'platform'
          });
          return;
        }
      }

      // Check for direct file downloads
      const fileExtensions = ['.pdf', '.dwg', '.dxf', '.zip', '.rar', '.xlsx', '.xls', '.doc', '.docx'];
      for (const ext of fileExtensions) {
        if (href.includes(ext)) {
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          links.push({
            url: link.href,
            platform: 'Direct Download',
            icon: '📥',
            text: text || `Download ${ext.toUpperCase()}`,
            type: 'file',
            extension: ext
          });
          return;
        }
      }

      // Check for links with download-related text
      const downloadKeywords = ['download', 'view plans', 'view drawings', 'access documents',
                                'bid documents', 'project documents', 'click here to view',
                                'specifications', 'addendum', 'plans and specs'];
      const textLower = text.toLowerCase();

      for (const keyword of downloadKeywords) {
        if (textLower.includes(keyword)) {
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          links.push({
            url: link.href,
            platform: 'Document Link',
            icon: '📄',
            text: text,
            type: 'document'
          });
          return;
        }
      }
    });

    return links;
  }

  /**
   * Clean text by normalizing whitespace and removing leading/trailing junk
   * @param {string} text
   * @returns {string}
   */
  function cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/^[:\-\s]+|[:\-\s]+$/g, '');
  }

  /**
   * Format a date string to locale format
   * @param {string} dateStr
   * @returns {string}
   */
  function formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Debounce a function
   * @param {Function} fn - Function to debounce
   * @param {number} delay - Delay in ms
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    };
  }

  // Export to window
  window.SharedExtractors = {
    isGreeting,
    extractProjectName,
    extractGCName,
    extractBidDate,
    extractLocation,
    extractScope,
    extractPhone,
    extractEmailFromText,
    getFileType,
    extractDownloadLinks,
    cleanText,
    formatDate,
    debounce
  };

})();
