export type AppBuildMode = "fullstack" | "static";

/**
 * The single build-time switch for platform-backed versus static snapshots.
 *
 * The private artifact is built as `fullstack`. The manual static build changes
 * this one value to `static` alongside selecting its baked-data adapter. UI code
 * must not infer the mode from storage failures, the URL, or browser features.
 */
export const APP_BUILD_MODE: AppBuildMode = "fullstack";
