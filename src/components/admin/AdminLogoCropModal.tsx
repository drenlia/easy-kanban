import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, {
  centerCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import { useTranslation } from 'react-i18next';
import { useEscapeDismiss } from '../../hooks/useEscapeDismiss';
import { getCroppedImageFile } from '../../utils/cropImage';
import 'react-image-crop/dist/ReactCrop.css';

export type AdminLogoCropModalProps = {
  isOpen: boolean;
  imageSrc: string;
  /** Suggested output filename (e.g. site-logo.png) */
  fileName?: string;
  title: string;
  onCancel: () => void;
  /** Return false (or throw) to keep the modal open after a failed save. */
  onApply: (file: File) => boolean | void | Promise<boolean | void>;
};

const AdminLogoCropModal: React.FC<AdminLogoCropModalProps> = ({
  isOpen,
  imageSrc,
  fileName = 'site-logo.png',
  title,
  onCancel,
  onApply,
}) => {
  const { t } = useTranslation('admin');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outsideReady, setOutsideReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCrop(undefined);
    setCompletedCrop(null);
    setBusy(false);
    setError(null);
    setOutsideReady(false);
    // Avoid the opening click immediately closing the dialog
    const timer = window.setTimeout(() => setOutsideReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, imageSrc]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  useEscapeDismiss(handleCancel, { enabled: isOpen, disabled: busy });

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Start with a generous selection so admins can drag edges inward to trim padding.
    const initial = centerCrop(
      {
        unit: '%',
        width: 90,
        height: 90,
      },
      width,
      height
    );
    setCrop(initial);
  };

  const handleApply = async () => {
    const image = imgRef.current;
    if (!image || !completedCrop?.width || !completedCrop?.height || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await getCroppedImageFile(image, completedCrop, fileName);
      const ok = await onApply(file);
      if (ok === false) {
        setBusy(false);
      }
    } catch (err) {
      console.error('Logo crop failed:', err);
      setError(t('siteSettings.logoCropFailed'));
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (outsideReady) handleCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-logo-crop-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2
            id="admin-logo-crop-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('siteSettings.logoCropHint')}
          </p>
        </div>

        <div className="max-h-[min(55vh,420px)] overflow-auto bg-gray-900 p-3">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
            keepSelection
            ruleOfThirds
            minWidth={8}
            minHeight={8}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt=""
              onLoad={onImageLoad}
              className="max-h-[min(50vh,380px)] max-w-full"
              // Same-origin /avatars use the media cookie; helps canvas export when CORS allows.
              crossOrigin={
                imageSrc.startsWith('blob:') || imageSrc.startsWith('data:')
                  ? undefined
                  : 'anonymous'
              }
            />
          </ReactCrop>
        </div>

        <div className="space-y-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
            >
              {t('siteSettings.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={busy || !completedCrop?.width || !completedCrop?.height}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('siteSettings.uploading') : t('siteSettings.logoCropApply')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminLogoCropModal;
