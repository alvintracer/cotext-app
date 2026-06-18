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
        // NOTE: We intentionally exclude IME (keyboard) insets here because
        // android:windowSoftInputMode="adjustResize" already resizes the WebView
        // when the keyboard appears. Including IME insets would double the offset.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
                return windowInsets;
            });
        }
    }
}
