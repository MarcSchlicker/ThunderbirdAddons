plugins { id(ThunderbirdPlugins.Library.android) }
android { namespace = "net.thunderbird.feature.calendar.api" }
dependencies { api(projects.core.calendar.api) }
