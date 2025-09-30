import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { ExportSettings } from '../components/editor/ExportModal';

/**
 * Custom hook to manage the entire video export process.
 * It encapsulates state management, IPC listeners, and handler functions
 * related to exporting, cleaning up the EditorPage component.
 */
export const useExportProcess = () => {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: boolean; outputPath?: string; error?: string } | null>(null);

  // Effect to set up and tear down IPC listeners for export progress and completion
  useEffect(() => {
    const cleanProgressListener = window.electronAPI.onExportProgress(({ progress }) => {
      setProgress(progress);
    });

    const cleanCompleteListener = window.electronAPI.onExportComplete(({ success, outputPath, error }) => {
      setIsExporting(false);
      setProgress(100);
      setResult({ success, outputPath, error });
    });

    return () => {
      cleanProgressListener();
      cleanCompleteListener();
    };
  }, []);

  // Handler to initiate the export process
  const handleStartExport = useCallback(async (settings: ExportSettings, outputPath: string) => {
    const fullState = useEditorStore.getState();
    const plainState = {
      videoPath: fullState.videoPath,
      metadata: fullState.metadata,
      videoDimensions: fullState.videoDimensions,
      duration: fullState.duration,
      frameStyles: fullState.frameStyles,
      aspectRatio: fullState.aspectRatio,
      zoomRegions: fullState.zoomRegions,
      cutRegions: fullState.cutRegions,
      webcamVideoPath: fullState.webcamVideoPath,
      webcamPosition: fullState.webcamPosition,
      webcamStyles: fullState.webcamStyles,
      isWebcamVisible: fullState.isWebcamVisible,
    };

    setResult(null);
    setIsExporting(true);
    setProgress(0);

    try {
      await window.electronAPI.startExport({
        projectState: plainState,
        exportSettings: settings,
        outputPath: outputPath,
      });
    } catch (e) {
      console.error("Export invocation failed", e);
      setResult({ success: false, error: `An error occurred while starting the export: ${e}` });
      setIsExporting(false);
    }
  }, []);

  // Handler to cancel an ongoing export
  const handleCancelExport = () => {
    window.electronAPI.cancelExport();
  };

  // Handler to close the modal and reset its state
  const handleCloseModal = () => {
    if (result) {
      setResult(null);
    }
    setModalOpen(false);
  };

  return {
    isModalOpen,
    isExporting,
    progress,
    result,
    openExportModal: () => setModalOpen(true),
    closeExportModal: handleCloseModal,
    startExport: handleStartExport,
    cancelExport: handleCancelExport,
  };
};