package net.thunderbird.feature.calendar

import android.content.ComponentName
import android.content.Context
import android.content.Intent

object NativeCalendarSetup {
    const val SETTINGS = "calendarAdvancedSettings"
    const val EMAIL = "calendarAccountEmail"
    fun intent(context: Context, email: String = "", settingsIntent: Intent? = null): Intent = Intent().setComponent(
        ComponentName(context.packageName, "net.thunderbird.feature.calendar.internal.NativeCalendarActivity"),
    ).putExtra(EMAIL, email).putExtra(SETTINGS, settingsIntent)
}
