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
          { slug: "index" },
          { slug: "getting-started" },
          { slug: "personalization" },
        ]},
        { label: "Guides", items: [
          { slug: "architecture" },
          { slug: "modules" },
          { slug: "workflow" },
          { slug: "sync" },
        ]},
      ],
    }),
  ],
});
