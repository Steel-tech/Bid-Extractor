# PDF.js Library Setup

The Blueprint Viewer requires Mozilla's PDF.js library to render PDF documents.

## Installation Steps

1. **Download PDF.js** from the official Mozilla repository:
   - Visit: https://mozilla.github.io/pdf.js/getting_started/#download
   - Download the **prebuilt** version (stable release)

2. **Extract the files** and copy these two files to this directory (`src/lib/`):
   - `pdf.min.js` (or `pdf.js`)
   - `pdf.worker.min.js` (or `pdf.worker.js`)

3. **Verify the files are in place**:
   ```
   src/lib/
   ├── pdf.min.js
   ├── pdf.worker.min.js
   └── README.md (this file)
   ```

## Quick Download (via CDN for testing)

For quick testing, you can download directly from cdnjs:

```bash
# From the extension root directory:
curl -o src/lib/pdf.min.js https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs
curl -o src/lib/pdf.worker.min.js https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs
```

Or download manually from:
- https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs
- https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs

## Version Compatibility

The Blueprint Viewer is tested with PDF.js version 4.x. If you use a different version, you may need to adjust the API calls in `viewer.js`.

## License

PDF.js is licensed under the Apache License 2.0.
See: https://github.com/nicknisi/pdf.js/blob/master/LICENSE

## Troubleshooting

If the Blueprint Viewer shows "PDF.js library not loaded":
1. Ensure `pdf.min.js` exists in `src/lib/`
2. Ensure `pdf.worker.min.js` exists in `src/lib/`
3. Reload the extension in Chrome (chrome://extensions)
4. Check the browser console for any loading errors
