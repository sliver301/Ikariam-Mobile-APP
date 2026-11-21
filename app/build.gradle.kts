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
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
}
