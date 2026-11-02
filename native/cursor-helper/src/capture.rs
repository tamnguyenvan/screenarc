// The PipeWire half: turn the portal's stream into two useful things — raw video
// frames on a file descriptor (the app pipes them into its bundled FFmpeg, so no
// encoder is needed here and nothing is encoded twice), and cursor samples on
// stdout.
//
// Three deliberate choices:
//
//   * **Software memory only.** We ask for MemFd/MemPtr buffers, never DMA-BUF, so
//     the frames are readable on any machine, with or without a GPU. The cost is a
//     copy inside the compositor; the benefit is that the helper needs no
//     EGL/GBM stack and works on a GPU-less box.
//   * **The pointer is not in the pixels.** The session asks for METADATA cursor
//     mode, so the position arrives in each buffer's cursor meta and the app draws
//     the cursor itself. Reading that meta is why this module drops to the raw
//     `pipewire-sys` bindings: `pipewire` 0.8's safe `Buffer` exposes only its data
//     slices, and the cursor meta is not among them. The SPA ABI below is copied
//     from `/usr/include/spa-0.2/spa/buffer/meta.h`.
//   * **Raw frames leave on a descriptor**, not through a codec in this process,
//     which keeps the helper free of FFmpeg and means the app keeps using the
//     bundled binary it already ships.

use crate::protocol::{now_ms, Control, Emitter, Event};
use anyhow::{Context, Result};
use pipewire as pw;
use pipewire_sys as pw_sys;
use pw::spa;
use pw::spa::pod::{serialize::PodSerializer, Object, Pod, Property, Value};
use pw::spa::utils::Id;
use std::os::fd::{AsRawFd, BorrowedFd, OwnedFd, RawFd};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, TryRecvError};
use std::sync::{Arc, Mutex};

/// `spa_meta_type::SPA_META_Cursor` — the fifth entry of the enum, which bindgen
/// does not emit for us.
const SPA_META_CURSOR: u32 = 5;

// The 32-bit pixel formats a cursor bitmap can arrive in, as their ordinal in
// `enum spa_video_format`. Each name is the memory byte order, so this is a plain
// lookup and not a question of endianness: RGBA really does start with red and ARGB
// really does start with alpha. Anything not listed here (planar formats, `ENCODED`)
// is not something a cursor can be drawn from, so it is reported as "no bitmap"
// rather than converted into nonsense.
const SPA_VIDEO_FORMAT_RGBX: u32 = 7;
const SPA_VIDEO_FORMAT_BGRX: u32 = 8;
const SPA_VIDEO_FORMAT_XRGB: u32 = 9;
const SPA_VIDEO_FORMAT_XBGR: u32 = 10;
const SPA_VIDEO_FORMAT_RGBA: u32 = 11;
const SPA_VIDEO_FORMAT_BGRA: u32 = 12;
const SPA_VIDEO_FORMAT_ARGB: u32 = 13;
const SPA_VIDEO_FORMAT_ABGR: u32 = 14;

/// A cursor bitmap this big is not a cursor. Guards against a malformed or hostile
/// buffer making us allocate hundreds of megabytes.
const MAX_BITMAP_DIMENSION: u32 = 512;

#[repr(C)]
#[derive(Clone, Copy)]
struct SpaPoint {
    x: i32,
    y: i32,
}

/// `struct spa_meta`: the header of one meta region on a buffer.
#[repr(C)]
#[derive(Clone, Copy)]
struct SpaMeta {
    type_: u32,
    size: u32,
    data: *mut std::ffi::c_void,
}

/// `struct spa_meta_cursor`. `id == 0` means "no new cursor data", so a stale
/// buffer must not be read as a position at 0,0.
#[repr(C)]
#[derive(Clone, Copy)]
struct SpaMetaCursor {
    id: u32,
    flags: u32,
    position: SpaPoint,
    hotspot: SpaPoint,
    bitmap_offset: u32,
}

/// `struct spa_meta_bitmap`, which sits inside the cursor meta's own memory at
/// `bitmap_offset`. `struct spa_rectangle size` is two `uint32_t`s, spelled out here
/// so the layout is visible.
#[repr(C)]
#[derive(Clone, Copy)]
struct SpaMetaBitmap {
    format: u32,
    width: u32,
    height: u32,
    stride: i32,
    offset: u32,
}

/// The pointer's bitmap as the portal described it.
pub struct CursorBitmap {
    pub format: u32,
    pub width: u32,
    pub height: u32,
    pub stride: i32,
    pub bytes: Vec<u8>,
}

/// One buffer's cursor meta: where the pointer is, and (when it changed) its shape.
pub struct CursorMeta {
    /// The pointer tip: bitmap top-left plus the hotspot inside it. This is the same
    /// point the X11 tracker reports, so the editor's drawing maths is identical.
    pub x: f64,
    pub y: f64,
    pub id: u32,
    pub hot_x: i32,
    pub hot_y: i32,
    pub bitmap: Option<CursorBitmap>,
}

