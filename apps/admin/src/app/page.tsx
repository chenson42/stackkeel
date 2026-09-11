import { redirect } from "next/navigation";

// No real landing page for this app yet (ux-developer's scope) — every
// authenticated, role-holding, 2FA-enrolled visitor's natural home is
// /users. src/proxy.ts has already gated this route by the time this
// component renders, so an unconditional redirect here is safe.
export default function RootPage() {
  redirect("/users");
}
