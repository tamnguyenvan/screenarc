"use client"

// ExportButton.tsx - Primary button to trigger video export
import { Upload, Loader2 } from "lucide-react"
import { Button } from "../ui/button"

interface ExportButtonProps {
  onClick: () => void
  isExporting: boolean
  disabled?: boolean
}

export function ExportButton({ onClick, isExporting, disabled }: ExportButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={isExporting || disabled}
      className="btn-clean bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 h-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
    >
      {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
      {isExporting ? "Exporting..." : "Export"}
    </Button>
  )
}
