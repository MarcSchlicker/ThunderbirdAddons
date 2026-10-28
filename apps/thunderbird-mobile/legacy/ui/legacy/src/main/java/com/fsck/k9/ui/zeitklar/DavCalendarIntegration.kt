package com.fsck.k9.ui.zeitklar

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Public DAVx5 intent contract, verified against upstream v4.5.21-ose. No OAuth tokens cross this boundary. */
internal object DavCalendarIntegration {
    const val PACKAGE = "at.bitfire.davdroid"
    const val ACCOUNT_TYPE = "bitfire.at.davdroid"
    private const val LOGIN_ACTIVITY = "at.bitfire.davdroid.ui.setup.LoginActivity"
    private const val ACCOUNTS_ACTIVITY = "at.bitfire.davdroid.ui.AccountsActivity"
    private const val DOWNLOAD = "https://github.com/bitfireAT/davx5-ose/releases"

    fun installed(context: Context): Boolean = loginIntent("").resolveActivity(context.packageManager) != null

    // GoogleLogin is deliberately selected inside DAVx5: upstream exposes no Google-specific intent extra.
    fun loginIntent(email: String): Intent = Intent(Intent.ACTION_MAIN)
        .setComponent(ComponentName(PACKAGE, LOGIN_ACTIVITY))
        .putExtra("username", email)

    fun accountsIntent(): Intent = Intent(Intent.ACTION_MAIN).setComponent(ComponentName(PACKAGE, ACCOUNTS_ACTIVITY))

    fun downloadIntent(): Intent = Intent(Intent.ACTION_VIEW, Uri.parse(DOWNLOAD))
}
