// Portal's permission surface — a thin re-export of the shared catalog.
// The kit ships no portal-only roles or features; a fork's first
// portal-scoped role name (e.g. `portal_editor`) gets declared in
// @repo/permissions' APP_ROLE_NAMESPACES and, if the portal needs local
// helper predicates over it, those live here.
export {
  ADMIN_ROLE,
  MEMBER_ROLE,
  FEATURES,
  FEATURE_CATALOG,
  hasFeature,
  type FeatureKey,
} from "@repo/permissions";
