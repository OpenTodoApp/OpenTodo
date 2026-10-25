import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    // Kotlin is built into the Android Gradle Plugin from 9.0; no kotlin-android plugin.
    id("com.android.application")
}

// The release version comes from the tag (OPENTODO_VERSION=0.10.0 in CI); local builds say "dev".
val appVersion: String = (System.getenv("OPENTODO_VERSION") ?: "0.0.0-dev").removePrefix("v")
val versionParts = Regex("""^(\d+)\.(\d+)\.(\d+)""").find(appVersion)?.destructured?.toList()?.map { it.toInt() } ?: listOf(0, 0, 0)

// Release signing only when CI provides a keystore (secrets); never committed.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.opentodo"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.opentodo"
        minSdk = 26
        targetSdk = 35
        versionCode = (versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]).coerceAtLeast(1)
        versionName = appVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        warningsAsErrors = false
        abortOnError = true
        // Translations are checked by checkTranslations (six languages, every key).
        disable += setOf("MissingTranslation", "GradleDependency", "OldTargetApi")
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    // AndroidX only (native-shells D8): checkDependencies fails on anything else at runtime.
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.webkit:webkit:1.18.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("androidx.biometric:biometric:1.1.0")
    testImplementation("junit:junit:4.13.2")
    // org.json on the JVM for unit tests (Android provides it on devices).
    testImplementation("org.json:json:20260814")
    // Instrumented tests on the emulator (CI's android job): test-only, never in the app.
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test.espresso:espresso-intents:3.6.1")
    // A local OpenTodo stand-in (health check, pages, the share screen), plain and with a self-signed certificate.
    androidTestImplementation("com.squareup.okhttp3:mockwebserver:5.5.0")
    androidTestImplementation("com.squareup.okhttp3:okhttp-tls:5.5.0")
}

/** Fails when the runtime classpath holds an artifact that is not AndroidX, Kotlin or Google's Android support. */
tasks.register("checkDependencies") {
    group = "verification"
    description = "Fails on a runtime dependency that is not AndroidX (no third-party SDK)."
    doLast {
        val allowed = listOf("androidx.", "org.jetbrains.kotlin", "org.jetbrains.kotlinx", "org.jetbrains:annotations", "com.google.guava:listenablefuture", "org.jspecify")
        val bad = configurations.getByName("releaseRuntimeClasspath").resolvedConfiguration.resolvedArtifacts
            .map { "${it.moduleVersion.id.group}:${it.moduleVersion.id.name}" }
            .filter { coord -> allowed.none { coord.startsWith(it) } }
            .distinct()
        if (bad.isNotEmpty()) throw GradleException("Only AndroidX may ship in the app (native-shells D8): $bad")
    }
}

/** Every language has every key of the default strings.xml. */
tasks.register("checkTranslations") {
    group = "verification"
    doLast {
        val res = file("src/main/res")
        val keys = { f: File -> Regex("""<string name="([^"]+)"""").findAll(f.readText()).map { it.groupValues[1] }.toSet() }
        val base = keys(File(res, "values/strings.xml"))
        val langs = listOf("de", "es", "fr", "it", "pt")
        val problems = langs.flatMap { lang ->
            val f = File(res, "values-$lang/strings.xml")
            if (!f.exists()) listOf("$lang: missing file") else (base - keys(f)).map { "$lang: missing $it" }
        }
        if (problems.isNotEmpty()) throw GradleException("Translations incomplete: $problems")
    }
}

/** The permissions the store listings declare match the manifest's. */
tasks.register("checkStoreMetadata") {
    group = "verification"
    doLast {
        val manifest = Regex("""<uses-permission android:name="android\.permission\.([A-Z_]+)"""")
            .findAll(file("src/main/AndroidManifest.xml").readText()).map { it.groupValues[1] }.toSortedSet()
        val declared = rootProject.file("store/permissions.txt").readLines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }.toSortedSet()
        if (manifest != declared) throw GradleException("store/permissions.txt $declared does not match the manifest $manifest")
        val langs = listOf("en", "de", "es", "fr", "it", "pt")
        val missing = langs.filter { !rootProject.file("store/listing/$it.txt").exists() }
        if (missing.isNotEmpty()) throw GradleException("Store listing missing for $missing")
    }
}
