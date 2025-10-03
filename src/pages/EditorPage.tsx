"use client"

// EditorPage.tsx - Main editor page layout with preview, timeline, and controls
import { useEffect, useRef, useState, useCallback } from "react"
import { useEditorStore } from "../store/editorStore"
import { Preview } from "../components/editor/Preview"
import { SidePanel } from "../components/editor/SidePanel"
import { Timeline } from "../components/editor/Timeline"
import { PreviewControls } from "../components/editor/PreviewControls"
import { UpdateNotification } from "../components/editor/UpdateNotification"
import { ExportButton } from "../components/editor/ExportButton"
import { ExportModal } from "../components/editor/ExportModal"
import { WindowControls } from "../components/editor/WindowControls"
import { PresetModal } from "../components/editor/PresetModal"
import { SettingsModal } from "../components/settings/SettingsModal"
import { Layers3, Moon, Sun, Loader2, Check, Settings } from "lucide-react"
import { cn } from "../lib/utils"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useExportProcess } from "../hooks/useExportProcess"
import { Button } from "../components/ui/button"
import { useShallow } from "zustand/react/shallow"

export function EditorPage() {
  const {
    loadProject,
    toggleTheme,
    deleteRegion,
    initializePresets,
    initializeSettings,
    togglePlay,
    togglePreviewFullScreen,
  } = useEditorStore.getState()
  const { presetSaveStatus, duration, isPreviewFullScreen, currentTheme } = useEditorStore(
    useShallow((state) => ({
      presetSaveStatus: state.presetSaveStatus,
      duration: state.duration,
      isPreviewFullScreen: state.isPreviewFullScreen,
      currentTheme: state.theme,
    })),
  )
  const { undo, redo } = useEditorStore.temporal.getState()
  const {
    isModalOpen: isExportModalOpen,
    isExporting,
    progress: exportProgress,
    result: exportResult,
    openExportModal,
    closeExportModal,
    startExport,
    cancelExport,
  } = useExportProcess()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPresetModalOpen, setPresetModalOpen] = useState(false)
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null)
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null)

  const handleDeleteSelectedRegion = useCallback(() => {
    const currentSelectedId = useEditorStore.getState().selectedRegionId
    if (currentSelectedId) {
      deleteRegion(currentSelectedId)
    }
  }, [deleteRegion])

  useKeyboardShortcuts(
    {
      delete: handleDeleteSelectedRegion,
      backspace: handleDeleteSelectedRegion,
      " ": (e) => {
        e.preventDefault()
        togglePlay()
      },
      "ctrl+z": (e) => {
        e.preventDefault()
        undo()
      },
      "ctrl+y": (e) => {
        e.preventDefault()
        redo()
      },
      "ctrl+shift+z": (e) => {
        e.preventDefault()
        redo()
      },
    },
    [handleDeleteSelectedRegion, undo, redo, togglePlay],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isPreviewFullScreen) {
        togglePreviewFullScreen()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isPreviewFullScreen, togglePreviewFullScreen])

  useEffect(() => {
    const cleanup = window.electronAPI.onUpdateAvailable((info: { version: string; url: string }) => {
      setUpdateInfo(info)
    })
    return () => cleanup()
  }, [])

  useEffect(() => {
    window.electronAPI.getPlatform().then(setPlatform)
    initializeSettings()
    const cleanup = window.electronAPI.onProjectOpen(async (payload) => {
      await initializePresets()
      await loadProject(payload)
      useEditorStore.temporal.getState().clear()
    })
    return () => cleanup()
  }, [loadProject, initializePresets, initializeSettings])

  const getPresetButtonContent = () => {
    switch (presetSaveStatus) {
      case "saving":
        return (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
          </>
        )
      case "saved":
        return (
          <>
            <Check className="w-4 h-4 mr-2" /> Saved!
          </>
        )
      default:
        return (
          <>
            <Layers3 className="w-4 h-4 mr-2" /> Presets
          </>
        )
    }
  }

  return (
    <main className="h-screen w-screen bg-background flex flex-col overflow-hidden select-none">
      {isPreviewFullScreen ? (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <Preview videoRef={videoRef} />
        </div>
      ) : (
        <>
          <header
            className="relative h-12 flex-shrink-0 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-center shadow-sm"
            style={{ WebkitAppRegion: "drag" }}
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              {platform !== "darwin" && <WindowControls />}
            </div>
            <h1 className="text-sm font-bold text-foreground pointer-events-none tracking-tight">ScreenArc</h1>
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2"
              style={{ WebkitAppRegion: "no-drag" }}
            >
              {updateInfo && <UpdateNotification info={updateInfo} />}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className={cn(
                  "h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-all duration-200",
                )}
              >
                {currentTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsModalOpen(true)}
                aria-label="Open Settings"
                className={cn(
                  "h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-all duration-200",
                )}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPresetModalOpen(true)}
                disabled={presetSaveStatus === "saving"}
                className={cn(
                  "transition-all duration-300 w-[110px] h-8 font-medium shadow-sm",
                  presetSaveStatus === "saved" &&
                    "bg-green-500/15 border border-green-500/30 text-green-600 dark:text-green-400 shadow-green-500/10",
                )}
              >
                {getPresetButtonContent()}
              </Button>
              <ExportButton isExporting={isExporting} onClick={openExportModal} disabled={duration <= 0} />
            </div>
          </header>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-[28rem] flex-shrink-0 bg-sidebar border-r border-sidebar-border overflow-hidden">
              <SidePanel />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
                  <Preview videoRef={videoRef} />
                </div>
                <div className="flex-shrink-0 pb-2">
                  <PreviewControls videoRef={videoRef} />
                </div>
              </div>
              <div className="h-48 flex-shrink-0 bg-card/60 border-t border-border/50 backdrop-blur-sm overflow-hidden shadow-inner">
                <Timeline videoRef={videoRef} />
              </div>
            </div>
          </div>
        </>
      )}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        onStartExport={startExport}
        onCancelExport={cancelExport}
        isExporting={isExporting}
        progress={exportProgress}
        result={exportResult}
      />
      <PresetModal isOpen={isPresetModalOpen} onClose={() => setPresetModalOpen(false)} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
    </main>
  )
}
