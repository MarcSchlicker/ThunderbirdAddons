plugins { id(ThunderbirdPlugins.Library.androidCompose) }
android {
    namespace = "net.thunderbird.feature.calendar.internal"
    compileOptions { isCoreLibraryDesugaringEnabled = true }
}
dependencies {
    coreLibraryDesugaring(libs.android.desugar.nio)
    implementation(projects.feature.calendar.api)
    implementation(projects.core.calendar.api)
    implementation(projects.core.common)
    implementation(projects.core.ui.theme.api)
    implementation(libs.appauth)
    implementation("org.mnode.ical4j:ical4j:4.3.0")
    implementation(libs.androidx.work.runtime)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    testImplementation(projects.core.android.testing)
    testImplementation(libs.ktor.client.mock)
    androidTestImplementation(libs.androidx.test.ext.junit.ktx)
    androidTestImplementation(libs.androidx.test.runner)
}
