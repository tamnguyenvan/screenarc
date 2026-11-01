import { describe, expect, test } from 'vitest'
import { buildFfmpegArgs } from './build-recording-args'

describe('buildFfmpegArgs', () => {
  test('overwrites stale recording outputs without prompting', () => {
    const args = buildFfmpegArgs(['-f', 'gdigrab', '-i', 'desktop'], false, false, 'DemoThat-recording-screen.mp4')

    expect(args[0]).toBe('-y')
    expect(args).toContain('DemoThat-recording-screen.mp4')
  })

  test('maps microphone audio into the same output as screen video', () => {
    const args = buildFfmpegArgs(
      ['-f', 'alsa', '-i', 'default', '-f', 'x11grab', '-i', ':0.0'],
      false,
      true,
      'screen.mp4',
    )

    const screenOutputIndex = args.lastIndexOf('screen.mp4')
    expect(args.filter((arg) => arg === 'screen.mp4')).toHaveLength(1)
    expect(args.slice(0, screenOutputIndex)).toContain('1:v')
    expect(args.slice(0, screenOutputIndex)).toContain('0:a')
    expect(args.slice(0, screenOutputIndex)).toContain('aac')
  })

  test('keeps webcam output separate while recording microphone audio', () => {
    const args = buildFfmpegArgs(['mic-input', 'webcam-input', 'screen-input'], true, true, 'screen.mp4', 'webcam.mp4')

    expect(args.filter((arg) => arg === 'screen.mp4')).toHaveLength(1)
    expect(args.filter((arg) => arg === 'webcam.mp4')).toHaveLength(1)
    expect(args).toContain('2:v')
    expect(args).toContain('0:a')
    expect(args).toContain('1:v')
  })

  test('crops the screen output with the Wayland area selection', () => {
    const args = buildFfmpegArgs(
      ['-f', 'rawvideo', '-i', '-'],
      false,
      false,
      'screen.mp4',
      undefined,
      'crop=800:600:100:50',
    )

    expect(args).toContain('-vf')
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=800:600:100:50')
    // The filter belongs to the screen output, so it must come before it.
    expect(args.indexOf('-vf')).toBeLessThan(args.lastIndexOf('screen.mp4'))
  })

  test('sends no filter at all when there is no crop', () => {
    const args = buildFfmpegArgs(['-f', 'x11grab', '-i', ':0.0'], false, false, 'screen.mp4')
    expect(args).not.toContain('-vf')
  })

  test('encodes screen and webcam with the clean-source quality settings', () => {
    const args = buildFfmpegArgs(
      ['-f', 'v4l2', '-i', '/dev/video0', '-f', 'x11grab', '-i', ':0.0'],
      true,
      false,
      'screen.mp4',
      'webcam.mp4',
    )

    // CRF 18 with deblocking + adaptive quantization; the default ultrafast
    // profile (CRF 23, aq=0, deblock off) leaves noise the 4x upscale amplifies.
    for (const output of ['screen.mp4', 'webcam.mp4']) {
      const outputIndex = args.lastIndexOf(output)
      const encodeArgs = args.slice(0, outputIndex)
      expect(encodeArgs).toContain('-crf')
      expect(encodeArgs[encodeArgs.indexOf('-crf') + 1]).toBe('18')
      expect(encodeArgs).toContain('-x264-params')
      expect(encodeArgs[encodeArgs.indexOf('-x264-params') + 1]).toBe('aq-mode=1:deblock=1:1:1')
    }
  })

  test('applies the screen crop without touching the webcam output', () => {
    const args = buildFfmpegArgs(
      ['-f', 'v4l2', '-i', '/dev/video0', '-f', 'rawvideo', '-i', '-'],
      true,
      false,
      'screen.mp4',
      'webcam.mp4',
      'crop=640:480:0:0',
    )

    // The webcam is encoded after the screen file, and must not inherit the filter.
    expect(args.indexOf('webcam.mp4')).toBeGreaterThan(args.indexOf('-vf'))
    expect(args.filter((arg) => arg === '-vf')).toHaveLength(1)
  })
})
