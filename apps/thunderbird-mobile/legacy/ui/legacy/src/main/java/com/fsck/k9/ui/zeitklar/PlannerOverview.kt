package com.fsck.k9.ui.zeitklar

import java.time.LocalDate

internal enum class PlannerOverviewKind { OVERDUE, DAY, UNDATED, NEXT_DAY }
internal data class PlannerOverviewSection(
    val kind: PlannerOverviewKind,
    val date: LocalDate?,
    val tasks: List<PlannerTask>,
    val mails: List<PlannerMailReference>,
)

internal fun plannerOverview(
    tasks: List<PlannerTask>,
    mails: List<PlannerMailReference>,
    selected: LocalDate,
    today: LocalDate,
): List<PlannerOverviewSection> {
    val todayKey = today.toString()
    fun overdue(date: String?, done: Boolean) = !done && date != null && date < todayKey
    return listOf(
        PlannerOverviewSection(PlannerOverviewKind.OVERDUE, null,
            tasks.filter { overdue(it.dueDate, it.done) }, mails.filter { overdue(it.dueDate, it.done) }),
        PlannerOverviewSection(PlannerOverviewKind.DAY, selected,
            tasks.filter { it.dueDate == selected.toString() && !overdue(it.dueDate, it.done) },
            mails.filter { it.dueDate == selected.toString() && !overdue(it.dueDate, it.done) }),
        PlannerOverviewSection(PlannerOverviewKind.UNDATED, null,
            tasks.filter { it.dueDate == null }, mails.filter { it.dueDate == null }),
        PlannerOverviewSection(PlannerOverviewKind.NEXT_DAY, selected.plusDays(1),
            tasks.filter { it.dueDate == selected.plusDays(1).toString() && !overdue(it.dueDate, it.done) },
            mails.filter { it.dueDate == selected.plusDays(1).toString() && !overdue(it.dueDate, it.done) }),
    )
}
