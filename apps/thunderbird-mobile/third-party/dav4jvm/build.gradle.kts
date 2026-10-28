plugins {
    alias(libs.plugins.kotlin.jvm)
    `java-library`
}

kotlin {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
}
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    api(libs.kotlinx.coroutines.core)
    api(libs.ktor.client.core)
    compileOnly("org.ogce:xpp3:1.1.6")
    api("com.github.spotbugs:spotbugs-annotations:4.10.4")
    implementation("com.google.guava:guava:33.7.1-jre")
    implementation("io.ktor:ktor-client-auth:3.5.2")
    implementation("io.ktor:ktor-client-encoding:3.5.2")
}
