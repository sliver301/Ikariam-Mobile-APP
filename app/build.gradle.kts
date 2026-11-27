plugins {
    id("com.android.application")
}

android {
    namespace = "com.islam.ikariamtouch"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.islam.ikariamtouch"
        minSdk = 31
        targetSdk = 34
        versionCode = 5
        versionName = "1.17.6.1.1"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    // The developer's own phone: the game's original logo as the app icon. It lives in src/personal
    // (never in the repository) and stays out of public builds (build_public.bat sets IKM_PUBLIC).
    if (System.getenv("IKM_PUBLIC") == null && file("src/personal/res").exists()) {
        sourceSets.getByName("debug").res.srcDir("src/personal/res")
    }
}
