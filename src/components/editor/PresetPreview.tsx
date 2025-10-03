"use client"

// PresetPreview.tsx - Visual preview component for frame style presets
import { useMemo, useRef } from "react"
import { WALLPAPERS } from "../../lib/constants"
import type { FrameStyles, AspectRatio, WebcamStyles, WebcamPosition } from "../../types/store"
import { Video } from "lucide-react"
import { cn } from "../../lib/utils"

interface PresetPreviewProps {
  styles: FrameStyles
  aspectRatio: AspectRatio
  isWebcamVisible?: boolean
  webcamPosition?: WebcamPosition
  webcamStyles?: WebcamStyles
}

const generateBackgroundStyle = (backgroundState: FrameStyles["background"]) => {
  switch (backgroundState.type) {
    case "color":
      return { background: backgroundState.color || "#ffffff" }
    case "gradient": {
      const start = backgroundState.gradientStart || "#000000"
      const end = backgroundState.gradientEnd || "#ffffff"
      const direction = backgroundState.gradientDirection || "to right"
      return { background: `linear-gradient(${direction}, ${start}, ${end})` }
    }
    case "image":
    case "wallpaper": {
      const imageUrl = backgroundState.imageUrl?.startsWith("blob:")
        ? backgroundState.imageUrl
        : `media://${backgroundState.imageUrl || WALLPAPERS[0].imageUrl}`
      return {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    }
    default:
      return { background: "#111" }
  }
}

export function PresetPreview({
  styles,
  aspectRatio,
  isWebcamVisible,
  webcamPosition,
  webcamStyles,
}: PresetPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  const cssAspectRatio = useMemo(() => aspectRatio.replace(":", " / "), [aspectRatio])

  const frameStyle = useMemo(() => {
    const shadowBlur = styles.shadow * 1.5
    const shadowString = styles.shadow > 0 ? `0px 0px ${shadowBlur}px ${styles.shadowColor}` : "none"

    return {
      width: "100%",
      height: "100%",
      padding: `${styles.borderWidth}px`,
      borderRadius: `${styles.borderRadius}px`,
      boxShadow: shadowString,
      background: `
              linear-gradient(135deg, 
                  rgba(255, 255, 255, 0.25) 0%, 
                  rgba(255, 255, 255, 0.15) 50%, 
                  rgba(255, 255, 255, 0.05) 100%
              ),
              radial-gradient(ellipse at top left, 
                  rgba(255, 255, 255, 0.2) 0%, 
                  transparent 50%
              )
          `,
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      border: "1px solid rgba(255, 255, 255, 0.3)",
    }
  }, [styles])

  const fakeWebcamStyle = useMemo(() => {
    if (!webcamStyles) return {}
    const shadowBlur = webcamStyles.shadow * 1.5
    return {
      height: `${webcamStyles.size}%`,
      filter: `drop-shadow(0px 0px ${shadowBlur}px ${webcamStyles.shadowColor})`,
    }
  }, [webcamStyles])

  const fakeWebcamClasses = useMemo(() => {
    if (!webcamPosition) return ""
    return cn("absolute z-20 aspect-square overflow-hidden rounded-[35%]", "transition-all duration-300 ease-in-out", {
      "top-4 left-4": webcamPosition.pos === "top-left",
      "top-4 right-4": webcamPosition.pos === "top-right",
      "bottom-4 left-4": webcamPosition.pos === "bottom-left",
      "bottom-4 right-4": webcamPosition.pos === "bottom-right",
    })
  }, [webcamPosition])

  const backgroundStyle = useMemo(() => generateBackgroundStyle(styles.background), [styles.background])

  return (
    <div
      ref={previewRef}
      className="h-full rounded-xl flex items-center justify-center transition-all duration-300 ease-out max-w-full max-h-full shadow-lg"
      style={{ ...backgroundStyle, aspectRatio: cssAspectRatio }}
    >
      <div className="w-full h-full" style={{ padding: `${styles.padding}%`, position: "relative" }}>
        <div className="w-full h-full" style={frameStyle}>
          <div
            className="w-full h-full bg-muted/30"
            style={{
              borderRadius: `${Math.max(0, styles.borderRadius - styles.borderWidth)}px`,
            }}
          >
            <div className="p-4 opacity-50 space-y-2">
              <div className="w-1/2 h-2.5 bg-foreground/20 rounded-full"></div>
              <div className="w-3/4 h-2 bg-foreground/15 rounded-full"></div>
              <div className="w-2/3 h-2 bg-foreground/10 rounded-full"></div>
            </div>
          </div>
        </div>

        {isWebcamVisible && webcamStyles && webcamPosition && (
          <div className={fakeWebcamClasses} style={fakeWebcamStyle}>
            <div className="w-full h-full bg-card flex items-center justify-center shadow-lg">
              <Video className="w-1/2 h-1/2 text-foreground/40" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
