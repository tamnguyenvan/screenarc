// --- Windows API Constants for Cursor Management ---
export const WIN_API = {
  SPI_SETCURSORS: 0x57,
  SPIF_UPDATEINIFILE: 0x01,
  SPIF_SENDCHANGE: 0x02,
  // This is an undocumented value that seems to be necessary to reload cursor theme size.
  // Found through reverse engineering and community forums.
  SPI_SETCURSORSIZE_UNDOCUMENTED: 0x2029, 
};

// --- Mouse Button Codes ---
export const MOUSE_BUTTONS = {
  WINDOWS: {
    LEFT: 1,
    RIGHT: 2,
    MIDDLE: 3,
  },
  LINUX_X11_MASK: {
    LEFT: 256,
    MIDDLE: 512,
    RIGHT: 1024,
  },
};