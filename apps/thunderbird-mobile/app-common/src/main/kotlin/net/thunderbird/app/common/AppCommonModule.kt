package net.thunderbird.app.common

import com.fsck.k9.legacyCommonAppModules
import com.fsck.k9.legacyCoreModules
import com.fsck.k9.legacyUiModules
import net.thunderbird.app.common.account.appCommonAccountModule
import net.thunderbird.app.common.activity.DefaultActivityProvider
import net.thunderbird.app.common.appConfig.AndroidPlatformConfigProvider
import net.thunderbird.app.common.core.appCommonCoreModule
import net.thunderbird.app.common.feature.appCommonFeatureModule
import net.thunderbird.app.common.startup.appCommonStartupModule
import net.thunderbird.core.android.common.activity.ActivityProvider
import net.thunderbird.core.calendar.CalDavClientFactory
import net.thunderbird.core.calendar.internal.DefaultCalDavClientFactory
import net.thunderbird.core.common.appConfig.PlatformConfigProvider
import net.thunderbird.core.common.oauth.OAuthConfigurationProvider
import net.thunderbird.feature.calendar.GOOGLE_CALENDAR_OAUTH_CONFIGURATION
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import net.thunderbird.feature.calendar.internal.GoogleCalendarAuthorization
import net.thunderbird.feature.calendar.internal.NativeCalendarViewModel
import org.koin.android.ext.koin.androidApplication
import org.koin.core.module.Module
import org.koin.core.module.dsl.viewModel
import org.koin.core.qualifier.named
import org.koin.dsl.module

val appCommonModule: Module = module {
    includes(legacyCommonAppModules)
    includes(legacyCoreModules)
    includes(legacyUiModules)
    single<CalDavClientFactory> { DefaultCalDavClientFactory() }
    viewModel { NativeCalendarViewModel(get()) }
    single<NativeGoogleCalendar> {
        GoogleCalendarAuthorization(
            androidApplication(),
            getOrNull<OAuthConfigurationProvider>(named(GOOGLE_CALENDAR_OAUTH_CONFIGURATION))
                ?: OAuthConfigurationProvider { null },
            get(),
        )
    }

    includes(
        appCommonAccountModule,
        appCommonCoreModule,
        appCommonFeatureModule,
        appCommonStartupModule,
    )

    single<PlatformConfigProvider> { AndroidPlatformConfigProvider() }
    single<ActivityProvider>(createdAtStart = true) {
        DefaultActivityProvider(
            application = androidApplication(),
            logger = get(),
        )
    }
}
