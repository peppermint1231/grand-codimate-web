package kr.co.grand.codimate;

import org.junit.Test;
import static org.junit.Assert.*;

public class StylusButtonsTest {
  private boolean interceptedByChromium(int buttons) {
    // Chromium's StylusTextSelector::ShouldStartTextSelection for TOOL_TYPE_STYLUS.
    return buttons == 2 || buttons == 32;
  }

  @Test public void editorAvoidsChromiumConsumingTheWholePenGesture() {
    for (int original : new int[]{2, 32}) {
      assertTrue(interceptedByChromium(original));
      int forwarded = StylusButtons.forWebView(original, true);
      assertFalse(interceptedByChromium(forwarded));
      assertEquals(0, forwarded);
    }
    assertEquals(0, StylusButtons.forWebView(64, true));
  }

  @Test public void preservesOtherButtonsAndNormalInputOutsideTheEditor() {
    assertEquals(1, StylusButtons.forWebView(1 | 32, true));
    assertEquals(8, StylusButtons.forWebView(8 | 64, true));
    assertEquals(0, StylusButtons.forWebView(0, true));
    for (int original : new int[]{0, 1, 2, 32, 64, 3})
      assertEquals(original, StylusButtons.forWebView(original, false));
  }
}
