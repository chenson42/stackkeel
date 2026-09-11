import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { Button, PageHeader } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { whatsNewEntries } from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@/lib/permissions";
import { FormattedDate } from "@repo/ui";
import { createWhatsNewEntry } from "./actions";
import { DeleteWhatsNewButton } from "./delete-button";

export default async function WhatsNewAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin/whats-new");
  if (!hasFeature(session.user.features, FEATURES.ADMIN_WHATS_NEW)) {
    redirect("/access-pending");
  }

  const entries = await db
    .select()
    .from(whatsNewEntries)
    .orderBy(desc(whatsNewEntries.publishedAt));

  async function handleCreate(formData: FormData) {
    "use server";
    const emoji = (formData.get("emoji") as string) ?? "";
    const title = (formData.get("title") as string) ?? "";
    const body = (formData.get("body") as string) ?? "";
    await createWhatsNewEntry({ emoji, title, body });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="What&apos;s new"
        description="Publish updates that members see on their home page."
      />

      {/* Create form */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          New entry
        </h2>
        <form action={handleCreate} className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="emoji"
              className="block text-sm font-medium"
            >
              Emoji <span className="text-muted-foreground">(optional, max 2)</span>
            </label>
            <input
              id="emoji"
              name="emoji"
              type="text"
              maxLength={10}
              placeholder="🎉"
              className="mt-1 w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Title <span className="text-muted-foreground">(required, max 100 chars)</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={100}
              placeholder="New feature shipped"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="body" className="block text-sm font-medium">
              Body <span className="text-muted-foreground">(required, max 500 chars, plain text)</span>
            </label>
            <textarea
              id="body"
              name="body"
              required
              maxLength={500}
              rows={3}
              placeholder="Describe what changed and why it matters to members."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button type="submit" className="rounded-md">
            Publish entry
          </Button>
        </form>
      </section>

      {/* Entry list */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Published entries ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No entries yet. Use the form above to publish the first update.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {entry.emoji && (
                        <span className="mr-1">{entry.emoji}</span>
                      )}
                      {entry.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {entry.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Published{" "}
                      <FormattedDate
                        value={entry.publishedAt}
                        mode="datetime"
                      />
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <Link
                      href={`/admin/whats-new/${entry.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </Link>
                    <DeleteWhatsNewButton
                      id={entry.id}
                      entryTitle={entry.title}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
