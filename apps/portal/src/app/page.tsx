import { redirect } from "next/navigation";
import { auth } from "@/auth";

// This is an internal staff/volunteer portal, not a public marketing
// site — there's no reason for a signed-in user to see anything other
// than /home, and no reason for a signed-out user to see anything other
// than the sign-in form.
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/home" : "/signin");
}
