package cz.filmzor.tv

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity

/**
 * FilmZor pre Android TV — tenký WebView wrapper okolo existujúcej React appky.
 * Navigácia šípkami/diaľkovým ovládaním je riešená priamo v JS appke
 * (useSpatialNavigation hook), WebView D-pad eventy len prirodzene prepúšťa ďalej.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var rootLayout: FrameLayout

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private val appUrl = "https://filmzor-react.filmzor-react.workers.dev"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Bez WebChromeClient WebView spoľahlivo nevykresľuje <video> snímky
        // (niektoré Android verzie prehrajú len zvuk / nič) a fullscreen API
        // (playerContainerRef.requestFullscreen() v MovieModal.jsx) nemá kam
        // vykresliť svoj custom view — preto ho appka predtým nikdy nezobrazila.
        rootLayout = FrameLayout(this)
        setContentView(rootLayout)

        webView = WebView(this)
        rootLayout.addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                webView.visibility = View.GONE
                rootLayout.addView(view, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
            }

            override fun onHideCustomView() {
                val view = customView ?: return
                rootLayout.removeView(view)
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                webView.visibility = View.VISIBLE
            }
        }
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.requestFocus()

        // Umožňuje pripojiť sa cez chrome://inspect (z počítača v tej istej sieti
        // cez `adb connect`) a vidieť reálne console/network chyby priamo z TV —
        // bez toho sa problémy s prehrávaním na TV dali ladiť len naslepo.
        // LEN v debug builde — v release by to inak nechalo WebView (vrátane
        // session cookie/JS) inšpekovateľný komukoľvek s adb prístupom k
        // zariadeniu. `BuildConfig.DEBUG` tu nie je dostupné bez zapnutia
        // `buildFeatures.buildConfig` (AGP 8+ ho defaultne vypína), preto
        // runtime FLAG_DEBUGGABLE — funguje bez zmeny Gradle konfigurácie a
        // správne odráža, či bol tento konkrétny APK zostavený ako debug.
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (isDebuggable) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.loadUrl(appUrl)
    }

    override fun onBackPressed() {
        if (customView != null) {
            webView.webChromeClient?.onHideCustomView()
        } else if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
