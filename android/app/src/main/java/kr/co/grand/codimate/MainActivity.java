package kr.co.grand.codimate;

import com.getcapacitor.BridgeActivity;
import android.view.MotionEvent;
import android.view.KeyEvent;

public class MainActivity extends BridgeActivity {
  private boolean stylusKeyDown = false;
  private boolean stylusErasing = false;

  private void publishStylus(boolean held) {
    if (stylusErasing == held) return;
    stylusErasing = held;
    if (getBridge() != null && getBridge().getWebView() != null)
      getBridge().getWebView().evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('codimate:stylus',{detail:{erasing:" + held + "}}))", null);
  }

  private boolean isStylus(MotionEvent event) {
    for (int i = 0; i < event.getPointerCount(); i++) {
      int tool = event.getToolType(i);
      if (tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER) return true;
    }
    return false;
  }

  private boolean buttonHeld(MotionEvent event) {
    return stylusKeyDown || (event.getButtonState() &
      (MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY)) != 0 ||
      event.getToolType(event.getActionIndex()) == MotionEvent.TOOL_TYPE_ERASER;
  }

  @Override public boolean dispatchTouchEvent(MotionEvent event) {
    if (!isStylus(event)) return super.dispatchTouchEvent(event);
    boolean held = event.getActionMasked() != MotionEvent.ACTION_CANCEL && buttonHeld(event);
    publishStylus(held);
    if (!held) return super.dispatchTouchEvent(event);
    // Some WebView versions omit Android's stylus-only 32/64 button masks.
    // Preserve the pen tool, coordinates and pressure, and also provide the
    // secondary-button bit that Chromium maps to PointerEvent.buttons=2.
    int count = event.getPointerCount();
    MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
    MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
    for (int i = 0; i < count; i++) {
      properties[i] = new MotionEvent.PointerProperties();
      coords[i] = new MotionEvent.PointerCoords();
      event.getPointerProperties(i, properties[i]);
      event.getPointerCoords(i, coords[i]);
    }
    int buttons = (event.getButtonState() & ~(MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY)) | MotionEvent.BUTTON_SECONDARY;
    MotionEvent translated = MotionEvent.obtain(event.getDownTime(), event.getEventTime(), event.getAction(), count,
      properties, coords, event.getMetaState(), buttons, event.getXPrecision(), event.getYPrecision(),
      event.getDeviceId(), event.getEdgeFlags(), event.getSource(), event.getFlags());
    try { return super.dispatchTouchEvent(translated); }
    finally { translated.recycle(); }
  }

  @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
    if (isStylus(event)) {
      if (event.getActionMasked() == MotionEvent.ACTION_HOVER_EXIT) publishStylus(false);
      else publishStylus(buttonHeld(event));
    }
    return super.dispatchGenericMotionEvent(event);
  }

  @Override public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getKeyCode() == KeyEvent.KEYCODE_STYLUS_BUTTON_PRIMARY || event.getKeyCode() == KeyEvent.KEYCODE_STYLUS_BUTTON_SECONDARY) {
      stylusKeyDown = event.getAction() == KeyEvent.ACTION_DOWN;
      publishStylus(stylusKeyDown);
    }
    return super.dispatchKeyEvent(event);
  }

  @Override public void onWindowFocusChanged(boolean focused) {
    super.onWindowFocusChanged(focused);
    if (!focused) { stylusKeyDown = false; publishStylus(false); }
  }

  @Override public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(ClinicDevicePlugin.class);
    // APKs ship their own web assets. Retire the web PWA cache from older APKs,
    // without touching patient drafts in IndexedDB, localStorage or the Keystore.
    bridgeBuilder.addWebViewListener(new com.getcapacitor.WebViewListener() {
      private boolean checked=false;
      @Override public void onPageLoaded(android.webkit.WebView view) {
        if(checked) return;
        checked=true;
        view.evaluateJavascript("(async()=>{if(location.origin!=='https://localhost'||!('serviceWorker' in navigator))return;const r=await navigator.serviceWorker.getRegistrations();if(!r.length)return;await Promise.all(r.map(x=>x.unregister()));if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('workbox-')).map(k=>caches.delete(k)));}location.reload();})().catch(()=>{})",null);
      }
    });
    super.onCreate(savedInstanceState);
    getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() {
        getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('codimate:back'))", null);
      }
    });
    getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE,android.view.WindowManager.LayoutParams.FLAG_SECURE);
  }
}
