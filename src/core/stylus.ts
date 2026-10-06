/** Some Android WebViews report a pressed S-Pen as buttons=1. The native
 * bridge supplies the missing button state; touch and mouse never use it. */
export function stylusErasing(
  event: { pointerType: string; buttons: number; button: number },
  nativeHeld = false,
) {
  return (
    event.pointerType === "pen" && (nativeHeld || !!(event.buttons & (2 | 32)))
  );
}
