package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import com.fsck.k9.ui.R
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

internal data class CalendarDayPlanEntry(
    val id: String,
    val title: String,
    val calendar: String,
    val color: Int,
    val allDay: Boolean,
    val startMinute: Int,
    val endMinute: Int,
    val location: String,
)

/** A screen-fitted day timeline and an optional unlimited agenda of the same selected sources. */
internal class CalendarDayPlanView(
    context: Context,
    date: LocalDate,
    private var entries: List<CalendarDayPlanEntry>,
    private val onOpen: (String) -> Unit,
    onCreate: () -> Unit,
    onClose: () -> Unit,
) : LinearLayout(context) {
    private val body = FrameLayout(context)
    private var timelineNeedsRebuild = true
    private val timeline = object : FrameLayout(context) {
        private var contentHeight = 0
        init { tag = "day-plan-timeline" }
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val available = View.MeasureSpec.getSize(heightMeasureSpec)
            if (available > 0 && (timelineNeedsRebuild || available != contentHeight)) {
                timelineNeedsRebuild = false
                contentHeight = available
                removeAllViews()
                addView(timelineContent(available), LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }
            super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        }
    }
    private val agenda = ScrollView(context).apply { tag = "day-plan-agenda"; visibility = View.GONE }

    init {
        orientation = VERTICAL
        tag = "day-plan-root"
        setBackgroundColor(ContextCompat.getColor(context, R.color.tb_calendar_surface))
        addView(TextView(context).apply {
            text = date.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM yyyy", Locale.getDefault()))
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleLarge)
            setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
            val inset = size(R.dimen.tb_calendar_nav_medium)
            setPadding(inset, inset, inset, inset)
        })
        addView(com.google.android.material.button.MaterialButtonToggleGroup(context).apply {
            isSingleSelection = true
            isSelectionRequired = true
            val timelineId = View.generateViewId()
            addView(MaterialButton(context).apply {
                id = timelineId
                styleButton()
                setText(R.string.tb_calendar_plan_timeline)
                tag = "day-plan-timeline-tab"
                setOnClickListener { timeline.visibility = VISIBLE; agenda.visibility = GONE }
            }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(MaterialButton(context).apply {
                id = View.generateViewId()
                styleButton()
                setText(R.string.tb_calendar_plan_agenda)
                tag = "day-plan-agenda-tab"
                setOnClickListener { timeline.visibility = GONE; agenda.visibility = VISIBLE }
            }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            check(timelineId)
        })
        body.addView(timeline, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        body.addView(agenda, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        addView(LinearLayout(context).apply {
            addView(MaterialButton(context).apply {
                styleButton()
                setText(R.string.tb_calendar_plan_close)
                setOnClickListener { onClose() }
            }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(MaterialButton(context).apply {
                styleButton()
                setText(R.string.tb_calendar_create_event)
                setOnClickListener { onCreate() }
            }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        })
        rebuild()

    }

    private fun MaterialButton.styleButton() {
        setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
        backgroundTintList = android.content.res.ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(ContextCompat.getColor(context, R.color.tb_calendar_accent_soft),
                ContextCompat.getColor(context, R.color.tb_calendar_surface)),
        )
        strokeColor = android.content.res.ColorStateList.valueOf(
            ContextCompat.getColor(context, R.color.tb_calendar_accent),
        )
        strokeWidth = size(R.dimen.tb_calendar_plan_line)
        isAllCaps = false
    }

    fun updateEntries(updated: List<CalendarDayPlanEntry>) {
        if (updated == entries) return
        entries = updated
        val agendaPosition = agenda.scrollY
        rebuild()
        agenda.post { agenda.scrollTo(0, agendaPosition) }
    }

    private fun rebuild() {
        rebuildTimeline()
        agenda.removeAllViews()
        agenda.addView(LinearLayout(context).apply {
            orientation = VERTICAL
            addView(heading(resources.getString(R.string.tb_calendar_plan_count, entries.size)))
            if (entries.isEmpty()) addView(heading(resources.getString(R.string.zeitklar_calendar_day_empty)))
            entries.sortedWith(compareBy<CalendarDayPlanEntry> { !it.allDay }.thenBy { it.startMinute })
                .forEach { addView(card(it, compact = false)) }
        })
    }

    private fun rebuildTimeline() {
        timelineNeedsRebuild = true
        timeline.requestLayout()
    }

    private fun timelineContent(height: Int): View = LinearLayout(context).apply {
        orientation = VERTICAL
        val allDay = entries.filter { it.allDay }
        val headerHeight = if (allDay.isEmpty()) 0 else {
            minOf(size(R.dimen.tb_calendar_nav_row), height / ALL_DAY_HEIGHT_DIVISOR)
        }
        if (allDay.isNotEmpty()) {
            addView(allDayHeader(allDay), LayoutParams(LayoutParams.MATCH_PARENT, headerHeight))
        }
        val bodyHeight = (height - headerHeight).coerceAtLeast(1)
        val row = LinearLayout(context)
        for (firstHour in listOf(0, HOURS_PER_HALF_DAY)) {
            fun offset(minute: Int): Int =
                ((minute - firstHour * MINUTES_PER_HOUR).coerceIn(0, MINUTES_PER_HALF_DAY).toLong() *
                    bodyHeight / MINUTES_PER_HALF_DAY).toInt()
            row.addView(LinearLayout(context).apply {
                orientation = VERTICAL
                for (hour in firstHour until firstHour + HOURS_PER_HALF_DAY) addView(TextView(context).apply {
                    text = "%02d".format(hour)
                    textSize = HOUR_LABEL_TEXT_SP
                    includeFontPadding = false
                    setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_muted))
                    gravity = Gravity.TOP or Gravity.END
                }, LayoutParams(LayoutParams.MATCH_PARENT,
                    offset((hour + 1) * MINUTES_PER_HOUR) - offset(hour * MINUTES_PER_HOUR)))
            }, LayoutParams(size(R.dimen.tb_calendar_plan_hours_width), bodyHeight))
            val canvas = CalendarTimeGridColumn(context).apply { tag = "day-plan-hours-$firstHour" }
            for (hour in firstHour until firstHour + HOURS_PER_HALF_DAY) {
                canvas.addView(View(context).apply {
                    setBackgroundColor(ContextCompat.getColor(context, R.color.tb_calendar_line))
                }, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, size(R.dimen.tb_calendar_plan_line)).apply {
                    topMargin = offset(hour * MINUTES_PER_HOUR)
                })
            }
            addTimedEntries(canvas, firstHour, bodyHeight)
            row.addView(canvas, LayoutParams(0, bodyHeight, 1f))
        }
        addView(row, LayoutParams(LayoutParams.MATCH_PARENT, bodyHeight))
    }

    private fun allDayHeader(allDay: List<CalendarDayPlanEntry>): View = LinearLayout(context).apply {
        orientation = HORIZONTAL
        allDay.take(MAX_ALL_DAY_CARDS).forEach { entry ->
            addView(TextView(context).apply {
                text = entry.title
                contentDescription = listOf(entry.title, entry.calendar, entry.location).joinToString(", ")
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(ColorUtils.blendARGB(ContextCompat.getColor(context,
                        R.color.tb_calendar_surface), entry.color, CARD_TINT))
                }
                maxLines = 2
                gravity = Gravity.CENTER_VERTICAL
                setPadding(size(R.dimen.tb_calendar_nav_small), 0, 0, 0)
                setOnClickListener { onOpen(entry.id) }
            }, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        }
    }

    private fun addTimedEntries(canvas: CalendarTimeGridColumn, firstHour: Int, bodyHeight: Int) {
        val windowStart = firstHour * MINUTES_PER_HOUR
        val timed = entries.filter { !it.allDay }.mapNotNull { entry ->
            CalendarMonthGrid.timeWindow(entry.startMinute, entry.endMinute, windowStart,
                windowStart + MINUTES_PER_HALF_DAY)?.let { entry to it }
        }.sortedBy { it.second.first }
        val lanes = CalendarMonthGrid.timeColumns(timed.map { it.second })
        timed.forEachIndexed { index, (entry, interval) ->
            val (start, end) = interval
            val (lane, count) = lanes[index]
            val top = ((start - windowStart).toLong() * bodyHeight / MINUTES_PER_HALF_DAY).toInt()
            val bottom = ((end - windowStart).toLong() * bodyHeight / MINUTES_PER_HALF_DAY).toInt()
            canvas.addAppointment(card(entry, compact = true), top, (bottom - top).coerceAtLeast(1), lane, count)
        }
    }

    private fun card(entry: CalendarDayPlanEntry, compact: Boolean): View = MaterialCardView(context).apply {
        strokeColor = entry.color
        strokeWidth = size(R.dimen.tb_calendar_plan_line)
        radius = size(R.dimen.tb_calendar_nav_small).toFloat()
        cardElevation = 0f
        setCardBackgroundColor(ColorUtils.blendARGB(
            ContextCompat.getColor(context, R.color.tb_calendar_surface), entry.color, CARD_TINT,
        ))
        contentDescription = listOf(entry.title, time(entry), entry.calendar, entry.location).joinToString(", ")
        isFocusable = true
        setOnClickListener { onOpen(entry.id) }
        addView(LinearLayout(context).apply {
            orientation = VERTICAL
            val inset = size(if (compact) R.dimen.tb_calendar_nav_tiny else R.dimen.tb_calendar_nav_inset)
            setPadding(inset, inset, inset, inset)
            addView(TextView(context).apply {
                text = time(entry)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelSmall)
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
            })
            addView(TextView(context).apply {
                text = entry.title
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
                if (compact) { maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END }
            })
            if (!compact) {
                val details = listOf(entry.calendar, entry.location).filter { it.isNotBlank() }.joinToString(" · ")
                addView(heading(details))
            }
        })
        if (!compact) layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            val inset = size(R.dimen.tb_calendar_nav_small)
            setMargins(inset, inset, inset, 0)
        }
    }

    private fun time(entry: CalendarDayPlanEntry): String = if (entry.allDay) {
        resources.getString(R.string.zeitklar_calendar_all_day)
    } else {
        "%02d:%02d – %02d:%02d".format(entry.startMinute / MINUTES_PER_HOUR, entry.startMinute % MINUTES_PER_HOUR,
            entry.endMinute / MINUTES_PER_HOUR, entry.endMinute % MINUTES_PER_HOUR)
    }

    private fun heading(value: String): TextView = TextView(context).apply {
        text = value
        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
        setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_muted))
        val inset = size(R.dimen.tb_calendar_nav_small)
        setPadding(inset, inset, inset, inset)
    }

    private fun size(id: Int): Int = resources.getDimensionPixelSize(id)

    private companion object {
        const val ALL_DAY_HEIGHT_DIVISOR = 4
        const val HOUR_LABEL_TEXT_SP = 10f
        const val MAX_ALL_DAY_CARDS = 3
        const val HOURS_PER_HALF_DAY = 12
        const val MINUTES_PER_HOUR = 60
        const val MINUTES_PER_HALF_DAY = HOURS_PER_HALF_DAY * MINUTES_PER_HOUR
        const val CARD_TINT = 0.08f
    }
}
