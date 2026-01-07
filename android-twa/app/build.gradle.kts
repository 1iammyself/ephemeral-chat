plugins {
    id("com.android.application") version "8.3.2"
    id("org.jetbrains.kotlin.android") version "1.9.23"
}

android {
    namespace = "com.ephemeralchat.twa"
    compileSdk = 34

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.ephemeralchat.twa"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // URL your TWA will open.
        // Change this if you deploy under a different domain.
        buildConfigField(
            "String",
            "TWA_LAUNCH_URL",
            "\"https://ephemeral-chat-7j66.onrender.com/\""
        )

        // Used by AndroidX Browser to generate `assetlinks.json` verification statements.
        manifestPlaceholders["assetStatements"] = "[{\"relation\":[\"delegate_permission/common.handle_all_urls\"],\"target\":{\"namespace\":\"web\",\"site\":\"https://ephemeral-chat-7j66.onrender.com\"}}]"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")

    // AndroidX Browser contains Trusted Web Activity support.
    implementation("androidx.browser:browser:1.8.0")
}
