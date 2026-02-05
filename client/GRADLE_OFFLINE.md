Gradle wrapper offline workaround

If building Android fails because the Gradle wrapper cannot download the distribution (timeout or blocked), do the following:

1) On a machine with working network, download the exact Gradle distribution used by the wrapper. The failing log shows the filename, e.g.:
   gradle-8.14.3-all.zip
   URL: https://services.gradle.org/distributions/gradle-8.14.3-all.zip

2) Create the wrapper cache directory on your dev machine (Windows example):
   %USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-all\<SOME_HASH>\

   Example path:
   C:\Users\kyere\.gradle\wrapper\dists\gradle-8.14.3-all\gradle-8.14.3-all.zip

   Note: the wrapper usually creates a folder with a random hash. You can create any folder; the wrapper will accept it if the zip is present.

3) Put the downloaded zip inside that folder and rename it to the expected filename, e.g. gradle-8.14.3-all.zip

4) Re-run the build (from `android/`):
   ./gradlew assembleDebug

Alternative: set a longer socket timeout for the wrapper process before invoking gradle:

export GRADLE_OPTS="-Dorg.gradle.internal.http.socketTimeout=60000 -Dhttp.socketTimeout=60000"
./gradlew assembleDebug

If you prefer, I can prepare a small script to create the proper wrapper cache folder and accept a local zip file you place into `client/`.
