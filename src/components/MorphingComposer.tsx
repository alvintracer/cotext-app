import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Camera, Plus, X, Type } from 'lucide-react';
import { getPlatformServices } from '../lib/platform/index';
import { isImageFile, compressImage, formatFileSize } from '../lib/image/compress';
import { recognizeText } from '../lib/ocr';
import { motion, AnimatePresence } from 'framer-motion';

interface MorphingComposerProps {
  onSend: (message: string, files?: File[]) => void;
}

export default function MorphingComposer({ onSend }: MorphingComposerProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [filePreview, setFilePreview] = useState<Array<{ name: string; size: string; preview?: string; isImage?: boolean }>>([]);
  const [compressing, setCompressing] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [ocrState, setOcrState] = useState<{ running: boolean; index: number; progress: number }>({
    running: false, index: -1, progress: 0,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const platform = getPlatformServices();

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 200;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  }, [text]);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  // Handle file selection
  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    setCompressing(true);
    const processed: File[] = [];
    const previews: Array<{ name: string; size: string; preview?: string; isImage?: boolean }> = [];

    for (const file of selectedFiles) {
      if (isImageFile(file)) {
        try {
          const result = await compressImage(file);
          processed.push(result.file);
          const previewUrl = URL.createObjectURL(result.file);
          previews.push({
            name: result.file.name,
            size: result.wasCompressed
              ? `${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)}`
              : formatFileSize(result.compressedSize),
            preview: previewUrl,
            isImage: true,
          });
        } catch (err) {
          console.error('Compression failed:', err);
          previews.push({
            name: file.name,
            size: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      } else {
        processed.push(file);
        previews.push({ name: file.name, size: formatFileSize(file.size) });
      }
    }

    setFiles((prev) => [...prev, ...processed]);
    setFilePreview((prev) => [...prev, ...previews]);
    setCompressing(false);
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleFileSelect(imageFiles);
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) await handleFileSelect(droppedFiles);
  }, [handleFileSelect]);

  const handleSend = useCallback(() => {
    if (!text.trim() && files.length === 0) return;
    onSend(text.trim(), files.length > 0 ? files : undefined);
    setText('');
    setFiles([]);
    setFilePreview([]);
    filePreview.forEach((fp) => { if (fp.preview) URL.revokeObjectURL(fp.preview); });
  }, [text, files, onSend, filePreview]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreview((prev) => {
      const fp = prev[index];
      if (fp?.preview) URL.revokeObjectURL(fp.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // OCR: extract text from image
  const handleOcr = useCallback(async (index: number) => {
    const file = files[index];
    if (!file || ocrState.running) return;

    setOcrState({ running: true, index, progress: 0 });

    try {
      const extractedText = await recognizeText(file, (progress) => {
        setOcrState((prev) => ({ ...prev, progress }));
      });

      if (extractedText.trim()) {
        setText((prev) => {
          const separator = prev.trim() ? '\n\n' : '';
          return prev + separator + extractedText;
        });
      }
    } catch (err) {
      console.error('OCR failed:', err);
    } finally {
      setOcrState({ running: false, index: -1, progress: 0 });
    }
  }, [files, ocrState.running]);

  return (
    <motion.div
      className="morphing-composer"
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 30, duration: 0.25 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* File previews */}
      <AnimatePresence>
        {filePreview.length > 0 && (
          <motion.div
            className="composer-files"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {filePreview.map((fp, i) => (
              <div key={i} className="file-preview-item">
                {fp.preview && <img src={fp.preview} alt={fp.name} className="file-preview-thumb" />}
                <div className="file-preview-info">
                  <span className="file-preview-name">{fp.name}</span>
                  <span className="file-preview-size">{fp.size}</span>
                </div>
                <div className="file-preview-actions">
                  {/* OCR button — only for images */}
                  {fp.isImage && (
                    <button
                      className={`ocr-button ${ocrState.running && ocrState.index === i ? 'ocr-running' : ''}`}
                      onClick={() => handleOcr(i)}
                      disabled={ocrState.running}
                      title="텍스트 추출 (OCR)"
                    >
                      {ocrState.running && ocrState.index === i ? (
                        <>
                          <div className="ocr-progress-ring">
                            <svg viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" />
                              <circle
                                cx="12" cy="12" r="10"
                                strokeDasharray={`${ocrState.progress * 0.628} 62.8`}
                              />
                            </svg>
                          </div>
                          <span>{ocrState.progress}%</span>
                        </>
                      ) : (
                        <>
                          <Type size={12} />
                          <span>텍스트 추출</span>
                        </>
                      )}
                    </button>
                  )}
                  <button className="file-preview-remove" onClick={() => removeFile(i)}>×</button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="composer-input-area">
        {/* Desktop: inline tool buttons */}
        <div className="composer-tools composer-desktop-only">
          <button
            className="icon-button"
            onClick={async () => {
              const f = await platform.pickFile();
              if (f.length > 0) handleFileSelect(f);
            }}
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>
          <button
            className="icon-button"
            onClick={async () => {
              try { const photo = await platform.takePhoto(); handleFileSelect([photo]); } catch {}
            }}
            title="Take photo"
          >
            <Camera size={16} />
          </button>
        </div>

        {/* Input wrapper — on mobile, + button sits inside */}
        <div className="composer-input-wrapper">
          {/* Mobile: + button inside input */}
          <div className="composer-attach-wrapper composer-mobile-only" ref={attachMenuRef}>
            <button
              className="composer-inline-plus"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              aria-label="Attach"
            >
              {showAttachMenu ? <X size={18} /> : <Plus size={18} />}
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  className="attach-popup"
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className="attach-popup-item"
                    onClick={async () => {
                      setShowAttachMenu(false);
                      const f = await platform.pickFile();
                      if (f.length > 0) handleFileSelect(f);
                    }}
                  >
                    <Paperclip size={14} />
                    <span>파일 첨부</span>
                  </button>
                  <button
                    className="attach-popup-item"
                    onClick={async () => {
                      setShowAttachMenu(false);
                      try { const photo = await platform.takePhoto(); handleFileSelect([photo]); } catch {}
                    }}
                  >
                    <Camera size={14} />
                    <span>사진 촬영</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="메모 입력… (Enter: 전송)"
            rows={1}
          />
        </div>

        {/* Desktop: send button */}
        <div className="composer-actions composer-desktop-only">
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!text.trim() && files.length === 0}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {compressing && (
        <div className="composer-compressing">
          <div className="spinner-sm" />
          <span>Compressing image...</span>
        </div>
      )}
    </motion.div>
  );
}
