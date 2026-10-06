package kr.co.grand.codimate;

/** Android button masks, kept separate so the native handoff can be tested on the JVM. */
final class StylusButtons {
  static final int SECONDARY = 2;
  static final int STYLUS_PRIMARY = 32;
  static final int STYLUS_SECONDARY = 64;

  static int forWebView(int buttons, boolean editing) {
    // Chromium StylusTextSelector consumes the entire DOWN/MOVE/UP sequence
    // when the native button state is exactly SECONDARY or STYLUS_PRIMARY.
    // Send the eraser state separately, and retain ordinary pen-tip events.
    return editing ? buttons & ~(SECONDARY | STYLUS_PRIMARY | STYLUS_SECONDARY) : buttons;
  }
}
