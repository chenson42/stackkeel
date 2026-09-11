// Docs site for the starter kit, deployed to GitHub Pages by
// .github/workflows/docs.yml (canonical repo only — forks that keep docs-site
// point `site`/`base` at their own Pages URL during personalization).
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://stackkeel.org",
  integrations: [
    starlight({
      title: "Stackkeel",
      description:
        "Cross-AI monorepo starter kit: portal + admin + native shell + native app, with built-in maintenance, helpdesk, theming, and a personalization/sync loop.",
      logo: { src: "./src/assets/logo.png", alt: "Stackkeel mark" },
      favicon: "/favicon.png",
      head: [
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
