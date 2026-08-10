package cz.filmzor.tv

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * FilmZor pre Android TV — tenký WebView wrapper okolo existujúcej React appky.
 * Navigácia šípkami/diaľkovým ovládaním je riešená priamo v JS appke
 * (useSpatialNavigation hook), WebView D-pad eventy len prirodzene prepúšťa ďalej.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val appUrl = "https://filmzor-react.filmzor-react.workers.dev"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        webView.webViewClient = WebViewClient()
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.requestFocus()

        webView.loadUrl(appUrl)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
