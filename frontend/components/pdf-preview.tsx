'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { AppSelect, SelectOption } from './app-select';
import { Icon } from './icons';
export function PdfPreview({ blob }: { blob: Blob }) {
    const [zoom, setZoom] = useState('fit');
    const canvas = useRef<HTMLCanvasElement>(null);
    const [document, setDocument] = useState<PDFDocumentProxy>(),
        [page, setPage] = useState(1),
        [busy, setBusy] = useState(true),
        [error, setError] = useState('');
    useEffect(() => {
        let live = true,
            task: PDFDocumentLoadingTask | undefined;
        setDocument(undefined);
        setPage(1);
        setBusy(true);
        setError('');
        if (blob.size > 5 * 1048576) {
            setError('PDF previews support files up to 5 MiB. Download the original to open it.');
            setBusy(false);
            return;
        }
        const timer = setTimeout(() => {
            if (live) {
                setError('PDF preview timed out. Download the file to open it.');
                setBusy(false);
                void task?.destroy();
            }
        }, 10000);
        void (async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                if (!live) return;
                pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                    'pdfjs-dist/build/pdf.worker.min.mjs',
                    import.meta.url,
                ).toString();
                task = pdfjs.getDocument({
                    data: new Uint8Array(await blob.arrayBuffer()),
                    enableXfa: false,
                    maxImageSize: 16000000,
                    canvasMaxAreaInBytes: 16000000,
                    useSystemFonts: false,
                    verbosity: 0,
                });
                const result = await task.promise;
                if (result.numPages > 200)
                    throw new Error(
                        'Preview supports up to 200 pages. Download the file to open it.',
                    );
                if (live) setDocument(result);
            } catch (error) {
                if (live) {
                    setError(
                        error instanceof Error && error.message.startsWith('Preview supports')
                            ? error.message
                            : 'This PDF cannot be previewed. Download the file to open it.',
                    );
                    setBusy(false);
                    void task?.destroy();
                }
            } finally {
                clearTimeout(timer);
            }
        })();
        return () => {
            live = false;
            clearTimeout(timer);
            void task?.destroy();
        };
    }, [blob]);
    useEffect(() => {
        if (!document || !canvas.current) return;
        let live = true,
            render: RenderTask | undefined;
        setBusy(true);
        setError('');
        const timer = setTimeout(() => {
            if (live) {
                render?.cancel();
                setError('This page took too long to render. Download the PDF to open it.');
                setBusy(false);
            }
        }, 10000);
        void (async () => {
            try {
                const source = await document.getPage(page),
                    original = source.getViewport({ scale: 1 }),
                    viewport = source.getViewport({ scale: Math.min(1.5, 900 / original.width) });
                if (!live || !canvas.current) return;
                if (!Number.isFinite(viewport.height) || viewport.width * viewport.height > 4000000)
                    throw new Error('Page dimensions are too large.');
                canvas.current.width = Math.ceil(viewport.width);
                canvas.current.height = Math.ceil(viewport.height);
                render = source.render({ canvas: canvas.current, viewport, annotationMode: 0 });
                await render.promise;
            } catch {
                if (live) setError('This page cannot be previewed. Download the PDF to open it.');
            } finally {
                clearTimeout(timer);
                if (live) setBusy(false);
            }
        })();
        return () => {
            live = false;
            clearTimeout(timer);
            render?.cancel();
        };
    }, [document, page]);
    return (
        <section className="pdf-preview" aria-label="PDF preview">
            <div className="pdf-preview-toolbar">
                <span>
                    <Icon name="files" size={16} />
                    PDF preview
                </span>
                {document && (
                    <div>
                        <label>
                            <span className="sr-only">PDF zoom</span>
                            <AppSelect
                                value={zoom}
                                onChange={(event) => setZoom(event.target.value)}
                            >
                                <SelectOption value="fit">Fit width</SelectOption>
                                <SelectOption value="actual">100%</SelectOption>
                            </AppSelect>
                        </label>
                        <button
                            type="button"
                            className="button button-small"
                            disabled={page === 1 || busy}
                            aria-label="Previous PDF page"
                            onClick={() => setPage(page - 1)}
                        >
                            ←
                        </button>
                        <span>
                            Page {page} of {document.numPages}
                        </span>
                        <button
                            type="button"
                            className="button button-small"
                            disabled={page === document.numPages || busy}
                            aria-label="Next PDF page"
                            onClick={() => setPage(page + 1)}
                        >
                            →
                        </button>
                    </div>
                )}
            </div>
            {error ? (
                <p className="tool-notice" role="status">
                    {error}
                </p>
            ) : (
                <div className="pdf-canvas-stage" aria-busy={busy}>
                    {busy && (
                        <span className="pdf-loading" role="status">
                            Rendering page…
                        </span>
                    )}
                    <canvas
                        ref={canvas}
                        aria-label={`PDF page ${page}`}
                        style={{
                            visibility: busy ? 'hidden' : 'visible',
                            maxWidth: zoom === 'fit' ? '100%' : 'none',
                        }}
                    />
                </div>
            )}
            <p className="tool-notice">Local page preview · interactive elements are disabled.</p>
        </section>
    );
}
