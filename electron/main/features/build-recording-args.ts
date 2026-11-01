/**
 * Builds FFmpeg arguments for screen, microphone, and webcam capture.
 */
export function buildFfmpegArgs(
  inputArgs: string[],
  hasWebcam: boolean,
  hasMic: boolean,
  screenOut: string,
  webcamOut?: string,
  /**
   * A video filter for the screen output only. Used on Wayland, where the portal
   * can only hand over a whole monitor and the user's area has to be cut out of it;
   * it is applied here because this is the pass that encodes those frames.
   */
  screenFilter?: string,
): string[] {
  // Recording output paths can survive a failed attempt. FFmpeg is spawned
  // without an interactive terminal, so overwrite them instead of waiting for
  // a confirmation that can never arrive.
  const finalArgs = ['-y', ...inputArgs]
  const micIndex = hasMic ? 0 : -1
  const webcamIndex = hasMic ? (hasWebcam ? 1 : -1) : hasWebcam ? 0 : -1
  const screenIndex = (hasMic ? 1 : 0) + (hasWebcam ? 1 : 0)

  // Map screen video and microphone audio to the SAME output. Previously the
  // mic mapping appended screenOut a second time, creating a second output
  // file target; FFmpeg could overwrite/fail on the video file, leaving an
  // audio-only MP4 that appears black or will not play in the editor.
  finalArgs.push('-map', `${screenIndex}:v`)
  if (hasMic) {
    finalArgs.push('-map', `${micIndex}:a`)
  }

  finalArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p')
  if (screenFilter) {
    // Output-scoped, so it applies to the screen file and not to the webcam's.
    finalArgs.push('-vf', screenFilter)
  }
  // ultrafast defaults to CRF 23 with deblocking and adaptive quantization off
  // (aq=0), which leaves visible block/mosquito noise on screen content; that
  // noise is what the 4x upscale amplifies into "grain". CRF 18 plus deblock
  // and aq costs almost no encode time at this preset. The deblock pair is
  // comma-separated: in -x264-params a colon separates entries, not values.
  finalArgs.push('-x264-params', 'aq-mode=1:deblock=1,1')
  // +faststart relocates the moov box to the front of the file. The preview's
  // media element reads metadata from the first bytes; without it, Chromium
  // must range-request the file tail, which the browser can only do reliably
  // when the serving protocol supports byte ranges (see index.ts media://).
  finalArgs.push('-movflags', '+faststart')
  if (hasMic) {
    finalArgs.push('-c:a', 'aac', '-b:a', '192k')
  }
  finalArgs.push(screenOut)

  if (hasWebcam && webcamOut) {
    finalArgs.push(
      '-map',
      `${webcamIndex}:v`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-x264-params',
      'aq-mode=1:deblock=1,1',
      '-pix_fmt',
      'yuv420p',
      webcamOut,
    )
  }

  return finalArgs
}
