// @ts-nocheck
/**
 * Steel Takeoff Manager
 * Bid Extractor v1.5.0 - Steel Takeoff Edition
 *
 * Manages steel member extraction, tracking, and export
 */

const TakeoffManager = (() => {
  // State
  let takeoffItems = [];
  let isActive = false;
  let drawingScale = null; // e.g., "1/4" = 1'-0"" means 0.25" = 12"
  let scaleFactor = 48; // Default: 1/4" = 1'-0" (multiply drawing inches by 48)
  let projectInfo = {
    name: '',
    number: '',
    date: new Date().toISOString().split('T')[0]
  };

  // DOM elements (set during init)
  let elements = {};

  // Current file identifier for storage
  let currentFileId = 'default';

  /**
   * Initialize the takeoff manager
   * @param {string} filename - Optional filename for loading saved data
   */
  async function init(filename) {
    if (filename) {
      currentFileId = await hashFilename(filename);
    }

    elements = {
      panel: document.getElementById('takeoff-panel'),
      itemsTable: document.getElementById('takeoff-items'),
      totalWeight: document.getElementById('total-weight'),
      totalPieces: document.getElementById('total-pieces'),
      scaleInput: document.getElementById('scale-input'),
      memberInput: document.getElementById('member-input'),
      lengthInput: document.getElementById('length-input'),
      qtyInput: document.getElementById('qty-input'),
      addBtn: document.getElementById('add-member-btn'),
      exportBtn: document.getElementById('export-takeoff'),
      clearBtn: document.getElementById('clear-takeoff'),
      toggleBtn: document.getElementById('toggle-takeoff')
    };

    // Set up event listeners (only if elements exist)
    setupEventListeners();

    // Load saved takeoff for this file
    await loadTakeoff();
  }

  /**
   * Hash filename for storage key
   */
  async function hashFilename(filename) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(filename);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch {
      return filename.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 32);
    }
  }

  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Toggle panel
    elements.toggleBtn?.addEventListener('click', togglePanel);

    // Add member button
    elements.addBtn?.addEventListener('click', addMemberFromInput);

    // Enter key in inputs
    elements.memberInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addMemberFromInput();
    });

    // Scale input change
    elements.scaleInput?.addEventListener('change', updateScale);

    // Export button
    elements.exportBtn?.addEventListener('click', exportToCSV);

    // Clear button
    elements.clearBtn?.addEventListener('click', clearTakeoff);

    // Member input autocomplete
    elements.memberInput?.addEventListener('input', showSuggestions);
  }

  /**
   * Toggle the takeoff panel visibility
   */
  function togglePanel() {
    isActive = !isActive;
    elements.panel?.classList.toggle('hidden', !isActive);
    elements.toggleBtn?.classList.toggle('active', isActive);

    if (isActive) {
      elements.memberInput?.focus();
    }
  }

  /**
   * Show the takeoff panel
   */
  function show() {
    isActive = true;
    elements.panel?.classList.remove('hidden');
    elements.toggleBtn?.classList.add('active');
  }

  /**
   * Hide the takeoff panel
   */
  function hide() {
    isActive = false;
    elements.panel?.classList.add('hidden');
    elements.toggleBtn?.classList.remove('active');
  }

  /**
   * Update the drawing scale
   */
  function updateScale() {
    const scaleValue = elements.scaleInput?.value || '1/4';

    // Parse common architectural scales
    const scales = {
      '1/8': 96,    // 1/8" = 1'-0"
      '3/16': 64,   // 3/16" = 1'-0"
      '1/4': 48,    // 1/4" = 1'-0"
      '3/8': 32,    // 3/8" = 1'-0"
      '1/2': 24,    // 1/2" = 1'-0"
      '3/4': 16,    // 3/4" = 1'-0"
      '1': 12,      // 1" = 1'-0"
      '1-1/2': 8,   // 1-1/2" = 1'-0"
      '3': 4        // 3" = 1'-0"
    };

    scaleFactor = scales[scaleValue] || 48;
    drawingScale = scaleValue;
  }

  /**
   * Add member from input fields
   */
  function addMemberFromInput() {
    const memberStr = elements.memberInput?.value?.trim();
    const lengthStr = elements.lengthInput?.value?.trim();
    const qtyStr = elements.qtyInput?.value?.trim() || '1';

    if (!memberStr) {
      showToast('Enter a member size (e.g., W12X26)', 'warning');
      return;
    }

    // Parse the member
    const parsed = SteelDatabase.parseMember(memberStr);

    if (!parsed.valid) {
      showToast(`Unknown member: ${memberStr}. Try W12X26, HSS6X6X1/4, etc.`, 'error');
      return;
    }

    // Parse length (support feet-inches format)
    let lengthFt = parseLength(lengthStr) || 0;
    let qty = parseInt(qtyStr) || 1;

    // Add the item
    addItem({
      member: parsed.size,
      type: parsed.type,
      weight: parsed.weight,
      length: lengthFt,
      quantity: qty
    });

    // Clear inputs
    elements.memberInput.value = '';
    elements.lengthInput.value = '';
    elements.qtyInput.value = '1';
    elements.memberInput.focus();

    showToast(`Added ${qty}x ${parsed.size}`, 'success');
  }

  /**
   * Parse length string to feet (decimal)
   * Supports: "10", "10'", "10'-6"", "10' 6"", "10.5", "126" (inches)
   */
  function parseLength(str) {
    if (!str) return 0;

    str = str.trim();

    // Already decimal feet (e.g., "10.5")
    if (/^\d+\.?\d*$/.test(str)) {
      const num = parseFloat(str);
      // If > 50, assume inches
      return num > 50 ? num / 12 : num;
    }

    // Feet only (e.g., "10'")
    const feetOnly = str.match(/^(\d+\.?\d*)['\s]*$/);
    if (feetOnly) {
      return parseFloat(feetOnly[1]);
    }

    // Feet and inches (e.g., "10'-6"" or "10' 6"" or "10-6")
    const feetInches = str.match(/^(\d+)['\-\s]+(\d+\.?\d*)["\s]*$/);
    if (feetInches) {
      return parseFloat(feetInches[1]) + parseFloat(feetInches[2]) / 12;
    }

    // Inches only (e.g., "126"")
    const inchesOnly = str.match(/^(\d+\.?\d*)["\s]*$/);
    if (inchesOnly) {
      return parseFloat(inchesOnly[1]) / 12;
    }

    return parseFloat(str) || 0;
  }

  /**
   * Add an item to the takeoff
   * Supports both detailed and simple input formats
   */
  function addItem(item) {
    const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    // Parse member to get weight if not provided
    let weightPerFt = item.weight || 0;
    let memberType = item.type || 'UNKNOWN';

    if (typeof SteelDatabase !== 'undefined' && !item.weight) {
      const parsed = SteelDatabase.parseMember(item.member);
      if (parsed.valid) {
        weightPerFt = parsed.weight;
        memberType = parsed.type;
      }
    }

    // Parse length if provided as string (e.g., "10'-6"")
    let lengthFt = 0;
    if (typeof item.length === 'string') {
      lengthFt = parseLength(item.length);
    } else if (typeof item.length === 'number') {
      lengthFt = item.length;
    }

    const newItem = {
      id,
      member: item.member,
      type: memberType,
      weightPerFt: weightPerFt,
      length: lengthFt,
      lengthDisplay: formatLength(lengthFt),
      quantity: item.quantity || 1,
      totalLength: lengthFt * (item.quantity || 1),
      totalWeight: weightPerFt * lengthFt * (item.quantity || 1),
      mark: item.mark || '',
      notes: item.notes || '',
      page: item.page || 1,
      addedAt: new Date().toISOString()
    };

    takeoffItems.push(newItem);
    renderTable();
    saveTakeoff();

    return { success: true, item: newItem };
  }

  /**
   * Remove an item from the takeoff
   */
  function removeItem(id) {
    takeoffItems = takeoffItems.filter(item => item.id !== id);
    renderTable();
    saveTakeoff();
  }

  /**
   * Update an item's quantity or length
   */
  function updateItem(id, updates) {
    const item = takeoffItems.find(i => i.id === id);
    if (!item) return;

    if (updates.quantity !== undefined) {
      item.quantity = updates.quantity;
    }
    if (updates.length !== undefined) {
      item.length = updates.length;
    }
    if (updates.notes !== undefined) {
      item.notes = updates.notes;
    }

    // Recalculate totals
    item.totalLength = item.length * item.quantity;
    item.totalWeight = item.weightPerFt * item.length * item.quantity;

    renderTable();
    saveTakeoff();
  }

  /**
   * Render the takeoff table
   */
  function renderTable() {
    if (!elements.itemsTable) return;

    if (takeoffItems.length === 0) {
      elements.itemsTable.innerHTML = `
        <tr class="empty-row">
          <td colspan="6">No items yet. Add members above or select on drawing.</td>
        </tr>
      `;
      updateTotals();
      return;
    }

    // Group by member type for cleaner display
    const grouped = {};
    takeoffItems.forEach(item => {
      const key = item.member;
      if (!grouped[key]) {
        grouped[key] = {
          member: item.member,
          type: item.type,
          weightPerFt: item.weightPerFt,
          items: []
        };
      }
      grouped[key].items.push(item);
    });

    let html = '';

    for (const [member, group] of Object.entries(grouped)) {
      const totalQty = group.items.reduce((sum, i) => sum + i.quantity, 0);
      const totalLen = group.items.reduce((sum, i) => sum + i.totalLength, 0);
      const totalWt = group.items.reduce((sum, i) => sum + i.totalWeight, 0);

      // If multiple entries for same member, show grouped
      if (group.items.length > 1) {
        html += `
          <tr class="group-header" data-member="${member}">
            <td><strong>${member}</strong></td>
            <td class="type-col">${group.type}</td>
            <td class="num-col">${totalQty}</td>
            <td class="num-col">${formatLength(totalLen)}</td>
            <td class="num-col">${group.weightPerFt}</td>
            <td class="num-col weight-col">${formatWeight(totalWt)}</td>
          </tr>
        `;

        group.items.forEach(item => {
          html += `
            <tr class="group-item" data-id="${item.id}">
              <td class="indent">└ ${item.notes || 'Item'}</td>
              <td></td>
              <td class="num-col">
                <input type="number" class="qty-edit" value="${item.quantity}" min="1" data-id="${item.id}">
              </td>
              <td class="num-col">
                <input type="text" class="len-edit" value="${formatLength(item.length)}" data-id="${item.id}">
              </td>
              <td></td>
              <td class="num-col">
                <button class="btn-remove" data-id="${item.id}" title="Remove">&times;</button>
              </td>
            </tr>
          `;
        });
      } else {
        // Single entry
        const item = group.items[0];
        html += `
          <tr data-id="${item.id}">
            <td><strong>${member}</strong></td>
            <td class="type-col">${group.type}</td>
            <td class="num-col">
              <input type="number" class="qty-edit" value="${item.quantity}" min="1" data-id="${item.id}">
            </td>
            <td class="num-col">
              <input type="text" class="len-edit" value="${formatLength(item.length)}" data-id="${item.id}">
            </td>
            <td class="num-col">${group.weightPerFt}</td>
            <td class="num-col weight-col">
              ${formatWeight(item.totalWeight)}
              <button class="btn-remove" data-id="${item.id}" title="Remove">&times;</button>
            </td>
          </tr>
        `;
      }
    }

    elements.itemsTable.innerHTML = html;

    // Add event listeners to editable fields
    elements.itemsTable.querySelectorAll('.qty-edit').forEach(input => {
      input.addEventListener('change', (e) => {
        updateItem(e.target.dataset.id, { quantity: parseInt(e.target.value) || 1 });
      });
    });

    elements.itemsTable.querySelectorAll('.len-edit').forEach(input => {
      input.addEventListener('change', (e) => {
        updateItem(e.target.dataset.id, { length: parseLength(e.target.value) });
      });
    });

    elements.itemsTable.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        removeItem(e.target.dataset.id);
      });
    });

    updateTotals();
  }

  /**
   * Update the totals display
   */
  function updateTotals() {
    const totalPcs = takeoffItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalWt = takeoffItems.reduce((sum, i) => sum + i.totalWeight, 0);

    if (elements.totalPieces) {
      elements.totalPieces.textContent = totalPcs;
    }
    if (elements.totalWeight) {
      elements.totalWeight.textContent = formatWeight(totalWt);
    }
  }

  /**
   * Format length as feet-inches
   */
  function formatLength(feet) {
    if (!feet) return '0\'-0"';

    const wholeFeet = Math.floor(feet);
    const inches = Math.round((feet - wholeFeet) * 12);

    if (inches === 12) {
      return `${wholeFeet + 1}'-0"`;
    }

    return `${wholeFeet}'-${inches}"`;
  }

  /**
   * Format weight with commas
   */
  function formatWeight(lbs) {
    if (!lbs) return '0';
    return Math.round(lbs).toLocaleString() + ' lbs';
  }

  /**
   * Show autocomplete suggestions
   */
  function showSuggestions(e) {
    const input = e.target.value.trim();
    if (input.length < 2) {
      hideSuggestions();
      return;
    }

    const results = SteelDatabase.searchShapes(input);
    if (results.length === 0) {
      hideSuggestions();
      return;
    }

    let suggestionsEl = document.getElementById('member-suggestions');
    if (!suggestionsEl) {
      suggestionsEl = document.createElement('div');
      suggestionsEl.id = 'member-suggestions';
      suggestionsEl.className = 'suggestions-dropdown';
      elements.memberInput.parentNode.appendChild(suggestionsEl);
    }

    suggestionsEl.innerHTML = results.map(r => `
      <div class="suggestion-item" data-shape="${r.shape}">
        <span class="shape-name">${r.shape}</span>
        <span class="shape-weight">${r.weight} lbs/ft</span>
      </div>
    `).join('');

    suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        elements.memberInput.value = item.dataset.shape;
        hideSuggestions();
        elements.lengthInput.focus();
      });
    });
  }

  function hideSuggestions() {
    const suggestionsEl = document.getElementById('member-suggestions');
    if (suggestionsEl) {
      suggestionsEl.remove();
    }
  }

  /**
   * Clear all takeoff items
   */
  function clearTakeoff() {
    if (takeoffItems.length === 0) return;

    if (confirm('Clear all takeoff items? This cannot be undone.')) {
      takeoffItems = [];
      renderTable();
      saveTakeoff();
      showToast('Takeoff cleared', 'info');
    }
  }

  /**
   * Export takeoff to CSV
   */
  function exportToCSV() {
    if (takeoffItems.length === 0) {
      showToast('No items to export', 'warning');
      return;
    }

    // Build CSV content
    const headers = ['Member', 'Type', 'Qty', 'Length (ft)', 'Weight/ft (lbs)', 'Total Weight (lbs)', 'Notes'];

    let csv = headers.join(',') + '\n';

    // Group by member for summary
    const grouped = {};
    takeoffItems.forEach(item => {
      if (!grouped[item.member]) {
        grouped[item.member] = {
          type: item.type,
          weightPerFt: item.weightPerFt,
          qty: 0,
          totalLength: 0,
          totalWeight: 0
        };
      }
      grouped[item.member].qty += item.quantity;
      grouped[item.member].totalLength += item.totalLength;
      grouped[item.member].totalWeight += item.totalWeight;
    });

    for (const [member, data] of Object.entries(grouped)) {
      csv += [
        `"${member}"`,
        data.type,
        data.qty,
        data.totalLength.toFixed(2),
        data.weightPerFt,
        Math.round(data.totalWeight),
        ''
      ].join(',') + '\n';
    }

    // Add totals row
    const totalPcs = takeoffItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalWt = takeoffItems.reduce((sum, i) => sum + i.totalWeight, 0);
    const totalLen = takeoffItems.reduce((sum, i) => sum + i.totalLength, 0);

    csv += '\n';
    csv += `"TOTALS",,"${totalPcs}","${totalLen.toFixed(2)}",,"${Math.round(totalWt)}",\n`;
    csv += `"TOTAL TONS",,,,,"${(totalWt / 2000).toFixed(2)} tons",\n`;

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const filename = `steel_takeoff_${projectInfo.name || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${Object.keys(grouped).length} items to CSV`, 'success');
  }

  /**
   * Save takeoff to chrome storage
   */
  async function saveTakeoff() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const key = `takeoff_${currentFileId}`;

    await chrome.storage.local.set({
      [key]: {
        items: takeoffItems,
        scale: drawingScale,
        projectInfo,
        savedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Load takeoff from chrome storage
   */
  async function loadTakeoff() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const key = `takeoff_${currentFileId}`;

    const data = await chrome.storage.local.get(key);
    if (data[key]) {
      takeoffItems = data[key].items || [];
      drawingScale = data[key].scale;
      projectInfo = data[key].projectInfo || projectInfo;

      if (elements.scaleInput && drawingScale) {
        elements.scaleInput.value = drawingScale;
        updateScale();
      }

      renderTable();
    }
  }

  /**
   * Set project info
   */
  function setProjectInfo(info) {
    projectInfo = { ...projectInfo, ...info };
    saveTakeoff();
  }

  /**
   * Get all takeoff items
   */
  function getItems() {
    return takeoffItems;
  }

  /**
   * Get takeoff summary
   */
  function getSummary() {
    const totalPcs = takeoffItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalWt = takeoffItems.reduce((sum, i) => sum + i.totalWeight, 0);
    const totalLen = takeoffItems.reduce((sum, i) => sum + i.totalLength, 0);

    return {
      itemCount: takeoffItems.length,
      totalItems: totalPcs,
      totalPieces: totalPcs,
      totalWeight: totalWt,
      totalTons: totalWt / 2000,
      totalLength: totalLen,
      totalLengthFeet: totalLen,
      byType: getByType()
    };
  }

  /**
   * Clear all takeoff items (without confirmation)
   */
  function clearAll() {
    takeoffItems = [];
    renderTable();
    saveTakeoff();
  }

  /**
   * Get items grouped by type
   */
  function getByType() {
    const byType = {};
    takeoffItems.forEach(item => {
      if (!byType[item.type]) {
        byType[item.type] = { pieces: 0, weight: 0, length: 0 };
      }
      byType[item.type].pieces += item.quantity;
      byType[item.type].weight += item.totalWeight;
      byType[item.type].length += item.totalLength;
    });
    return byType;
  }

  // Toast helper (use viewer's if available)
  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  // Public API
  return {
    init,
    show,
    hide,
    togglePanel,
    addItem,
    removeItem,
    updateItem,
    clearTakeoff,
    clearAll,
    exportToCSV,
    getItems,
    getSummary,
    setProjectInfo,
    parseLength,
    formatLength,
    formatWeight
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.TakeoffManager = TakeoffManager;
}
