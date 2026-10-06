/** Pointer Events: pen barrel button (2) or eraser end (32); never mouse right-click. */
export function stylusErasing(event: {
  pointerType: string;
  buttons: number;
  button: number;
}) {
  return event.pointerType === "pen" && !!(event.buttons & (2 | 32));
}
