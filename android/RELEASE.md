# Android Release

## Production hardening

- `android:allowBackup` is disabled.
- Release builds are minified and resource-shrunk.
- Cleartext traffic is disabled by default.
- Upload signing is read from Gradle properties so secrets stay out of git.

## Required signing properties

Add these to your local `~/.gradle/gradle.properties` or a secure CI secret source:

```properties
KARAMELA_UPLOAD_STORE_FILE=C:\\path\\to\\karamela-upload-keystore.jks
KARAMELA_UPLOAD_STORE_PASSWORD=change-me
KARAMELA_UPLOAD_KEY_ALIAS=karamela
KARAMELA_UPLOAD_KEY_PASSWORD=change-me
```

## Release steps

1. Build the web app:
   `npm run build`
2. Sync Capacitor assets:
   `npx cap sync android`
3. Build the production bundle:
   `cd android && .\\gradlew bundleRelease`
4. Output artifact:
   `android/app/build/outputs/bundle/release/app-release.aab`

## Rollout checklist

- Verify the Supabase production environment variables are correct.
- Confirm the latest SQL migrations have been applied in Supabase.
- Test login, POS sale, waste, closing stock, reconciliation, and reports on a physical Android device.
- Install the release build and confirm existing local sessions do not break app startup.
- Upload the AAB to Play Console internal testing before any customer rollout.
