package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.MenuItem
import android.view.Menu
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import androidx.core.graphics.ColorUtils
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.card.MaterialCardView
import com.google.android.material.color.MaterialColors
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Central place for pairing and checking module desktops. Keeping this outside
 * of the planner makes the connection usable by every current and future module.
 */
class ModuleConnectionsActivity : BaseActivity() {
    private lateinit var store: PlannerMobileStore
    private var plannerState = PlannerMobileState.empty()
    private var selectedConnectionId: String? = null
    private var startAdd = false
    private var synchronizationRunning = false
    private val exportSettings = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri != null) transferSettings(uri, importing = false)
    }
    private val importSettings = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) transferSettings(uri, importing = true)
    }
    private val pairingCodeScanner = registerForActivityResult(PairingQrCodeScannerActivityContract()) { result ->
        when {
            result?.useManualCode == true -> showManualCodeDialog()
            result?.pairingCode != null -> connect(result.pairingCode)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_module_connections)
        store = PlannerMobileStore(applicationContext)
        plannerState = store.load()
        selectedConnectionId = intent.getStringExtra(EXTRA_CONNECTION_ID)
        startAdd = intent.getBooleanExtra(EXTRA_START_ADD, false)
        ModuleBackgroundSync.schedule(applicationContext)

        supportActionBar?.apply {
            title = getString(
                when {
                    selectedConnectionId != null -> R.string.zeitklar_connection_settings_title
                    startAdd -> R.string.zeitklar_connection_new_title
                    else -> R.string.zeitklar_connections_title
                },
            )
            setDisplayHomeAsUpEnabled(true)
        }

        if (selectedConnectionId != null) {
            findViewById<TextView>(R.id.zeitklar_connections_heading).text =
                getString(R.string.zeitklar_connection_settings_title)
            findViewById<TextView>(R.id.zeitklar_connections_description).text =
                getString(R.string.zeitklar_connection_modules_description)
            findViewById<View>(R.id.zeitklar_connections_scan).visibility = View.GONE
            findViewById<View>(R.id.zeitklar_connections_manual).visibility = View.GONE
            findViewById<View>(R.id.zeitklar_connections_nextcloud_card).visibility = View.GONE
            findViewById<View>(R.id.zeitklar_connections_check).visibility = View.GONE
            findViewById<View>(R.id.zeitklar_connections_modules_heading).visibility = View.VISIBLE
            findViewById<View>(R.id.zeitklar_connections_modules_description).visibility = View.VISIBLE
            findViewById<View>(R.id.zeitklar_connections_module_list).visibility = View.VISIBLE
        } else if (startAdd) {
            findViewById<TextView>(R.id.zeitklar_connections_heading).text =
                getString(R.string.zeitklar_connection_new_title)
        }

        findViewById<View>(R.id.zeitklar_connections_scan).setOnClickListener { scanPairingCode() }
        findViewById<View>(R.id.zeitklar_connections_manual).setOnClickListener { showManualCodeDialog() }
        findViewById<View>(R.id.zeitklar_connections_nextcloud).setOnClickListener { showNextcloudDialog() }
        findViewById<View>(R.id.zeitklar_connections_check).setOnClickListener { synchronize(showResult = true) }
        render()
    }

    override fun onResume() {
        super.onResume()
        plannerState = store.load()
        render()
        val pending = store.pendingNextcloudLogin()
        if (pending != null) {
            completeNextcloudLogin(pending.first, pending.second)
        } else if (!nextcloudLoginRunning.get()) {
            synchronize(showResult = false)
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_EXPORT_SETTINGS, 0, R.string.tb_connect_settings_export)
        menu.add(0, MENU_IMPORT_SETTINGS, 1, R.string.tb_connect_settings_import)
        TbDiagnosticsActivity.addMenu(menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        TbDiagnosticsActivity.MENU_ID -> {
            TbDiagnosticsActivity.open(this)
            true
        }
        MENU_EXPORT_SETTINGS -> {
            exportSettings.launch("tb-connect-settings.json")
            true
        }
        MENU_IMPORT_SETTINGS -> {
            importSettings.launch(arrayOf("application/json", "text/plain"))
            true
        }
        android.R.id.home -> {
            finish()
            true
        }

        else -> super.onOptionsItemSelected(item)
    }

    private fun transferSettings(uri: Uri, importing: Boolean) {
        lifecycleScope.launch {
            val preferences = getSharedPreferences(ModuleSettingsTransfer.PREFERENCES, Context.MODE_PRIVATE)
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    if (importing) {
                        val bytes = requireNotNull(contentResolver.openInputStream(uri)).use { input ->
                            input.readBytesLimited(ModuleSettingsTransfer.MAX_BYTES)
                        }
                        val root = JSONObject(bytes.toString(Charsets.UTF_8))
                        require(root.optString("format") == ModuleSettingsTransfer.FORMAT)
                        val values = root.getJSONObject("calendar")
                        val sanitized = ModuleSettingsTransfer.sanitize(
                            values.keys().asSequence().associateWith { values.get(it) },
                        )
                        require(sanitized.isNotEmpty())
                        sanitized
                    } else {
                        val payload = JSONObject().put("format", ModuleSettingsTransfer.FORMAT)
                            .put("calendar", JSONObject(ModuleSettingsTransfer.sanitize(
                                mapOf("week_starts_sunday" to false, "large_month_text" to false) + preferences.all,
                            )))
                        requireNotNull(contentResolver.openOutputStream(uri, "wt")).bufferedWriter().use {
                            it.write(payload.toString(2))
                        }
                        emptyMap()
                    }
                }
            }
            result.onSuccess { values ->
                if (importing) {
                    AlertDialog.Builder(this@ModuleConnectionsActivity)
                        .setTitle(R.string.tb_connect_settings_import)
                        .setMessage(R.string.tb_connect_settings_import_confirm)
                        .setNegativeButton(android.R.string.cancel, null)
                        .setPositiveButton(android.R.string.ok) { _, _ ->
                            preferences.edit().apply {
                                values.forEach { (key, value) ->
                                    when (value) {
                                        is Boolean -> putBoolean(key, value)
                                        is String -> putString(key, value)
                                    }
                                }
                            }.apply()
                            Toast.makeText(
                                this@ModuleConnectionsActivity, R.string.tb_connect_settings_done, Toast.LENGTH_LONG,
                            ).show()
                        }.show()
                } else {
                    Toast.makeText(
                        this@ModuleConnectionsActivity, R.string.tb_connect_settings_done, Toast.LENGTH_LONG,
                    ).show()
                }
            }.onFailure {
                Toast.makeText(
                    this@ModuleConnectionsActivity, R.string.tb_connect_settings_failed, Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(SETTINGS_BUFFER_SIZE)
        while (true) {
            val count = read(buffer)
            if (count < 0) return output.toByteArray()
            require(output.size() + count <= limit)
            output.write(buffer, 0, count)
        }
    }

    private fun render() {
        val summary = findViewById<TextView>(R.id.zeitklar_connections_summary)
        val vpn = PlannerMobileStore.isVpnActive(applicationContext)
        findViewById<TextView>(R.id.zeitklar_connections_vpn_status).apply {
            text = getString(if (vpn) R.string.zeitklar_connections_vpn_active else R.string.zeitklar_connections_vpn_inactive)
        }
        renderNextcloudConnection()
        val list = findViewById<LinearLayout>(R.id.zeitklar_connections_list)
        list.removeAllViews()

        val connections = plannerState.connections.filter {
            selectedConnectionId == null || it.id == selectedConnectionId
        }
        if (connections.isEmpty()) {
            summary.text = getString(R.string.zeitklar_connections_no_desktop)
            renderModuleConnections(null)
            return
        }

        val reachable = connections.count { connection ->
            connection.lastAttemptAt != null &&
                connection.lastMobileSyncAt != null &&
                connection.lastError.isNullOrBlank()
        }
        summary.text = getString(R.string.zeitklar_connection_reachability, reachable, connections.size)
        connections.forEach { connection -> list.addView(connectionRow(connection)) }
        renderModuleConnections(connections.firstOrNull())
    }

    private fun renderNextcloudConnection() {
        val nextcloud = plannerState.connections.firstOrNull { it.mode == PlannerConnection.Mode.NEXTCLOUD }
        val status = findViewById<TextView>(R.id.zeitklar_connections_nextcloud_status)
        val action = findViewById<Button>(R.id.zeitklar_connections_nextcloud)
        if (store.pendingNextcloudLogin() != null) {
            status.text = getString(R.string.zeitklar_nextcloud_login_waiting)
            action.text = getString(R.string.zeitklar_connections_nextcloud_reconnect)
            return
        }
        if (nextcloud == null) {
            status.text = getString(R.string.zeitklar_connections_nextcloud_not_configured)
            status.setTextColor(MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.DKGRAY))
            action.text = getString(R.string.zeitklar_connections_nextcloud)
            return
        }
        status.text = connectionStatusText(nextcloud)
        val statusColor = when {
            isReachable(nextcloud) -> Color.rgb(31, 122, 68)
            !nextcloud.lastError.isNullOrBlank() -> Color.rgb(190, 49, 49)
            else -> MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.DKGRAY)
        }
        status.setTextColor(statusColor)
        action.text = getString(R.string.zeitklar_connections_nextcloud_reconnect)
    }

    private fun connectionRow(connection: PlannerConnection): View {
        val reachable = isReachable(connection)
        val statusColor = if (reachable) Color.rgb(31, 122, 68) else Color.rgb(190, 49, 49)
        val surface = MaterialColors.getColor(this, com.google.android.material.R.attr.colorSurface, Color.WHITE)
        return MaterialCardView(this).apply {
            radius = dp(20).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            strokeColor = statusColor
            setCardBackgroundColor(ColorUtils.blendARGB(surface, statusColor, 0.11f))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(12) }
            addView(LinearLayout(this@ModuleConnectionsActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))
                addView(TextView(this@ModuleConnectionsActivity).apply {
                    text = connection.name
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                    setTextColor(statusColor)
                })
                addView(TextView(this@ModuleConnectionsActivity).apply {
                    text = connectionStatusText(connection)
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                    setPadding(0, dp(5), 0, 0)
                })
                addView(TextView(this@ModuleConnectionsActivity).apply {
                    text = connection.endpoint
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                    setPadding(0, dp(5), 0, 0)
                })
                addView(Button(this@ModuleConnectionsActivity).apply {
                    text = getString(R.string.zeitklar_connection_remove)
                    minHeight = 0
                    minimumHeight = 0
                    setOnClickListener { confirmRemoveConnection(connection) }
                })
            })
        }
    }

    private fun renderModuleConnections(connection: PlannerConnection?) {
        if (selectedConnectionId == null) return
        val container = findViewById<LinearLayout>(R.id.zeitklar_connections_module_list)
        container.removeAllViews()
        if (connection == null) return
        val reachable = isReachable(connection)
        val knownModules = buildList {
            add(Triple("daily-planner", getString(R.string.zeitklar_daily_planner_title), true))
            plannerState.mobileModules
                .filter { it.entry != "daily-planner" }
                .sortedBy { it.name.lowercase() }
                .forEach { add(Triple(it.entry, it.name, it.packageStatus == "Installiert")) }
        }
        knownModules.forEach { (entry, name, installed) ->
            val moduleConnected = reachable && installed
            val color = if (moduleConnected) Color.rgb(31, 122, 68) else Color.rgb(190, 49, 49)
            val detail = when {
                !installed -> getString(R.string.zeitklar_connection_module_not_installed)
                moduleConnected -> getString(R.string.zeitklar_connection_module_online)
                else -> getString(R.string.zeitklar_connection_module_offline)
            }
            container.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(ColorUtils.setAlphaComponent(color, 24))
                    setStroke(dp(1), color)
                    cornerRadius = dp(16).toFloat()
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(10) }
                addView(TextView(this@ModuleConnectionsActivity).apply {
                    text = name
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleSmall)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(TextView(this@ModuleConnectionsActivity).apply {
                    text = detail
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelMedium)
                    setTextColor(color)
                    contentDescription = "$entry: $detail"
                })
            })
        }
    }

    private fun confirmRemoveConnection(connection: PlannerConnection) {
        AlertDialog.Builder(this)
            .setTitle(R.string.zeitklar_connection_remove)
            .setMessage(getString(R.string.zeitklar_connection_remove_confirm, connection.name))
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.zeitklar_connection_remove) { _, _ -> removeConnection(connection.id) }
            .show()
    }

    private fun removeConnection(connectionId: String) {
        plannerState = plannerState.withoutConnection(connectionId)
        store.save(plannerState)
        render()
        Toast.makeText(this, R.string.zeitklar_connection_removed, Toast.LENGTH_SHORT).show()
        if (selectedConnectionId != null) finish()
    }

    private fun scanPairingCode() {
        pairingCodeScanner.launch(Unit)
    }

    private fun showManualCodeDialog() {
        val input = EditText(this).apply {
            hint = getString(R.string.zeitklar_pairing_code_hint)
            minLines = 3
            setSingleLine(false)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.zeitklar_connect_desktop)
            .setMessage(R.string.zeitklar_pairing_code_explanation)
            .setView(input)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.zeitklar_connect_action) { _, _ -> connect(input.text.toString()) }
            .show()
    }

    private fun showNextcloudDialog() {
        val fields = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(8), dp(24), 0)
        }
        fun field(hint: Int, type: Int, value: String = ""): EditText = EditText(this).apply {
            this.hint = getString(hint)
            inputType = type
            setText(value)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) }
            fields.addView(this)
        }
        val server = field(
            R.string.zeitklar_nextcloud_server_hint,
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
            "https://",
        )
        val folder = field(R.string.zeitklar_nextcloud_folder_hint, InputType.TYPE_CLASS_TEXT, "Thunderbird")
        AlertDialog.Builder(this)
            .setTitle(R.string.zeitklar_nextcloud_title)
            .setMessage(R.string.zeitklar_nextcloud_description)
            .setView(fields)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.zeitklar_nextcloud_login) { _, _ ->
                connectNextcloudWithBrowser(
                    serverUrl = server.text.toString(),
                    appFolder = folder.text.toString(),
                )
            }
            .show()
    }

    private fun connectNextcloudWithBrowser(serverUrl: String, appFolder: String) {
        Thread {
            try {
                val login = PlannerSyncClient.startNextcloudLogin(serverUrl)
                store.saveNextcloudLogin(login, appFolder)
                runOnUiThread {
                    render()
                    Toast.makeText(this, R.string.zeitklar_nextcloud_login_started, Toast.LENGTH_LONG).show()
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(login.loginUrl)))
                }
                completeNextcloudLogin(login, appFolder)
            } catch (error: Exception) {
                Log.e(LOG_TAG, "Nextcloud-Anmeldung konnte nicht gestartet werden", error)
                runOnUiThread { showError(error) }
            }
        }.start()
    }

    private fun completeNextcloudLogin(login: PlannerSyncClient.NextcloudLoginFlow, appFolder: String) {
        if (!nextcloudLoginRunning.compareAndSet(false, true)) return
        Thread {
            var authorizedConnection: PlannerConnection? = null
            val attemptedAt = now()
            try {
                val credentials = PlannerSyncClient.waitForNextcloudLogin(login)
                val connection = PlannerSyncClient.nextcloudConnection(
                    serverUrl = credentials.serverUrl,
                    username = credentials.username,
                    appPassword = credentials.appPassword,
                    appFolder = appFolder,
                )
                authorizedConnection = connection
                // Nextcloud returns the app password only once. Persist it before
                // WebDAV or module synchronization can fail or the process stops.
                plannerState = store.load().withConnection(connection)
                store.save(plannerState)
                store.clearNextcloudLogin()
                runOnUiThread { render() }
                val result = PlannerSyncClient.sync(applicationContext, plannerState, connection)
                plannerState = store.mergeModuleSync(
                    store.mergeRemotePayload(store.load(), result.remotePayload),
                    result,
                ).withConnection(
                    connection.copy(
                        endpoint = result.endpoint ?: connection.endpoint,
                        workspaceId = result.workspaceId ?: connection.workspaceId,
                        lastMobileSyncAt = attemptedAt,
                        lastDesktopSyncAt = result.desktopSyncAt,
                        lastAttemptAt = attemptedAt,
                        lastError = null,
                    ),
                )
                store.save(plannerState)
                runOnUiThread {
                    render()
                    Toast.makeText(this, R.string.zeitklar_connected_success, Toast.LENGTH_LONG).show()
                    if (startAdd) finish()
                }
            } catch (error: Exception) {
                Log.e(LOG_TAG, "Nextcloud-Einrichtung fehlgeschlagen", error)
                val connection = authorizedConnection
                if (connection != null) {
                    plannerState = store.load().withConnection(
                        connection.copy(lastAttemptAt = attemptedAt, lastError = connectionErrorText(error)),
                    )
                    store.save(plannerState)
                } else if (System.currentTimeMillis() - login.startedAt >= 20 * 60 * 1000L) {
                    store.clearNextcloudLogin()
                }
                runOnUiThread {
                    render()
                    showError(error)
                }
            } finally {
                nextcloudLoginRunning.set(false)
            }
        }.start()
    }

    private fun connect(pairingCode: String) {
        Thread {
            val attemptedAt = now()
            try {
                val connection = PlannerSyncClient.connectionFromPairingCode(pairingCode)
                Log.i(LOG_TAG, "Starte QR-Kopplung zu ${connection.endpoint} (${connection.fallbackEndpoints.size} Alternativen)")
                val result = PlannerSyncClient.sync(applicationContext, plannerState, connection)
                plannerState = store.mergeModuleSync(
                    store.mergeRemotePayload(plannerState, result.remotePayload),
                    result,
                ).withConnection(
                    connection.copy(
                        endpoint = result.endpoint ?: connection.endpoint,
                        token = result.pairedToken ?: connection.token,
                        workspaceId = result.workspaceId ?: connection.workspaceId,
                        lastMobileSyncAt = attemptedAt,
                        lastDesktopSyncAt = result.desktopSyncAt,
                        lastAttemptAt = attemptedAt,
                        lastError = null,
                    ),
                )
                store.save(plannerState)
                runOnUiThread {
                    render()
                    Toast.makeText(this, R.string.zeitklar_connected_success, Toast.LENGTH_LONG).show()
                    if (startAdd) finish()
                }
            } catch (error: Exception) {
                Log.e(LOG_TAG, "QR-Kopplung fehlgeschlagen", error)
                runOnUiThread { showError(error) }
            }
        }.start()
    }

    private fun synchronize(showResult: Boolean) {
        if (synchronizationRunning) return
        val targets = plannerState.connections.filter {
            selectedConnectionId == null || it.id == selectedConnectionId
        }
        if (targets.isEmpty()) return
        synchronizationRunning = true
        findViewById<TextView>(R.id.zeitklar_connections_progress).apply {
            text = getString(R.string.zeitklar_connection_checking)
            visibility = View.VISIBLE
        }
        Thread {
            var latest = plannerState
            var failures = 0
            var recovered = false
            targets.forEach { original ->
                val connection = latest.connections.firstOrNull { it.id == original.id } ?: original
                val attemptedAt = now()
                try {
                    val result = PlannerSyncClient.sync(applicationContext, latest, connection)
                    recovered = recovered || (result.endpoint != null && result.endpoint != connection.endpoint)
                    latest = store.mergeModuleSync(
                        store.mergeRemotePayload(latest, result.remotePayload),
                        result,
                    ).withConnection(
                        connection.copy(
                            endpoint = result.endpoint ?: connection.endpoint,
                            token = result.pairedToken ?: connection.token,
                            workspaceId = result.workspaceId ?: connection.workspaceId,
                            lastMobileSyncAt = attemptedAt,
                            lastDesktopSyncAt = result.desktopSyncAt,
                            lastAttemptAt = attemptedAt,
                            lastError = null,
                        ),
                    )
                } catch (error: Exception) {
                    failures += 1
                    latest = latest.withConnection(
                        connection.copy(lastAttemptAt = attemptedAt, lastError = connectionErrorText(error)),
                    )
                }
            }
            plannerState = latest
            store.save(plannerState)
            runOnUiThread {
                synchronizationRunning = false
                findViewById<TextView>(R.id.zeitklar_connections_progress).visibility = View.GONE
                render()
                if (showResult) {
                    val message = if (failures == 0) getString(R.string.zeitklar_sync_success)
                    else getString(R.string.zeitklar_sync_partial, failures)
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                }
                if (recovered) Toast.makeText(this, R.string.zeitklar_connection_recovered, Toast.LENGTH_LONG).show()
            }
        }.start()
    }

    private fun showError(error: Exception) {
        Toast.makeText(this, getString(R.string.zeitklar_sync_error, connectionErrorText(error)), Toast.LENGTH_LONG).show()
    }

    private fun connectionStatusText(connection: PlannerConnection): String = when {
        connection.mode == PlannerConnection.Mode.NEXTCLOUD && !connection.lastError.isNullOrBlank() -> getString(
            R.string.zeitklar_nextcloud_sync_unreachable,
            connection.name,
            connection.lastError,
        )

        connection.mode == PlannerConnection.Mode.NEXTCLOUD && connection.lastAttemptAt != null && connection.lastMobileSyncAt != null -> getString(
            R.string.zeitklar_nextcloud_sync_reachable,
            connection.name,
            formatTimestamp(connection.lastMobileSyncAt),
            formatTimestamp(connection.lastDesktopSyncAt),
        )

        connection.mode == PlannerConnection.Mode.NEXTCLOUD -> getString(
            R.string.zeitklar_nextcloud_sync_pending,
            connection.name,
        )

        !connection.lastError.isNullOrBlank() -> getString(
            R.string.zeitklar_desktop_sync_unreachable,
            connection.name,
            connection.lastError,
        )

        connection.lastAttemptAt != null && connection.lastMobileSyncAt != null -> getString(
            R.string.zeitklar_desktop_sync_reachable,
            connection.name,
            formatTimestamp(connection.lastMobileSyncAt),
            formatTimestamp(connection.lastDesktopSyncAt),
        )

        else -> getString(R.string.zeitklar_desktop_sync_pending, connection.name)
    }

    private fun isReachable(connection: PlannerConnection): Boolean =
        connection.lastAttemptAt != null && connection.lastMobileSyncAt != null && connection.lastError.isNullOrBlank()

    private fun connectionErrorText(error: Exception): String {
        val detail = (error.message ?: "").replace(Regex("\\s+"), " ").trim()
        return when {
            detail.contains("unexpected", ignoreCase = true) -> getString(R.string.zeitklar_connection_error_unexpected)
            detail.contains("ungültiger kopplungscode", ignoreCase = true) ->
                getString(R.string.zeitklar_connection_error_expired_code)
            detail.contains("timed out", ignoreCase = true) || detail.contains("refused", ignoreCase = true) ->
                getString(R.string.zeitklar_connection_error_unreachable)

            detail.isEmpty() -> getString(R.string.zeitklar_connection_error_unreachable)
            else -> detail.take(160)
        }
    }

    private fun formatTimestamp(value: String?): String {
        val instant = PlannerMobileStore.parseTimestamp(value) ?: return getString(R.string.zeitklar_never)
        return DateTimeFormatter.ofPattern("dd.MM. HH:mm").withZone(java.time.ZoneId.systemDefault()).format(instant)
    }

    private fun now(): String = java.time.Instant.now().toString()

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val LOG_TAG = "TBConnectPairing"
        private const val MENU_EXPORT_SETTINGS = 101
        private const val MENU_IMPORT_SETTINGS = 102
        private const val SETTINGS_BUFFER_SIZE = 4_096
        private const val EXTRA_CONNECTION_ID = "connectionId"
        private const val EXTRA_START_ADD = "startAdd"
        private val nextcloudLoginRunning = AtomicBoolean(false)

        fun intent(context: Context, connectionId: String? = null, startAdd: Boolean = false): Intent =
            Intent(context, ModuleConnectionsActivity::class.java).apply {
                putExtra(EXTRA_CONNECTION_ID, connectionId)
                putExtra(EXTRA_START_ADD, startAdd)
            }
    }
}
