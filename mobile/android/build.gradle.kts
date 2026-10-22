plugins {
    id("com.android.application") version "9.4.1" apply false
    // Not applied: AGP 9 builds Kotlin itself. Declared here only to pin the Kotlin compiler version it uses.
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
}
