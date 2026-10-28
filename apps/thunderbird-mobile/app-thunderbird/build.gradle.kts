plugins {
    id(ThunderbirdPlugins.App.androidCompose)
    alias(libs.plugins.dependency.guard)
    alias(libs.plugins.tb.app.badging)
    alias(libs.plugins.tb.app.versioning)
}

val testCoverageEnabled = providers
    .gradleProperty("testCoverageEnabled")
    .isPresent

// Keep the existing test installation/signature for on-device performance checks,
// without the runtime cost of Android's debuggable process.
val performanceBuild = providers.gradleProperty("tb.performanceBuild")
    .map(String::toBoolean)
    .orElse(false)

// Public OAuth client identifier, supplied by the TB-Connect project owner. No client secret in the APK.
val configuredGoogleCalendarClientId = providers.gradleProperty("tb.googleCalendarClientId")
    .orElse(providers.environmentVariable("TB_GOOGLE_CALENDAR_CLIENT_ID"))
val googleCalendarClientId = configuredGoogleCalendarClientId.orElse("").get()
// Public client registered for the existing test package/signing certificate; not a production client or secret.
val googleCalendarDebugClientId = configuredGoogleCalendarClientId
    .orElse("965975247401-eit8um39oh8g6tbknd55ttv0suk2tuds.apps.googleusercontent.com")
    .get()
require(
    googleCalendarClientId.isEmpty() ||
        googleCalendarClientId.matches(Regex("[0-9]+-[a-z0-9]+[.]apps[.]googleusercontent[.]com")),
) {
    "Invalid TB-Connect Google Calendar OAuth client ID"
}

val mailOAuthClientProperties = mapOf(
    "GOOGLE" to "Google",
    "MICROSOFT" to "Microsoft",
    "YAHOO" to "Yahoo",
    "AOL" to "Aol",
    "FASTMAIL" to "Fastmail",
    "THUNDERMAIL" to "Thundermail",
)
val mailOAuthClientIds = mailOAuthClientProperties.mapValues { (provider, property) ->
    providers.gradleProperty("tb.mail${property}ClientId")
        .orElse(providers.environmentVariable("TB_MAIL_${provider}_CLIENT_ID"))
        .orElse("")
        .get()
        .also { value ->
            require(value.isEmpty() || value.matches(Regex("[A-Za-z0-9._~+/=-]{1,1024}"))) {
                "Invalid TB-Connect $provider mail OAuth client ID"
            }
        }
}

android {
    namespace = "net.thunderbird.android"

    defaultConfig {
        applicationId = "eu.mschlicker.tbconnect"
        testApplicationId = "net.thunderbird.android.tests"

        versionCode = 62
        versionName = "2.0.61"

        buildConfigField("String", "GOOGLE_CALENDAR_CLIENT_ID", "\"$googleCalendarClientId\"")

        buildConfigField("String", "CLIENT_INFO_APP_NAME", "\"TB-Connect\"")
        mailOAuthClientIds.forEach { (provider, value) ->
            buildConfigField("String", "TB_MAIL_${provider}_CLIENT_ID", "\"$value\"")
        }
    }

    androidResources {
        // Keep in sync with the resource string array "supported_languages"
        localeFilters += listOf(
            "ar",
            "be",
            "bg",
            "br",
            "ca",
            "co",
            "cs",
            "cy",
            "da",
            "de",
            "el",
            "en",
            "en-rGB",
            "eo",
            "es",
            "et",
            "eu",
            "fa",
            "fi",
            "fr",
            "fy",
            "ga",
            "gd",
            "gl",
            "hr",
            "hu",
            "in",
            "is",
            "it",
            "iw",
            "ja",
            "ko",
            "lt",
            "lv",
            "nb",
            "nl",
            "nn",
            "pl",
            "pt-rBR",
            "pt-rPT",
            "ro",
            "ru",
            "sk",
            "sl",
            "sq",
            "sr",
            "sv",
            "ta-rIN",
            "tr",
            "uk",
            "vi",
            "zh-rCN",
            "zh-rTW",
        )
    }

    signingConfigs {
        val useUploadKey = providers.gradleProperty("tb.useUploadKey")
            .map(String::toBoolean)
            .orElse(true)
            .get()

        createSigningConfig(project, SigningType.TB_RELEASE, isUpload = useUploadKey)
        createSigningConfig(project, SigningType.TB_BETA, isUpload = useUploadKey)
        createSigningConfig(project, SigningType.TB_DAILY, isUpload = useUploadKey)
    }

    buildTypes {
        val isCI = providers.gradleProperty("ci")
            .map(String::toBoolean)
            .orElse(false)
        release {
            signingConfig = signingConfigs.getByType(SigningType.TB_RELEASE)

            isMinifyEnabled = !isCI.get()
            isShrinkResources = !isCI.get()
            isDebuggable = false

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )

            buildConfigField("String", "GLEAN_RELEASE_CHANNEL", "null")
        }

        create("beta") {
            initWith(getByName("release"))

            signingConfig = signingConfigs.getByType(SigningType.TB_BETA)

            applicationIdSuffix = ".beta"
            versionNameSuffix = "b0"

            isMinifyEnabled = isCI.get()
            isShrinkResources = isCI.get()
            isDebuggable = false

            matchingFallbacks += listOf("release")

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )

            buildConfigField("String", "GLEAN_RELEASE_CHANNEL", "\"beta\"")
        }

        create("daily") {
            initWith(getByName("release"))

            signingConfig = signingConfigs.getByType(SigningType.TB_DAILY)

            applicationIdSuffix = ".daily"
            versionNameSuffix = "a1"

            isMinifyEnabled = isCI.get()
            isShrinkResources = isCI.get()
            isDebuggable = false

            matchingFallbacks += listOf("release")

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )

            // See https://bugzilla.mozilla.org/show_bug.cgi?id=1918151
            buildConfigField("String", "GLEAN_RELEASE_CHANNEL", "\"nightly\"")
        }

        debug {
            buildConfigField("String", "GOOGLE_CALENDAR_CLIENT_ID", "\"$googleCalendarDebugClientId\"")
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-SNAPSHOT"

            enableUnitTestCoverage = testCoverageEnabled
            enableAndroidTestCoverage = testCoverageEnabled

            isMinifyEnabled = false
            isShrinkResources = false
            isDebuggable = !performanceBuild.get()

            buildConfigField("String", "GLEAN_RELEASE_CHANNEL", "null")
        }
    }

    flavorDimensions += listOf("app")
    productFlavors {
        create("foss") {
            dimension = "app"
            buildConfigField("String", "PRODUCT_FLAVOR_APP", "\"foss\"")
        }

        create("full") {
            dimension = "app"
            buildConfigField("String", "PRODUCT_FLAVOR_APP", "\"full\"")
        }
    }

    bundle {
        language {
            // Don't split by language. Otherwise our in-app language switcher won't work.
            enableSplit = false
        }
    }

    packaging {
        jniLibs {
            excludes += listOf("kotlin/**")
        }

        resources {
            excludes += listOf(
                "META-INF/*.kotlin_module",
                "kotlin/**",
                "DebugProbesKt.bin",
            )
        }
    }
}

androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.packaging.resources.excludes.addAll(
            "META-INF/*.version",
        )
    }
}

// Initialize placeholders for the product flavor and build type combinations needed for dependency declarations.
// They are required to avoid "Unresolved configuration" errors.
val fullDebugImplementation = configurations.create("fullDebugImplementation")
val fullDailyImplementation = configurations.create("fullDailyImplementation")
val fullBetaImplementation = configurations.create("fullBetaImplementation")
val fullReleaseImplementation = configurations.create("fullReleaseImplementation")

dependencies {
    implementation(projects.appCommon)
    implementation(projects.feature.calendar.api)
    implementation(projects.core.ui.compose.common)
    implementation(projects.core.ui.legacy.theme2.thunderbird)
    implementation(projects.feature.launcher)

    implementation(projects.legacy.core)
    implementation(projects.legacy.ui.legacy)

    implementation(projects.core.featureflag)

    implementation(projects.feature.account.settings.impl)
    implementation(projects.feature.mail.message.list.api)
    implementation(projects.feature.mail.message.list.internal)
    implementation(projects.feature.mail.message.reader.api)

    implementation(projects.feature.widget.messageList)
    implementation(projects.feature.widget.messageListGlance)
    implementation(projects.feature.widget.shortcut)
    implementation(projects.feature.widget.unread)

    debugImplementation(projects.feature.telemetry.noop)
    "dailyImplementation"(projects.feature.telemetry.noop)
    "betaImplementation"(projects.feature.telemetry.noop)
    releaseImplementation(projects.feature.telemetry.noop)

    implementation(libs.androidx.work.runtime)

    implementation(projects.feature.autodiscovery.api)
    debugImplementation(projects.backend.demo)
    "dailyImplementation"(projects.backend.demo)
    debugImplementation(projects.feature.autodiscovery.demo)
    "dailyImplementation"(projects.feature.autodiscovery.demo)

    "fossImplementation"(projects.feature.funding.link)

    fullDebugImplementation(projects.feature.funding.googleplay)
    fullDailyImplementation(projects.feature.funding.googleplay)
    fullBetaImplementation(projects.feature.funding.googleplay)
    fullReleaseImplementation(projects.feature.funding.googleplay)

    implementation(projects.feature.onboarding.migration.thunderbird)
    implementation(projects.feature.migration.launcher.thunderbird)
    implementation(projects.feature.thundermail.api)
    implementation(projects.feature.thundermail.thunderbird)

    // TODO remove once OAuth ids have been moved from TBD to TBA
    releaseImplementation(libs.appauth)

    // Required for DependencyInjectionTest
    testImplementation(projects.feature.account.api)
    testImplementation(projects.feature.account.common)
    testImplementation(projects.feature.thundermail.internal.common)
    testImplementation(projects.plugins.openpgpApiLib.openpgpApi)
    testImplementation(projects.feature.changelog.internal)

    testImplementation(libs.appauth)
    androidTestImplementation(libs.androidx.test.ext.junit.ktx)
    androidTestImplementation(libs.androidx.test.runner)
}

dependencyGuard {
    configuration("fossDailyRuntimeClasspath")
    configuration("fossBetaRuntimeClasspath")
    configuration("fossReleaseRuntimeClasspath")

    configuration("fullDailyRuntimeClasspath")
    configuration("fullBetaRuntimeClasspath")
    configuration("fullReleaseRuntimeClasspath")
}

tasks.register("printConfigurations") {
    doLast {
        configurations.forEach { configuration ->
            println("Configuration: ${configuration.name}")
            configuration.dependencies.forEach { dependency ->
                println("  - ${dependency.group}:${dependency.name}:${dependency.version}")
            }
        }
    }
}

codeCoverage {
    branchCoverage = 0
    lineCoverage = 25
}

// Keep existing test installations and their Android Keystore data separate from production.
androidComponents {
    onVariants(selector().withBuildType("debug")) { variant ->
        variant.applicationId.set("net.thunderbird.android.debug")
    }
}
