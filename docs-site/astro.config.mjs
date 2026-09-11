// Docs site for the starter kit, deployed to GitHub Pages by
// .github/workflows/docs.yml (canonical repo only — forks that keep docs-site
// point `site`/`base` at their own Pages URL during personalization).
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";

// Forks ship this docs-site as a rebrandable skeleton. Their deployments must
// not compete with (or duplicate) the canonical site in search, so the build
// emits <meta name="robots" content="noindex"> unless the deploy explicitly
// opts in — the canonical repo's docs workflow sets DOCS_INDEXABLE=true.
const indexable = process.env.DOCS_INDEXABLE === "true";

export default defineConfig({
  site: "https://stackkeel.org",
  integrations: [
    starlight({
      plugins: [starlightLlmsTxt()],
      components: {
        Footer: "./src/components/Footer.astro",
      },
      title: "Stackkeel",
      description:
        "Open-source Next.js monorepo starter kit for AI-assisted development: auth, admin, RBAC, audit logging, email, helpdesk, theming, and mobile apps, with one workflow for Claude Code, Codex, Copilot, and Cursor.",
      logo: { src: "./src/assets/logo.png", alt: "Stackkeel mark" },
      favicon: "/favicon.png",
      head: [
        ...(indexable ? [] : [{ tag: "meta", attrs: { name: "robots", content: "noindex" } }]),
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://stackkeel.org/og.png" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/chenson42/stackkeel" },
      ],
      sidebar: [
        { label: "Start Here", items: [
          { slug: "index", label: "Overview" },
          { slug: "why-stackkeel" },
          { slug: "compare", label: "vs. Other Starters" },
          { slug: "getting-started", label: "Getting Started" },
          { slug: "personalization", label: "Personalization" },
        ]},
        { label: "Features", items: [
          { slug: "features/authentication", label: "Authentication & 2FA" },
          { slug: "features/permissions", label: "Roles & Permissions" },
          { slug: "features/audit-and-flags", label: "Audit Log & Flags" },
          { slug: "features/email-queue", label: "Email & Announcements" },
          { slug: "features/helpdesk", label: "Helpdesk & Feedback" },
          { slug: "features/theming", label: "Theming Engine" },
          { slug: "features/mobile", label: "Mobile Apps" },
        ]},
        { label: "Guides", items: [
          { slug: "cross-ai", label: "One Workflow, Any AI" },
          { slug: "workflow", label: "Development Workflow" },
          { slug: "architecture", label: "Architecture" },
          { slug: "modules", label: "Module Catalog" },
          { slug: "sync", label: "Kit ↔ Fork Sync" },
        ]},
      ],
    }),
  ],
});
