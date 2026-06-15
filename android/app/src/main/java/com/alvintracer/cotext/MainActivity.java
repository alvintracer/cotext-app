package com.alvintracer.cotext;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable edge-to-edge: WebView extends behind status bar & nav bar
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