/// Cursor state as the last frame reported it, plus the clicks waiting to be
/// emitted. Clicks come from evdev and carry no coordinates of their own, so they
/// are stamped with the most recent position the portal gave us.
#[derive(Default)]
pub struct CursorState {
    pub x: f64,
    pub y: f64,
    pub have_position: bool,
}

pub struct CaptureStats {
    pub frames: AtomicU64,
    pub dropped: AtomicU64,
}

struct UserData {
    events: Emitter<std::io::Stdout>,
    video_fd: RawFd,
    stats: Arc<CaptureStats>,
    cursor: Arc<Mutex<CursorState>>,
    clicks: Receiver<(String, bool)>,
    started: bool,
    frames_without_cursor: u64,
    format_name: String,
    width: u32,
    height: u32,
    paused: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    main_loop: pw::main_loop::MainLoop,
    cursor_is_metadata: bool,
    clicks_available: bool,
    /// The bitmap the current samples refer to, sent to the app once. `None` until
    /// the compositor hands one over.
    cursor_image_key: Option<String>,
    /// The cursor id whose bitmap we last announced, so a shape goes out once per
    /// distinct cursor rather than once per frame.
    last_cursor_id: u32,
    /// What the compositor negotiated, which is what FFmpeg has to be told; the
    /// rate we asked for is only a hint.
    fps: u32,
    requested_fps: u32,
}

impl UserData {
    fn emit_cursor_and_clicks(&mut self) {
        if self.paused.load(Ordering::Relaxed) {
            return;
        }
        let (position, have) = {
            let state = self.cursor.lock().unwrap();
            ((state.x, state.y), state.have_position)
        };
        if have {
            self.events.emit(Event::Move {
                timestamp: now_ms(),
                x: position.0,
                y: position.1,
                cursor_image_key: self.cursor_image_key.clone(),
            });
        }

        // Drained every frame: an empty channel is the normal case.
        loop {
            match self.clicks.try_recv() {
                Ok((button, pressed)) => self.events.emit(Event::Click {
                    timestamp: now_ms(),
                    x: position.0,
                    y: position.1,
                    button,
                    pressed,
                    cursor_image_key: self.cursor_image_key.clone(),
                }),
                Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => break,
            }
        }
    }
}

/// Converts a cursor bitmap to the RGBA bytes the editor draws with.
///
/// `spa_video_format` names the memory byte order, so this is a straight swizzle
/// table rather than anything clever. Alpha is forced opaque for the `x` formats,
/// which carry no alpha at all. Rows are followed by `stride` (compositors pad
/// them); a stride of 0 is read as tightly packed, and one too small to hold a row
/// is rejected rather than read past the end of the bitmap.
fn to_rgba(format: u32, bytes: &[u8], width: u32, height: u32, stride: i32) -> Option<Vec<u8>> {
    if width == 0 || height == 0 || width > MAX_BITMAP_DIMENSION || height > MAX_BITMAP_DIMENSION {
        return None;
    }
    let row_bytes = (width as usize).checked_mul(4)?;
    let stride = if stride <= 0 {
        row_bytes
    } else {
        let stride = stride as usize;
        if stride < row_bytes {
            return None;
        }
        stride
    };
    let needed = row_bytes + stride * (height as usize - 1);
    if bytes.len() < needed {
        return None;
    }

    // (red, green, blue, alpha) byte positions, relative to each pixel. Alpha is -1
    // for the `x` formats, which do not carry one.
    let (r, g, b, a): (usize, usize, usize, isize) = match format {
        SPA_VIDEO_FORMAT_RGBA => (0, 1, 2, 3),
        SPA_VIDEO_FORMAT_BGRA => (2, 1, 0, 3),
        SPA_VIDEO_FORMAT_ARGB => (1, 2, 3, 0),
        SPA_VIDEO_FORMAT_ABGR => (3, 2, 1, 0),
        SPA_VIDEO_FORMAT_RGBX => (0, 1, 2, -1),
        SPA_VIDEO_FORMAT_BGRX => (2, 1, 0, -1),
        SPA_VIDEO_FORMAT_XRGB => (1, 2, 3, -1),
        SPA_VIDEO_FORMAT_XBGR => (3, 2, 1, -1),
        _ => return None,
    };

    let mut out = vec![0u8; row_bytes * height as usize];
    for row in 0..height as usize {
        let src_row = &bytes[row * stride..row * stride + row_bytes];
        let dst_row = &mut out[row * row_bytes..(row + 1) * row_bytes];
        for (pixel, chunk) in src_row.chunks_exact(4).enumerate() {
            let out = &mut dst_row[pixel * 4..pixel * 4 + 4];
            out[0] = chunk[r];
            out[1] = chunk[g];
            out[2] = chunk[b];
            out[3] = if a < 0 { 255 } else { chunk[a as usize] };
        }
    }
    Some(out)
}

