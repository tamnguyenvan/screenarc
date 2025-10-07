// Wallpapers
export const WALLPAPERS = [
  {imageUrl: 'wallpapers/images/wallpaper-0001.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0001.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0002.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0002.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0003.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0003.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0004.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0004.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0005.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0005.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0006.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0006.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0007.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0007.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0008.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0008.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0009.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0009.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0010.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0010.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0011.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0011.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0012.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0012.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0013.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0013.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0014.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0014.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0015.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0015.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0016.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0016.jpg'},
  {imageUrl: 'wallpapers/images/wallpaper-0017.jpg', thumbnailUrl: 'wallpapers/thumbnails/wallpaper-0017.jpg'},
]
export const WALLPAPERS_THUMBNAILS = WALLPAPERS.map(w => w.thumbnailUrl);

// Resolutions
export const RESOLUTIONS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
};

// Application-wide constants
export const APP = {
  LAST_PRESET_ID_KEY: 'screenarc_lastActivePresetId',
};

// Timeline specific constants
export const TIMELINE = {
  MINIMUM_REGION_DURATION: 0.1, // 100ms
  REGION_DELETE_THRESHOLD: 0.05, // 50ms - Regions smaller than this on mouse up are deleted.
};

// Zoom and Pan specific constants
export const ZOOM = {
  DEFAULT_SPEED: 'Mellow',
  SPEED_OPTIONS: {
    Slow: 1.5,
    Mellow: 1.0,
    Quick: 0.7,
    Rapid: 0.4,
  },
  DEFAULT_LEVEL: 2.0, // Default zoom level when adding a new region
  DEFAULT_DURATION: 3.0, // Default duration when adding a new region
  DEFAULT_EASING: 'easeInOutQuint',
  
  // --- Auto-Zoom Generation ---
  AUTO_ZOOM_PRE_CLICK_OFFSET: 1.5, // Time to start zoom before the first click
  AUTO_ZOOM_POST_CLICK_PADDING: 0.9, // Time to hold zoom after the last click
  AUTO_ZOOM_MIN_DURATION: 3.0, // Minimum duration for an auto-generated zoom region
  PAN_EASING: 'easeInOutQuint', // Easing function for pan transitions
  
};