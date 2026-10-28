package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import java.time.LocalDate
import net.thunderbird.core.android.testing.RobolectricTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.robolectric.RuntimeEnvironment

class PlannerOverviewTest : RobolectricTest() {
    @Test
    fun datedOverdueAndPermanentDesktopMailsAndTasksHaveDistinctSections() {
        val today = LocalDate.of(2026, 10, 27)
        val dates = listOf(today.minusDays(1).toString(), today.toString(), null, today.plusDays(1).toString())
        val payload = JSONObject().put("tasks", JSONArray()).put("emails", JSONArray())
        dates.forEachIndexed { index, date ->
            payload.getJSONArray("tasks").put(JSONObject().put("id", "task-$index").put("text", "Task $index")
                .put("dueDate", date ?: JSONObject.NULL).put("done", false))
            payload.getJSONArray("emails").put(JSONObject().put("id", "mail-$index").put("subject", "Mail $index")
                .put("author", "Synthetic sender").put("dueDate", date ?: JSONObject.NULL).put("done", false))
        }
        val state = PlannerMobileState.empty().copy(payload = payload.toString())
        val store = PlannerMobileStore(RuntimeEnvironment.getApplication())
        val sections = plannerOverview(store.tasks(state), store.plannedEmailItems(state), today, today)
        assertThat(sections.map { it.kind }).isEqualTo(PlannerOverviewKind.entries)
        assertThat(sections.map { it.tasks.size }).isEqualTo(listOf(1, 1, 1, 1))
        assertThat(sections.map { it.mails.size }).isEqualTo(listOf(1, 1, 1, 1))
        assertThat(sections.flatMap { it.mails }.map { it.id }.toSet().size).isEqualTo(4)
        assertThat(store.plannedEmailReferences(state, null).single().title).isEqualTo("✉ Mail 2")
        assertThat(store.plannedEmailReferences(state, today.toString()).single().title).isEqualTo("✉ Mail 1")
    }
}
