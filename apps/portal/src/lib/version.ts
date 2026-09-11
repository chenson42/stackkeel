// Build-time constant — package.json is resolved at compile time, not at runtime.
// No 'server-only' marker: FeedbackForm is a client component that imports this.
// The version string is not sensitive and safe to include in the client bundle.
// resolveJsonModule: true is already set in tsconfig.json.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
