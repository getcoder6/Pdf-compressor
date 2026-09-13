# PDFShrink — Professional PDF Compressor Starter

## What is included
- Responsive professional UI
- Drag-and-drop upload
- PDF type/size validation
- Three compression presets
- Browser-side processing
- Progress indicator
- Download result
- SEO title/description
- FAQ and basic landing-page content

## Run locally
For best browser compatibility, serve the folder over HTTP instead of opening the HTML with `file://`.

If Python is installed:
    python -m http.server 8000

Then open:
    http://localhost:8000

## Important production note
This implementation uses PDF.js to render pages and jsPDF to rebuild them as JPEG-backed pages. That is useful for a no-backend prototype, but it is NOT equivalent to a full PDF optimizer.

It can remove selectable text, links, forms, bookmarks and some metadata. Some already-optimized PDFs may become larger.

For a commercial/production PDF compression service, replace the browser-only compression function with a proper PDF optimization engine on a server or a carefully licensed WebAssembly PDF optimizer. Add rate limits, file-size limits, abuse protection, privacy controls, monitoring, and secure deletion if files are uploaded.

Also create real Privacy Policy, Terms, Contact and cookie/consent pages as appropriate before monetizing.
