package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.LifecycleOwner
import com.fsck.k9.ui.base.BaseActivity
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.multi.qrcode.QRCodeMultiReader
import net.thunderbird.components.ui.bolt.atom.Surface
import net.thunderbird.components.ui.bolt.atom.button.ButtonText
import net.thunderbird.components.ui.bolt.atom.text.TextBodyLarge
import net.thunderbird.components.ui.bolt.atom.text.TextBodyMedium
import net.thunderbird.components.ui.bolt.atom.text.TextTitleLarge
import net.thunderbird.core.ui.theme.api.FeatureThemeProvider
import org.koin.android.ext.android.inject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Scanner used exclusively for the short-lived TB-Connect module pairing payload. */
class PairingQrCodeScannerActivity : BaseActivity() {
    private val themeProvider: FeatureThemeProvider by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            themeProvider.WithTheme {
                PairingQrCodeScannerScreen(
                    onPairingCodeScanned = ::finishWithPairingCode,
                    onUseManualCode = ::finishForManualCode,
                    onCancel = ::finish,
                )
            }
        }
    }

    private fun finishWithPairingCode(pairingCode: String) {
        setResult(RESULT_OK, Intent().putExtra(EXTRA_PAIRING_CODE, pairingCode))
        finish()
    }

    private fun finishForManualCode() {
        setResult(RESULT_OK, Intent().putExtra(EXTRA_USE_MANUAL_CODE, true))
        finish()
    }

    companion object {
        const val EXTRA_PAIRING_CODE = "com.fsck.k9.ui.zeitklar.PAIRING_CODE"
        const val EXTRA_USE_MANUAL_CODE = "com.fsck.k9.ui.zeitklar.USE_MANUAL_CODE"
    }
}

data class PairingQrCodeScanResult(
    val pairingCode: String?,
    val useManualCode: Boolean,
)

class PairingQrCodeScannerActivityContract : ActivityResultContract<Unit, PairingQrCodeScanResult?>() {
    override fun createIntent(context: Context, input: Unit): Intent =
        Intent(context, PairingQrCodeScannerActivity::class.java)

    override fun parseResult(resultCode: Int, intent: Intent?): PairingQrCodeScanResult? {
        if (resultCode != Activity.RESULT_OK || intent == null) return null
        return PairingQrCodeScanResult(
            pairingCode = intent.getStringExtra(PairingQrCodeScannerActivity.EXTRA_PAIRING_CODE),
            useManualCode = intent.getBooleanExtra(PairingQrCodeScannerActivity.EXTRA_USE_MANUAL_CODE, false),
        )
    }
}

@Composable
private fun PairingQrCodeScannerScreen(
    onPairingCodeScanned: (String) -> Unit,
    onUseManualCode: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    if (!hasCameraPermission) {
        PairingPermissionContent(onUseManualCode = onUseManualCode, onCancel = onCancel)
    } else {
        PairingCameraContent(
            onPairingCodeScanned = onPairingCodeScanned,
            onUseManualCode = onUseManualCode,
            onCancel = onCancel,
        )
    }
}

@Composable
private fun PairingPermissionContent(onUseManualCode: () -> Unit, onCancel: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TextTitleLarge(text = "Kamerazugriff benötigt")
            TextBodyLarge(
                text = "Erlaube den Kamerazugriff, um den QR-Code aus dem TB-Connect Modul-Hub zu scannen. Alternativ kannst du zurückgehen und den Code manuell eingeben.",
                modifier = Modifier.padding(top = 12.dp),
            )
            ButtonText(
                text = "Code eingeben",
                onClick = onUseManualCode,
                modifier = Modifier.padding(top = 20.dp),
            )
            ButtonText(text = "Abbrechen", onClick = onCancel)
        }
    }
}

@Composable
private fun PairingCameraContent(
    onPairingCodeScanned: (String) -> Unit,
    onUseManualCode: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as Activity
    val lifecycleOwner = context as LifecycleOwner
    val completed = remember { AtomicBoolean(false) }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FIT_CENTER } }

    DisposableEffect(Unit) {
        onDispose { executor.shutdown() }
    }
    LaunchedEffect(Unit) {
        val provider = ProcessCameraProvider.awaitInstance(context)
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(executor, PairingQrCodeAnalyzer { value ->
            if (value.startsWith("tb-connect://pair?") && completed.compareAndSet(false, true)) {
                activity.runOnUiThread { onPairingCodeScanned(value) }
            }
        })
        provider.unbindAll()
        provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
    }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                factory = { previewView },
                modifier = Modifier.fillMaxWidth().weight(1f),
            )
            Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                TextTitleLarge(text = "QR-Code scannen")
                TextBodyMedium(
                    text = "Richte die Kamera auf den QR-Code im TB-Connect Modul-Hub. Der Code gilt nur fünf Minuten.",
                    modifier = Modifier.padding(top = 6.dp),
                )
                ButtonText(
                    text = "Code eingeben",
                    onClick = onUseManualCode,
                    modifier = Modifier.padding(top = 12.dp),
                )
                ButtonText(text = "Abbrechen", onClick = onCancel)
            }
        }
    }
}

private class PairingQrCodeAnalyzer(
    private val onCodeScanned: (String) -> Unit,
) : ImageAnalysis.Analyzer {
    private val reader = QRCodeMultiReader()

    override fun analyze(image: ImageProxy) {
        try {
            val plane = image.planes.firstOrNull() ?: return
            val buffer = plane.buffer
            val data = ByteArray(buffer.remaining()).also { buffer.get(it) }
            val dataWidth = image.width + ((plane.rowStride - plane.pixelStride * image.width) / plane.pixelStride)
            val source = PlanarYUVLuminanceSource(data, dataWidth, image.height, 0, 0, image.width, image.height, false)
            val bitmap = BinaryBitmap(HybridBinarizer(source))
            reader.decodeMultiple(bitmap, DECODER_HINTS).forEach { onCodeScanned(it.text) }
        } catch (_: NotFoundException) {
            // No code in this frame is the expected case.
        } catch (_: Exception) {
            // A malformed frame must not interrupt the camera preview.
        } finally {
            reader.reset()
            image.close()
        }
    }

    private companion object {
        val DECODER_HINTS = mapOf(
            DecodeHintType.CHARACTER_SET to "UTF-8",
            DecodeHintType.TRY_HARDER to true,
        )
    }
}
