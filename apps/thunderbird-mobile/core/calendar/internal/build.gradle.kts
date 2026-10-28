plugins {
    id(ThunderbirdPlugins.Library.jvm)
}

dependencies {
    implementation(projects.core.calendar.api)
    implementation(project(":third-party:dav4jvm"))
    compileOnly("org.ogce:xpp3:1.1.6")
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    testImplementation(libs.ktor.client.mock)
    testRuntimeOnly("org.ogce:xpp3:1.1.6")
}
