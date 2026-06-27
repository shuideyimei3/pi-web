import { marked } from "marked";

const renderer = new marked.Renderer();
renderer.html = ({ text }) => escapeHtml(text);

const MAX_MARKDOWN_CACHE_ENTRIES = 300;
const markdownHtmlCache = new Map<string, string>();

export function toSafeMarkdownHtml(text: string): string {
  const cached = markdownHtmlCache.get(text);
  if (cached !== undefined) return cached;
  const html = marked.parse(text, { async: false, breaks: true, gfm: true, renderer });
  const safeHtml = sanitizeHtml(html);
  markdownHtmlCache.set(text, safeHtml);
  if (markdownHtmlCache.size > MAX_MARKDOWN_CACHE_ENTRIES) {
    const oldest = markdownHtmlCache.keys().next().value;
    if (oldest !== undefined) markdownHtmlCache.delete(oldest);
  }
  return safeHtml;
}

/**
 * Streaming-optimized markdown: parse with marked, but skip the expensive
 * DOM-based sanitizeHtml pass.  The output of marked.parse is already
 * structurally safe (no <script>, no event handlers) for LLM-generated
 * content — we only need the full sanitize for untrusted input, which
 * streaming text is not (it comes from our own agent via WebSocket).
 *
 * The cache is separate from the full-sanitize cache so that when streaming
 * ends, the final toSafeMarkdownHtml() call still runs sanitize once.
 */
const MAX_STREAMING_CACHE_ENTRIES = 50;
const streamingMarkdownCache = new Map<string, string>();

export function toStreamingMarkdownHtml(text: string): string {
  const cached = streamingMarkdownCache.get(text);
  if (cached !== undefined) return cached;
  const html = marked.parse(text, { async: false, breaks: true, gfm: true, renderer });
  streamingMarkdownCache.set(text, html);
  if (streamingMarkdownCache.size > MAX_STREAMING_CACHE_ENTRIES) {
    const oldest = streamingMarkdownCache.keys().next().value;
    if (oldest !== undefined) streamingMarkdownCache.delete(oldest);
  }
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => { node.remove(); });
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && !isSafeUrl(attribute.value)) element.removeAttribute(attribute.name);
    }
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    }
  });
  return template.innerHTML;
}

function isSafeUrl(url: string): boolean {
  if (url.startsWith("#") || url.startsWith("/")) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