/// Reads the pointer out of a raw `spa_buffer`.
///
/// The compositor puts a `spa_meta_cursor` in the buffer's meta region. Its
/// `position` is the cursor bitmap's top-left and `hotspot` the offset of the
/// actual pointer tip inside it, so the pointer sits at their sum. When the cursor
/// meta points at a `spa_meta_bitmap` (any offset at or past the bitmap struct
/// itself), the bitmap is copied out too — that is what lets the recording show the
/// user's real pointer.
unsafe fn read_cursor_meta(buffer: *mut spa::sys::spa_buffer) -> Option<CursorMeta> {
    if buffer.is_null() {
        return None;
    }
    let count = (*buffer).n_metas as usize;
    if (*buffer).metas.is_null() || count == 0 {
        return None;
    }
    for index in 0..count {
        let meta = (*buffer).metas.add(index) as *const SpaMeta;
        if (*meta).type_ != SPA_META_CURSOR {
            continue;
        }
        if (*meta).data.is_null() || ((*meta).size as usize) < std::mem::size_of::<SpaMetaCursor>()
        {
            continue;
        }
        let cursor = (*meta).data as *const SpaMetaCursor;
        if (*cursor).id == 0 {
            // No new cursor data in this buffer; the last position still stands,
            // so report nothing and let the caller keep its previous sample.
            return None;
        }
        let hot_x = (*cursor).hotspot.x;
        let hot_y = (*cursor).hotspot.y;
        return Some(CursorMeta {
            x: f64::from((*cursor).position.x + hot_x),
            y: f64::from((*cursor).position.y + hot_y),
            id: (*cursor).id,
            hot_x,
            hot_y,
            bitmap: unsafe { read_cursor_bitmap(meta, cursor) },
        });
    }
    None
}

/// Copies the bitmap the cursor meta points at, if it points at one.
///
/// The bitmap struct lives inside the same meta region, at `bitmap_offset`; the
/// pixels live inside the bitmap struct, at its own `offset`. An offset of 0 (or one
/// that does not clear the struct) means the compositor is telling us the image is
/// unchanged, so there is nothing to copy.
unsafe fn read_cursor_bitmap(
    meta: *const SpaMeta,
    cursor: *const SpaMetaCursor,
) -> Option<CursorBitmap> {
    let bitmap_offset = (*cursor).bitmap_offset as usize;
    let meta_size = (*meta).size as usize;
    if bitmap_offset < std::mem::size_of::<SpaMetaBitmap>() || bitmap_offset >= meta_size {
        return None;
    }

    let base = (*meta).data as *const u8;
    let bitmap = unsafe { base.add(bitmap_offset) } as *const SpaMetaBitmap;
    let width = (*bitmap).width;
    let height = (*bitmap).height;
    let stride = (*bitmap).stride;
    let pixel_offset = (*bitmap).offset as usize;

    if width == 0 || height == 0 || width > MAX_BITMAP_DIMENSION || height > MAX_BITMAP_DIMENSION {
        return None;
    }
    // The pixels start at the bitmap struct's own offset from the bitmap base, and
    // must stay inside the meta region we were handed.
    let data_start = bitmap_offset.checked_add(pixel_offset)?;
    if pixel_offset < std::mem::size_of::<SpaMetaBitmap>() || data_start >= meta_size {
        return None;
    }
    let row_bytes = (width as usize).checked_mul(4)?;
    let stride_bytes = if stride <= 0 {
        row_bytes
    } else {
        stride as usize
    };
    if stride_bytes < row_bytes {
        return None;
    }
    let needed = row_bytes.checked_add(stride_bytes.checked_mul(height as usize - 1)?)?;
    if data_start.checked_add(needed)? > meta_size {
        return None;
    }

    let mut bytes = vec![0u8; needed];
    unsafe {
        std::ptr::copy_nonoverlapping(base.add(data_start), bytes.as_mut_ptr(), needed);
    }
    Some(CursorBitmap {
        format: (*bitmap).format,
        width,
        height,
        stride,
        bytes,
    })
}

/// The frame rate to report to FFmpeg: what the compositor negotiated, falling back
/// to what we asked for when it does not say (or says something implausible).
///
/// This matters more than it looks: FFmpeg stamps raw frames at the rate we declare,
/// so declaring 30 for a stream that runs at 60 would make the recording half as
/// long as the wall clock and play at double speed.
fn negotiated_fps(framerate: spa::utils::Fraction, fallback: u32) -> u32 {
    let fallback = fallback.clamp(1, 240);
    if framerate.num == 0 || framerate.denom == 0 {
        return fallback;
    }
    let fps = (framerate.num as f64 / framerate.denom as f64).round();
    if !(1.0..=240.0).contains(&fps) {
        return fallback;
    }
    fps as u32
}

