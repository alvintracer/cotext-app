# Dev Task: Android Release Signing and Bundle

Related: [[AI-Sessions/wiki/projects/cotext_mvp]]

## Summary

Cotext Android release bundling was blocked by two separate issues on 2026-06-21:

1. launcher icon resources in `android/app/src/main/res/mipmap-*` had `.png` filenames but JPEG/JFIF file headers, so AAPT failed during resource compilation
2. Play Console requires a signed `.aab`, but the project had no release signing config, no `keystore.properties`, and no upload keystore

Both are now fixed locally and a signed release bundle was successfully produced.

## What changed

- Fixed Android icon resources
  - regenerated all `ic_launcher*.png` files under:
    - `android/app/src/main/res/mipmap-mdpi/`
    - `android/app/src/main/res/mipmap-hdpi/`
    - `android/app/src/main/res/mipmap-xhdpi/`
    - `android/app/src/main/res/mipmap-xxhdpi/`
    - `android/app/src/main/res/mipmap-xxxhdpi/`
  - source image used: `public/icon-512x512.png`
- Added release signing wiring
  - `android/app/build.gradle`
  - loads `android/keystore.properties`
  - defines `signingConfigs.release`
  - applies signing only when the properties file exists
  - important path fix: `storeFile rootProject.file(...)`, not module-local `file(...)`
- Added ignore rules for secrets
  - `.gitignore`
  - ignores:
    - `android/keystore.properties`
    - `android/*.jks`
    - `android/*.keystore`
- Added template file
  - `android/keystore.properties.example`

## Local signing files

These files exist locally and must not be committed:

- `android/keystore.properties`
- `android/cotext-upload-key.jks`

Current local alias:

- `cotextupload`

## Build commands

From `android/`:

```powershell
./gradlew clean
./gradlew bundleRelease
```

## Output

Signed bundle output:

- `android/app/build/outputs/bundle/release/app-release.aab`

## Verification

- `./gradlew clean` succeeded
- `./gradlew bundleRelease` succeeded after signing config + icon fix
- the final task path included `:app:validateSigningRelease`, `:app:signReleaseBundle`, and `:app:bundleRelease`

## Lessons

- If AAPT says `ic_launcher.png` failed to compile, verify the binary header, not just the extension.
- For Android app module signing, `storeFile file(...)` can resolve relative to `android/app/`; using `rootProject.file(...)` is safer when the keystore lives in `android/`.
- Keep the upload keystore backed up separately. Losing it complicates future Play releases.
