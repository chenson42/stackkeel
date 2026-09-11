// Admin's permission surface — thin re-export of the shared catalog (see
// the portal counterpart for the growth pattern).
export {
  ADMIN_ROLE,
  MEMBER_ROLE,
  FEATURES,
  FEATURE_CATALOG,
  ADMIN_PROTECTED_FEATURES,
  hasFeature,
  type FeatureKey,
} from "@repo/permissions";
