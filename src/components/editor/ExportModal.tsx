"use client"

// ExportModal.tsx - Modal for configuring export settings and showing export progress
import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Upload, Loader2, CheckCircle2, XCircle, Folder } from "lucide-react"
import { Input } from "../ui/input"
import { cn } from "../../lib/utils"

export type ExportSettings = {
  format: "mp4" | "gif"
  resolution: "720p" | "1080p" | "2k"
  fps: 30
  quality: "low" | "medium" | "high"
}

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  onStartExport: (settings: ExportSettings, outputPath: string) => void
  onCancelExport: () => void
  isExporting: boolean
  progress: number
  result: { success: boolean; outputPath?: string; error?: string } | null
}

const generateFilename = (format: "mp4" | "gif") => {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19)
  return `ScreenArc-${timestamp}.${format}`
}

// --- Sub-components for different views ---
const SettingsView = ({
  onStartExport,
  onClose,
}: {
  onStartExport: (settings: ExportSettings, outputPath: string) => void
  onClose: () => void
}) => {
  const [settings, setSettings] = useState<ExportSettings>({
    format: "mp4",
    resolution: "1080p",
    fps: 30,
    quality: "medium",
  })
  const [outputPath, setOutputPath] = useState("")

  const handleValueChange = (key: keyof ExportSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleBrowse = async () => {
    const result = await window.electronAPI.showSaveDialog({
      title: "Save Video",
      defaultPath: outputPath,
      filters:
        settings.format === "mp4"
          ? [{ name: "MP4 Video", extensions: ["mp4"] }]
          : [{ name: "GIF Animation", extensions: ["gif"] }],
    })

    if (!result.canceled && result.filePath) {
      setOutputPath(result.filePath)
    }
  }

  useEffect(() => {
    const setDefaultPath = async () => {
      try {
        const homePath = await window.electronAPI.getPath("home")
        const filename = generateFilename(settings.format)
        setOutputPath(`${homePath}/${filename}`)
      } catch (error) {
        console.error("Failed to get home path, falling back to relative path.", error)
        setOutputPath(generateFilename(settings.format))
      }
    }

    setDefaultPath()
  }, [settings.format])

  return (
    <>
      {/* Header */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Export Settings</h2>
            <p className="text-sm text-muted-foreground">Configure your export options</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-5">
          <SettingRow label="Format">
            <Select value={settings.format} onValueChange={(value) => handleValueChange("format", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp4">MP4 (Video)</SelectItem>
                <SelectItem value="gif">GIF (Animation)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Resolution">
            <Select value={settings.resolution} onValueChange={(value) => handleValueChange("resolution", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">HD (720p)</SelectItem>
                <SelectItem value="1080p">Full HD (1080p)</SelectItem>
                <SelectItem value="2k">2K (1440p)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Quality">
            <Select value={settings.quality} onValueChange={(value) => handleValueChange("quality", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="FPS">
            <Select value={String(settings.fps)} disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 FPS</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Output File">
            <div className="w-full flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Input
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="Loading default path..."
                  className="w-full h-9 bg-background text-foreground"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={handleBrowse} className="h-9 whitespace-nowrap">
                Browse
              </Button>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onStartExport(settings, outputPath)} disabled={!outputPath}>
          Start Export
        </Button>
      </div>
    </>
  )
}

const ProgressView = ({ progress, onCancel }: { progress: number; onCancel: () => void }) => (
  <div className="flex flex-col items-center text-center p-8">
    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
    <h2 className="text-lg font-semibold text-foreground mb-2">Exporting...</h2>
    <p className="text-sm text-muted-foreground mb-8">Please wait while we process your video.</p>
    <div className="relative w-full h-2.5 bg-muted rounded-full overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="text-sm font-semibold text-primary mt-4 tabular-nums">{Math.round(progress)}%</p>
    <Button variant="secondary" onClick={onCancel} className="mt-8 w-full">
      Cancel
    </Button>
  </div>
)

const ResultView = ({
  result,
  onClose,
}: {
  result: NonNullable<ExportModalProps["result"]>
  onClose: () => void
}) => {
  const handleOpenFolder = () => {
    if (result.success && result.outputPath) {
      window.electronAPI.showItemInFolder(result.outputPath)
    }
  }

  return (
    <div className="flex flex-col items-center text-center p-8">
      <div
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mb-5",
          result.success ? "bg-green-500/10" : "bg-red-500/10",
        )}
      >
        {result.success ? (
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        ) : (
          <XCircle className="w-8 h-8 text-red-500" />
        )}
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        {result.success ? "Export Successful" : "Export Failed"}
      </h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs break-words leading-relaxed">
        {result.success
          ? `Your video has been saved to the selected location.`
          : `${result.error || "An unknown error occurred."}`}
      </p>
      <div className="flex w-full gap-3">
        {result.success ? (
          <>
            <Button onClick={onClose} variant="secondary" className="flex-1">
              Close
            </Button>
            <Button onClick={handleOpenFolder} className="flex-1">
              <Folder className="w-4 h-4 mr-2" />
              Open Folder
            </Button>
          </>
        ) : (
          <Button onClick={onClose} className="flex-1">
            Close
          </Button>
        )}
      </div>
    </div>
  )
}

// --- Main Modal Component ---
export function ExportModal({
  isOpen,
  onClose,
  onStartExport,
  onCancelExport,
  isExporting,
  progress,
  result,
}: ExportModalProps) {
  if (!isOpen) return null

  const renderContent = () => {
    if (result) {
      return <ResultView result={result} onClose={onClose} />
    }
    if (isExporting) {
      return <ProgressView progress={progress} onCancel={onCancelExport} />
    }
    return <SettingsView onStartExport={onStartExport} onClose={onClose} />
  }

  return (
    <div className="modal-backdrop z-50 flex items-center justify-center">
      <div className="card-clean w-full max-w-2xl m-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {renderContent()}
      </div>
    </div>
  )
}

// Helper component for settings row with 1/3 - 2/3 layout
const SettingRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-4">
    <div className="w-1/3">
      <label className="text-sm font-medium text-foreground/90 leading-none">{label}</label>
    </div>
    <div className="w-2/3">{children}</div>
  </div>
)
