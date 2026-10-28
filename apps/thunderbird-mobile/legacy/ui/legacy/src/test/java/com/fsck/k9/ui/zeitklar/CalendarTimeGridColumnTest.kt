package com.fsck.k9.ui.zeitklar

import android.view.View
import android.widget.TextView
import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.testing.RobolectricTest
import org.junit.Test
import org.robolectric.RuntimeEnvironment

class CalendarTimeGridColumnTest : RobolectricTest() {
    @Test
    fun appointmentsAreVisibleOnFirstMeasureAndStayInTheirLanesAfterResize() {
        val context = RuntimeEnvironment.getApplication()
        val testSubject = CalendarTimeGridColumn(context)
        val first = TextView(context)
        val second = TextView(context)
        testSubject.addAppointment(first, 20, 60, 0, 2)
        testSubject.addAppointment(second, 20, 60, 1, 2)
        for (width in listOf(360, 180, 420)) {
            testSubject.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY))
            testSubject.layout(0, 0, width, 600)
            assertThat(first.width > 10).isEqualTo(true)
            assertThat(first.right <= second.left).isEqualTo(true)
            assertThat(second.right <= width).isEqualTo(true)
            assertThat(first.top).isEqualTo(20)
            assertThat(first.height).isEqualTo(60)
        }
    }
}
