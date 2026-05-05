import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DefaultTheme, defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

const configDir = dirname(fileURLToPath(import.meta.url));

const readSidebar = (path: string): DefaultTheme.SidebarItem[] => {
    try {
        return JSON.parse(readFileSync(resolve(configDir, path), "utf8")) as DefaultTheme.SidebarItem[];
    } catch {
        return [];
    }
};

const distillApiSidebar = readSidebar("../api/distill/typedoc-sidebar.json");
const generatedApiPathPrefix = "api/distill/";

const guideSidebar: DefaultTheme.SidebarItem[] = [
    {
        text: "Guide",
        items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Tokens", link: "/guide/tokens" },
            { text: "Bindings", link: "/guide/bindings" },
            { text: "Container", link: "/guide/container" },
            { text: "Modules", link: "/guide/modules" },
        ],
    },
];

const packageSidebar: DefaultTheme.SidebarItem[] = [
    {
        text: "Packages",
        items: [
            { text: "Overview", link: "/packages/" },
            { text: "@satunnaisuus/distill", link: "/packages/distill/" },
        ],
    },
];

const apiSidebar: DefaultTheme.SidebarItem[] = [
    {
        text: "API Reference",
        items: [
            { text: "Overview", link: "/api/" },
            { text: "@satunnaisuus/distill", link: "/api/distill/" },
        ],
    },
    ...distillApiSidebar,
];

export default defineConfig({
    lang: "en-US",
    title: "Distill",
    description: "A small, type-safe dependency injection container for TypeScript.",
    outDir: "../dist",
    lastUpdated: true,
    cleanUrls: true,

    vite: {
        plugins: [llmstxt()],
    },

    head: [
        ["meta", { name: "theme-color", content: "#0f766e" }],
        ["meta", { property: "og:title", content: "Distill" }],
        [
            "meta",
            {
                property: "og:description",
                content: "A small, type-safe dependency injection container for TypeScript.",
            },
        ],
    ],

    markdown: {
        lineNumbers: true,
    },

    transformPageData(pageData) {
        if (pageData.relativePath.startsWith(generatedApiPathPrefix)) {
            pageData.frontmatter.editLink = false;
        }
    },

    themeConfig: {
        siteTitle: "Distill",
        nav: [
            { text: "Guide", link: "/guide/getting-started" },
            { text: "Packages", link: "/packages/" },
            { text: "API", link: "/api/" },
        ],
        sidebar: {
            "/guide/": guideSidebar,
            "/packages/": packageSidebar,
            "/api/": apiSidebar,
        },
        search: {
            provider: "local",
        },
        outline: {
            level: [2, 3],
        },
        socialLinks: [{ icon: "github", link: "https://github.com/satunnaisuus/distill" }],
        editLink: {
            pattern: "https://github.com/satunnaisuus/distill/edit/develop/apps/docs/docs/:path",
            text: "Edit this page on GitHub",
        },
        footer: {
            message: "Released under the MIT License.",
            copyright: "Copyright 2026-present satunnaisuus",
        },
    },
});
