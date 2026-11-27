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
        versionCode = 3
        versionName = "1.17.6.1"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
}
