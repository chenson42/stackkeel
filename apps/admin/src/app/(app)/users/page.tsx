import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { PageHeader } from "@repo/ui";
import { CreateUserDialog } from "./create-user-dialog";
import { UsersTable } from "./users-table";

// Real /users page — replaces api-developer's placeholder (Phase 3
// Component Plan: promoted DataTable + "Create user" Dialog). RSC direct
// query, same no-client-fetch convention Portal's own /admin/users uses.
export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_USERS)) {
    redirect("/access-pending");
  }

  const allUsers = await db.query.users.findMany({
    columns: { id: true, email: true, name: true, accountStatus: true, createdAt: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 200,
  });

  return (
    <>
      <PageHeader
        title="Users"
        description={
          <>
            {allUsers.length} user{allUsers.length === 1 ? "" : "s"}. Create a person here, then
            grant roles from their own page.
          </>
        }
        actions={<CreateUserDialog />}
      />

      <div className="mt-6">
        <UsersTable users={allUsers} />
      </div>
    </>
  );
}
