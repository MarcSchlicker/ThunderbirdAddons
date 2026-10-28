package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.view.View
import android.widget.FrameLayout

/** Sizes appointment lanes during measurement, including the first frame and later resizes. */
internal class CalendarTimeGridColumn(context: Context) : FrameLayout(context) {
    fun addAppointment(view: View, top: Int, height: Int, lane: Int, lanes: Int) {
        require(lanes > 0 && lane in 0 until lanes)
        addView(view, AppointmentLayoutParams(height, lane, lanes).apply { topMargin = top })
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val available = (MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight).coerceAtLeast(0)
        val gap = resources.displayMetrics.density.toInt().coerceAtLeast(1)
        for (index in 0 until childCount) {
            val parameters = getChildAt(index).layoutParams as? AppointmentLayoutParams ?: continue
            val start = available * parameters.lane / parameters.lanes
            val end = available * (parameters.lane + 1) / parameters.lanes
            parameters.width = (end - start - gap).coerceAtLeast(1)
            parameters.leftMargin = start
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    private class AppointmentLayoutParams(height: Int, val lane: Int, val lanes: Int) : LayoutParams(0, height)
}
