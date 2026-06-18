package com.alvintracer.cotext;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Apply system bar insets as padding to the root content view.
        // This guarantees the WebView never renders behind the status bar
        // or navigation bar, even on Android 15+ where edge-to-edge is enforced.
        //
        // When the keyboard (IME) is visible, adjustResize already shrinks the
        // WebView. The navigation bar sits behind the keyboard, so its bottom
        // inset becomes an unnecessary gap. We zero bottom padding in that case.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
                int bottomPadding = imeVisible ? 0 : systemBars.bottom;
                v.setPadding(systemBars.left, systemBars.top, systemBars.right, bottomPadding);
                return windowInsets;
            });
        }
    }
}