/// The pixel format we ask for, as FFmpeg spells it. The raw frames go straight
/// into FFmpeg over a pipe, so the app needs this string to build its arguments.
fn ffmpeg_format_name(format: spa::param::video::VideoFormat) -> &'static str {
    use spa::param::video::VideoFormat;
    match format {
        VideoFormat::BGRA => "bgra",
        VideoFormat::BGRx => "bgr0",
        VideoFormat::RGBA => "rgba",
        VideoFormat::RGBx => "rgb0",
        _ => "bgra",
    }
}

/// Runs the capture loop until the app says stop. Blocking: the caller owns the
/// thread.
#[allow(clippy::too_many_arguments)]
pub fn run(
    stream: OwnedFd,
    node_id: u32,
    video_fd: RawFd,
    cursor: Arc<Mutex<CursorState>>,
    clicks: Receiver<(String, bool)>,
    control: Receiver<Control>,
    paused: Arc<AtomicBool>,
    cursor_is_metadata: bool,
    clicks_available: bool,
    requested_fps: u32,
) -> Result<()> {
    let mainloop =
        pw::main_loop::MainLoop::new(None).context("could not create a PipeWire loop")?;
    let context =
        pw::context::Context::new(&mainloop).context("could not create a PipeWire context")?;
    let core = context
        .connect_fd(stream, None)
        .context("could not connect to the portal's PipeWire remote")?;

    let stats = Arc::new(CaptureStats {
        frames: AtomicU64::new(0),
        dropped: AtomicU64::new(0),
    });

    let stream_props = pw::properties::properties! {
        *pw::keys::MEDIA_TYPE => "Video",
        *pw::keys::MEDIA_CATEGORY => "Capture",
        *pw::keys::MEDIA_ROLE => "Screen",
    };
    let pw_stream = pw::stream::Stream::new(&core, "demothat-cursor-helper", stream_props)
        .context("could not create the capture stream")?;

    let stop = Arc::new(AtomicBool::new(false));

    let user_data = UserData {
        events: Emitter::new(std::io::stdout()),
        video_fd,
        stats: stats.clone(),
        cursor,
        clicks,
        started: false,
        frames_without_cursor: 0,
        format_name: String::new(),
        width: 0,
        height: 0,
        paused: paused.clone(),
        stop: stop.clone(),
        main_loop: mainloop.clone(),
        cursor_is_metadata,
        cursor_image_key: None,
        last_cursor_id: 0,
        clicks_available,
        fps: 0,
        requested_fps,
    };

    let listener = pw_stream
        .add_local_listener_with_user_data(user_data)
        .param_changed(|_, data, id, param| {
            if id != spa::param::ParamType::Format.as_raw() {
                return;
            }
            let Some(param) = param else { return };
            let mut info = spa::param::video::VideoInfoRaw::default();
            if info.parse(param).is_err() {
                return;
            }
            data.width = info.size().width;
            data.height = info.size().height;
            data.format_name = ffmpeg_format_name(info.format()).to_string();
            data.fps = negotiated_fps(info.framerate(), data.requested_fps);

            // The app cannot start FFmpeg without the frame geometry: this event is
            // how it learns what it is about to receive, and it is emitted before
            // the first frame is written.
            if !data.started && data.width > 0 && data.height > 0 {
                data.started = true;
                data.events.emit(Event::Started {
                    width: data.width,
                    height: data.height,
                    format: data.format_name.clone(),
                    fps: data.fps,
                    cursor_mode: if data.cursor_is_metadata {
                        "metadata"
                    } else {
                        "embedded"
                    }
                    .into(),
                    clicks: data.clicks_available,
                    pid: std::process::id(),
                });
            }
        })
        .process(|stream, data| {
            // Stopping happens here, inside the loop, because the loop cannot be
            // stopped from another thread safely. A recording always has frames
            // flowing, so this is reached promptly; if the compositor ever stalls,
            // the app kills the helper instead (see the app's client).
            if data.stop.load(Ordering::Relaxed) {
                data.main_loop.quit();
                return;
            }

            // Raw bindings rather than `Stream::dequeue_buffer`: the safe Buffer
            // does not expose metas, and the pointer's position lives in one.
            let raw = unsafe { pw_sys::pw_stream_dequeue_buffer(stream.as_raw_ptr()) };
            if raw.is_null() {
                data.stats.dropped.fetch_add(1, Ordering::Relaxed);
                return;
            }

            let spa_buffer = unsafe { (*raw).buffer };
            if let Some(meta) = unsafe { read_cursor_meta(spa_buffer) } {
                {
                    let mut cursor = data.cursor.lock().unwrap();
                    cursor.x = meta.x;
                    cursor.y = meta.y;
                    cursor.have_position = true;
                }
                // A new cursor's bitmap is sent once, and every sample that follows
                // refers to it by key. Sending the pixels with each sample would be
                // kilobytes per frame for something that changes when the pointer
                // changes shape — which is to say, rarely.
                if let Some(bitmap) = meta.bitmap {
                    let is_new_cursor =
                        data.cursor_image_key.is_none() || meta.id != data.last_cursor_id;
                    if is_new_cursor {
                        if let Some(rgba) = to_rgba(
                            bitmap.format,
                            &bitmap.bytes,
                            bitmap.width,
                            bitmap.height,
                            bitmap.stride,
                        ) {
                            let key = format!("portal-{}", meta.id);
                            data.events.emit(Event::CursorShape {
                                key: key.clone(),
                                width: bitmap.width,
                                height: bitmap.height,
                                hot_x: meta.hot_x,
                                hot_y: meta.hot_y,
                                rgba_base64: crate::protocol::base64_encode(&rgba),
                            });
                            data.cursor_image_key = Some(key);
                        }
                        // The id is remembered even when the pixels are unusable, so
                        // an unreadable bitmap is not retried sixty times a second.
                        data.last_cursor_id = meta.id;
                    }
                }
            } else {
                data.frames_without_cursor += 1;
                // A compositor that promised cursor metadata and never sends any is
                // worth mentioning once, not once per frame.
                if data.cursor_is_metadata && data.frames_without_cursor == 60 {
                    data.events.emit(Event::Warning {
                        message:
                            "no cursor metadata from the compositor; cursor effects will be empty"
                                .into(),
                    });
                }
            }

            write_frame(data, spa_buffer);
            data.stats.frames.fetch_add(1, Ordering::Relaxed);
            data.emit_cursor_and_clicks();

            // Hand the buffer back: the compositor reuses these.
            unsafe { pw_sys::pw_stream_queue_buffer(stream.as_raw_ptr(), raw) };
        })
        .register()
        .context("could not register the capture callbacks")?;

    // Only raw video, in one format (BGRA, which every compositor can produce), and
    // only CPU-readable buffers.
    let mut format_buffer = vec![0u8; 1024];
    let mut buffers_buffer = vec![0u8; 1024];
    let mut pods: Vec<&Pod> = Vec::new();

    let format_object = Object {
        type_: spa::sys::SPA_TYPE_OBJECT_Format,
        id: spa::param::ParamType::EnumFormat.as_raw(),
        properties: vec![
            Property::new(
                spa::sys::SPA_FORMAT_mediaType,
                Value::Id(Id(spa::sys::SPA_MEDIA_TYPE_video)),
            ),
            Property::new(
                spa::sys::SPA_FORMAT_mediaSubtype,
                Value::Id(Id(spa::sys::SPA_MEDIA_SUBTYPE_raw)),
            ),
            Property::new(
                spa::sys::SPA_FORMAT_VIDEO_format,
                Value::Id(Id(spa::param::video::VideoFormat::BGRA.as_raw())),
            ),
        ],
    };
    let (_, format_len) = PodSerializer::serialize(
        std::io::Cursor::new(&mut format_buffer),
        &Value::Object(format_object),
    )
    .context("could not build the format parameter")?;
    let format_pod = Pod::from_bytes(&format_buffer[..format_len as usize])
        .context("could not parse the format parameter we just built")?;
    pods.push(format_pod);

    // Ask for shared-memory buffers. `dataType` is a flag set, so a compositor that
    // can only do DMA-BUF says so instead of quietly sending memory we cannot read.
    let mem_flags: i32 =
        ((1 << spa::sys::SPA_DATA_MemFd) | (1 << spa::sys::SPA_DATA_MemPtr)) as i32;
    let buffers_object = Object {
        type_: spa::sys::SPA_TYPE_OBJECT_ParamBuffers,
        id: spa::param::ParamType::Buffers.as_raw(),
        properties: vec![Property::new(
            spa::sys::SPA_PARAM_BUFFERS_dataType,
            Value::Int(mem_flags),
        )],
    };
    let (_, buffers_len) = PodSerializer::serialize(
        std::io::Cursor::new(&mut buffers_buffer),
        &Value::Object(buffers_object),
    )
    .context("could not build the buffer parameter")?;
    let buffers_pod = Pod::from_bytes(&buffers_buffer[..buffers_len as usize])
        .context("could not parse the buffer parameter we just built")?;
    pods.push(buffers_pod);

    // Opt into the cursor metadata. The SPA_META_Cursor meta only appears on
    // buffers when the stream advertises it via ParamMeta — and it is the whole
    // point of this helper: the pointer's position (and bitmap) arrive on the
    // video buffers, not in the pixels. kwin reads this advert before deciding
    // whether to attach the meta to output screencasts, so without this pod the
    // helper silently records no cursor at all on KDE (its own detector fires
    // "no cursor metadata from the compositor" after 60 frames and the pointer
    // is lost entirely). The size range mirrors kpipewire's reference reader.
    let mut meta_buffer = vec![0u8; 1024];
    let mut meta_pods: Vec<&Pod> = Vec::new();
    let meta_object = Object {
        type_: spa::sys::SPA_TYPE_OBJECT_ParamMeta,
        id: spa::param::ParamType::Meta.as_raw(),
        properties: vec![
            Property::new(
                spa::sys::SPA_PARAM_META_type,
                Value::Id(Id(spa::sys::SPA_META_Cursor)),
            ),
            Property::new(
                spa::sys::SPA_PARAM_META_size,
                // struct spa_meta_cursor + bitmap struct + pixels, as the
                // reference reader sizes it: a cursor that cannot change shape.
                Value::Choice(spa::pod::ChoiceValue::Int(spa::utils::Choice(
                    spa::utils::ChoiceFlags::empty(),
                    spa::utils::ChoiceEnum::Range {
                        default: 32 * 32 * 4 + 120,
                        min: 1 * 1 * 4 + 120,
                        max: 1024 * 1024 * 4 + 120,
                    },
                ))),
            ),
        ],
    };
    let (_, meta_len) = PodSerializer::serialize(
        std::io::Cursor::new(&mut meta_buffer),
        &Value::Object(meta_object),
    )
    .context("could not build the cursor metadata parameter")?;
    let meta_pod = Pod::from_bytes(&meta_buffer[..meta_len as usize])
        .context("could not parse the cursor metadata parameter we just built")?;
    meta_pods.push(meta_pod);
    pods.append(&mut meta_pods);

    pw_stream
        .connect(
            spa::utils::Direction::Input,
            Some(node_id),
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut pods,
        )
        .context("could not connect to the portal's screen stream")?;

    // Control arrives from stdin (the app writes it) on its own thread and only
    // raises flags; the capture loop acts on them.
    {
        let paused = paused.clone();
        let stop = stop.clone();
        std::thread::spawn(move || {
            for control in control.recv().into_iter() {
                match control {
                    Control::Pause => paused.store(true, Ordering::Relaxed),
                    Control::Resume => paused.store(false, Ordering::Relaxed),
                    Control::Stop => {
                        stop.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            }
        });
    }

    mainloop.run();
    drop(listener);

    let mut events = Emitter::new(std::io::stdout());
    events.emit(Event::Ended {
        frames: stats.frames.load(Ordering::Relaxed),
        dropped: stats.dropped.load(Ordering::Relaxed),
    });

    Ok(())
}

/// Copies one frame out of a `spa_buffer` into the video pipe, row by row when the
/// compositor pads its rows.
fn write_frame(data: &mut UserData, buffer: *mut spa::sys::spa_buffer) {
    unsafe {
        if buffer.is_null() || (*buffer).n_datas == 0 || (*buffer).datas.is_null() {
            data.stats.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let spadata = (*buffer).datas;
        if (*spadata).data.is_null() {
            // No mapping: the buffer is in GPU memory, which we do not ask for.
            data.stats.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let row_bytes = (data.width as usize) * 4;
        if row_bytes == 0 {
            data.stats.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }

        let chunk = (*spadata).chunk;
        let (offset, size, stride) = if chunk.is_null() {
            (0usize, row_bytes * data.height as usize, row_bytes as i32)
        } else {
            (
                (*chunk).offset as usize,
                (*chunk).size as usize,
                if (*chunk).stride == 0 {
                    row_bytes as i32
                } else {
                    (*chunk).stride
                },
            )
        };
        let base = (*spadata).data as *const u8;

        if stride as usize == row_bytes {
            if size > 0 {
                write_all_fd(
                    data.video_fd,
                    std::slice::from_raw_parts(base.add(offset), size),
                );
            }
            return;
        }
        if stride < 0 {
            // Bottom-up frames would come out scrambled, so drop rather than guess.
            data.stats.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        for row in 0..data.height as usize {
            let start = base.add(offset + row * stride as usize);
            write_all_fd(data.video_fd, std::slice::from_raw_parts(start, row_bytes));
        }
    }
}

/// Writes a frame to the pipe. A short write means the app closed its end; the
/// frame is dropped rather than treated as fatal, because a recording that is being
/// stopped should not turn into an error.
fn write_all_fd(fd: RawFd, bytes: &[u8]) {
    let mut written = 0usize;
    while written < bytes.len() {
        let borrowed = unsafe { BorrowedFd::borrow_raw(fd) };
        match nix_write(borrowed.as_raw_fd(), &bytes[written..]) {
            Ok(0) => return,
            Ok(count) => written += count,
            Err(_) => return,
        }
    }
}

fn nix_write(fd: RawFd, bytes: &[u8]) -> std::io::Result<usize> {
    let written = unsafe { libc::write(fd, bytes.as_ptr() as *const libc::c_void, bytes.len()) };
    if written < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(written as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cursor_abi_matches_the_header_it_was_copied_from() {
        // Sizes from spa/meta/meta.h: id, flags, position(2 x i32),
        // hotspot(2 x i32), bitmap_offset, padded to the struct's alignment.
        assert_eq!(std::mem::size_of::<SpaMetaCursor>(), 28);
        assert_eq!(std::mem::size_of::<SpaMeta>(), 16);
        assert_eq!(std::mem::align_of::<SpaMetaCursor>(), 4);
    }

    #[test]
    fn cursor_meta_type_is_the_fifth_enum_entry() {
        // SPA_META_Invalid, Header, VideoCrop, VideoDamage, Bitmap, Cursor
        assert_eq!(SPA_META_CURSOR, 5);
    }

    #[test]
    fn formats_map_to_ffmpeg_names() {
        use spa::param::video::VideoFormat;
        assert_eq!(ffmpeg_format_name(VideoFormat::BGRA), "bgra");
        assert_eq!(ffmpeg_format_name(VideoFormat::BGRx), "bgr0");
        assert_eq!(ffmpeg_format_name(VideoFormat::RGBA), "rgba");
        assert_eq!(ffmpeg_format_name(VideoFormat::RGBx), "rgb0");
    }

    #[test]
    fn a_bitmap_is_swizzled_to_the_byte_order_the_editor_draws_in() {
        // Every one of the eight 32-bit formats, by its actual byte order: the SPA
        // names describe memory, so ARGB begins with alpha rather than needing any
        // endianness reasoning. Getting this table wrong is invisible on a screenshot
        // and obvious to a user (reds and blues swapped), which is why it is pinned.
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_RGBA, &[0x33, 0x22, 0x11, 0x80], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0x80]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_BGRA, &[0x11, 0x22, 0x33, 0xff], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_ARGB, &[0xff, 0x33, 0x22, 0x11], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_ABGR, &[0x80, 0x11, 0x22, 0x33], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0x80]
        );
        // The x-formats carry no alpha, and must come out opaque rather than
        // transparent: a fully transparent cursor is an invisible one.
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_RGBX, &[0x33, 0x22, 0x11, 0x00], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_BGRX, &[0x11, 0x22, 0x33, 0x00], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_XRGB, &[0x00, 0x33, 0x22, 0x11], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_XBGR, &[0x00, 0x11, 0x22, 0x33], 1, 1, 4).unwrap(),
            vec![0x33, 0x22, 0x11, 0xff]
        );
    }

    #[test]
    fn bitmap_rows_are_read_with_their_stride_and_bad_input_is_refused() {
        // Two rows of one pixel, with two bytes of padding between them.
        let padded = [1u8, 2, 3, 4, 0xff, 0xff, 5, 6, 7, 8];
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_RGBA, &padded, 1, 2, 6).unwrap(),
            vec![1, 2, 3, 4, 5, 6, 7, 8]
        );
        // A stride too small to hold a row, a buffer that stops short, a size that
        // is not a cursor, and a format that is not a bitmap: refused rather than
        // guessed at, because the alternative is reading past the end.
        assert!(to_rgba(SPA_VIDEO_FORMAT_RGBA, &padded, 2, 1, 4).is_none());
        assert!(to_rgba(SPA_VIDEO_FORMAT_RGBA, &[1, 2, 3], 1, 1, 4).is_none());
        assert!(to_rgba(
            SPA_VIDEO_FORMAT_RGBA,
            &[0; 16],
            MAX_BITMAP_DIMENSION + 1,
            1,
            0
        )
        .is_none());
        assert!(to_rgba(0, &padded, 1, 2, 6).is_none());
        // A zero stride means tightly packed, which is what some compositors send.
        assert_eq!(
            to_rgba(SPA_VIDEO_FORMAT_RGBA, &[9, 8, 7, 6], 1, 1, 0).unwrap(),
            vec![9, 8, 7, 6]
        );
    }

    /// One meta region, aligned, so the offsets can be laid out the way a
    /// compositor lays them out.
    #[repr(align(8))]
    struct Region([u8; 256]);

    /// Builds a buffer whose cursor meta sits at `bitmap_offset`, with a bitmap at
    /// that offset when one is asked for. Returns the buffer plus the pieces that
    /// have to stay alive for it to be readable.
    fn buffer_with_cursor_meta(
        bitmap_offset: u32,
        with_bitmap: bool,
    ) -> (Box<Region>, Box<[SpaMeta; 1]>, spa::sys::spa_buffer) {
        const META_SIZE: usize = 128;
        const BITMAP_OFFSET: usize = 32;

        let mut region = Box::new(Region([0u8; 256]));
        let base = region.0.as_mut_ptr();
        unsafe {
            let cursor = base as *mut SpaMetaCursor;
            (*cursor).id = 7;
            (*cursor).position = SpaPoint { x: 100, y: 200 };
            (*cursor).hotspot = SpaPoint { x: 3, y: 4 };
            (*cursor).bitmap_offset = bitmap_offset;

            if with_bitmap && bitmap_offset as usize == BITMAP_OFFSET {
                let bitmap = base.add(BITMAP_OFFSET) as *mut SpaMetaBitmap;
                (*bitmap).format = SPA_VIDEO_FORMAT_BGRA;
                (*bitmap).width = 2;
                (*bitmap).height = 1;
                (*bitmap).stride = 8;
                (*bitmap).offset = std::mem::size_of::<SpaMetaBitmap>() as u32;
                let pixels = base.add(BITMAP_OFFSET + std::mem::size_of::<SpaMetaBitmap>());
                std::ptr::copy_nonoverlapping(
                    [0x11u8, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0x80].as_ptr(),
                    pixels,
                    8,
                );
            }
        }

        let metas = Box::new([SpaMeta {
            type_: SPA_META_CURSOR,
            size: META_SIZE as u32,
            data: base as *mut std::ffi::c_void,
        }]);
        let mut buffer: spa::sys::spa_buffer = unsafe { std::mem::zeroed() };
        buffer.n_metas = 1;
        buffer.metas = metas.as_ptr() as *mut _;
        (region, metas, buffer)
    }

    #[test]
    fn the_bitmap_is_found_at_the_offsets_the_portal_uses() {
        // The offsets in the SPA cursor ABI are the part most likely to be silently
        // wrong, so they are pinned here rather than by whichever desktop happens to
        // work first.
        let (region, metas, mut buffer) = buffer_with_cursor_meta(32, true);
        let meta = unsafe { read_cursor_meta(&mut buffer) }.expect("a cursor meta");
        assert_eq!(
            (meta.x, meta.y),
            (103.0, 204.0),
            "position + hotspot is the tip"
        );
        assert_eq!(meta.id, 7);
        assert_eq!((meta.hot_x, meta.hot_y), (3, 4));

        let bitmap = meta.bitmap.expect("the bitmap");
        assert_eq!((bitmap.width, bitmap.height), (2, 1));
        assert_eq!(bitmap.format, SPA_VIDEO_FORMAT_BGRA);
        assert_eq!(
            to_rgba(
                bitmap.format,
                &bitmap.bytes,
                bitmap.width,
                bitmap.height,
                bitmap.stride
            )
            .unwrap(),
            vec![0x33, 0x22, 0x11, 0xff, 0x66, 0x55, 0x44, 0x80]
        );
        drop((region, metas));
    }

    #[test]
    fn a_cursor_meta_without_a_bitmap_reports_the_position_alone() {
        // `bitmap_offset` 0 is how a compositor says the image has not changed; the
        // position is still good, and the samples keep referring to the last shape.
        let (_region, _metas, mut buffer) = buffer_with_cursor_meta(0, false);
        let meta = unsafe { read_cursor_meta(&mut buffer) }.expect("a cursor meta");
        assert!(meta.bitmap.is_none());
        assert_eq!((meta.x, meta.y), (103.0, 204.0));
    }

    #[test]
    fn a_bitmap_offset_that_points_nowhere_is_ignored() {
        // Past the end of the meta region: refuse rather than read another buffer's
        // memory as a pointer image.
        let (_region, _metas, mut buffer) = buffer_with_cursor_meta(4096, false);
        let meta = unsafe { read_cursor_meta(&mut buffer) }.expect("a cursor meta");
        assert!(meta.bitmap.is_none());
    }

    #[test]
    fn a_null_buffer_has_no_cursor() {
        assert!(unsafe { read_cursor_meta(std::ptr::null_mut()) }.is_none());
    }

    #[test]
    fn the_negotiated_frame_rate_is_what_ffmpeg_is_told() {
        // Declaring the wrong rate would stretch or squash the whole recording.
        assert_eq!(
            negotiated_fps(spa::utils::Fraction { num: 60, denom: 1 }, 30),
            60
        );
        assert_eq!(
            negotiated_fps(spa::utils::Fraction { num: 30, denom: 1 }, 30),
            30
        );
        assert_eq!(
            negotiated_fps(
                spa::utils::Fraction {
                    num: 30000,
                    denom: 1001
                },
                30
            ),
            30
        );
    }

    #[test]
    fn an_implausible_rate_falls_back_to_what_we_asked_for() {
        assert_eq!(
            negotiated_fps(spa::utils::Fraction { num: 0, denom: 0 }, 30),
            30
        );
        assert_eq!(
            negotiated_fps(spa::utils::Fraction { num: 0, denom: 1 }, 30),
            30
        );
        assert_eq!(
            negotiated_fps(
                spa::utils::Fraction {
                    num: 100000,
                    denom: 1
                },
                30
            ),
            30
        );
    }
}
