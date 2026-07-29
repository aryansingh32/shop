/**
 * Kirana Rebranding — JavaScript
 *
 * Handles dynamic debranding that CSS alone cannot achieve:
 *   - document.title stripping (Odoo sets it to "App Name — Odoo" at runtime)
 *   - Favicon replacement
 *   - MutationObserver to catch elements added after initial render
 *
 * This file runs in the web.assets_backend bundle, which Odoo loads for
 * every backend page. No Odoo module system imports needed — it's plain JS
 * with a lightweight OWL service registration for the title patch.
 *
 * Brand name is NOT hardcoded here — it comes from the ir.config_parameter
 * 'kirana.brand_name' set in data/ir_config_parameter.xml.
 * We read it from the DOM meta tag we inject in views/assets.xml.
 */

(function kirana_rebrand() {
    "use strict";

    // ── Read brand name from injected meta tag ────────────────────────────
    // views/assets.xml injects: <meta name="kirana:brand" content="..." />
    // Falls back to empty string so title still strips " — Odoo"
    function getBrandName() {
        const meta = document.querySelector('meta[name="kirana:brand"]');
        return meta ? meta.getAttribute("content") || "" : "";
    }

    // ── 1. Page title: strip " — Odoo" / "Odoo — " ───────────────────────
    function patchTitle() {
        const brand = getBrandName();
        const original = document.title;
        // Odoo formats: "Customers — Odoo" or "Odoo"
        const cleaned = original
            .replace(/\s*[-–—]\s*Odoo\b/gi, "")
            .replace(/\bOdoo\s*[-–—]\s*/gi, "")
            .replace(/\bOdoo\b/gi, brand)
            .trim();
        if (cleaned && cleaned !== original) {
            document.title = cleaned || brand;
        }
    }

    // ── 2. Favicon replacement ────────────────────────────────────────────
    // Replace /web/static/img/favicon.ico with a neutral one.
    // Admins can override by placing /web/static/img/kirana_favicon.ico in
    // a higher-priority module.
    function patchFavicon() {
        const existingIco = document.querySelector('link[rel="icon"]');
        // If a custom favicon is already set (not odoo's default), leave it
        if (existingIco && !existingIco.getAttribute("href")?.includes("odoo")) return;

        const link = existingIco ?? document.createElement("link");
        link.setAttribute("rel", "icon");
        link.setAttribute("type", "image/x-icon");
        // Use a simple blank favicon (1x1 transparent) to avoid any Odoo mark
        // Replace this URL with your actual branded favicon in production
        link.setAttribute("href", "/kirana_rebrand/static/src/img/favicon.ico");
        if (!existingIco) document.head.appendChild(link);
    }

    // ── 3. Remove any "Odoo" text nodes dynamically added after page load ─
    // Odoo's OWL components sometimes add branding text dynamically.
    // We use a MutationObserver to catch and clean up these additions.
    function cleanOdooTextNodes(root) {
        const brand = getBrandName();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
            // Only target text nodes that consist of or contain bare "Odoo"
            // (not part of a technical identifier like "odoo.model.name")
            if (/\bOdoo\b/.test(node.nodeValue) && node.parentElement &&
                !["SCRIPT", "STYLE", "CODE", "PRE"].includes(node.parentElement.tagName)) {
                // Replace "Odoo" with the brand name (or remove if no brand set)
                node.nodeValue = node.nodeValue.replace(/\bOdoo\b/g, brand);
            }
        }
    }

    // ── 4. MutationObserver ───────────────────────────────────────────────
    const observer = new MutationObserver((mutations) => {
        // Batch process: only run patchTitle if title was added/changed
        let titleChanged = false;
        for (const mutation of mutations) {
            if (mutation.target === document.title || mutation.type === "characterData") {
                titleChanged = true;
            }
            // Clean text nodes added to the DOM
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    cleanOdooTextNodes(node);
                }
            }
        }
        if (titleChanged) patchTitle();
    });

    // ── 5. Title observer (separate — watches <title> element) ───────────
    function watchTitle() {
        const titleEl = document.querySelector("title");
        if (titleEl) {
            new MutationObserver(patchTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
        }
    }

    // ── 6. Init ───────────────────────────────────────────────────────────
    function init() {
        patchTitle();
        patchFavicon();
        cleanOdooTextNodes(document.body || document.documentElement);
        watchTitle();
        // Watch the whole body for dynamic additions
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    // Run immediately if DOM is ready, otherwise wait
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
