<script lang="ts">
  import { marked } from 'marked';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  // Configure marked pour plus de sécurité et un meilleur rendu
  marked.setOptions({
    breaks: true, // Les sauts de ligne deviennent des <br>
    gfm: true, // GitHub Flavored Markdown
  });

  // Convertit le markdown en HTML
  const html = $derived(marked.parse(content) as string);
</script>

<div class="markdown-content">
  {@html html}
</div>

<style>
  .markdown-content :global(p) {
    margin: 0.5rem 0;
    line-height: 1.6;
  }

  .markdown-content :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(strong) {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .markdown-content :global(em) {
    font-style: italic;
  }

  .markdown-content :global(code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .markdown-content :global(pre) {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.75rem 0;
  }

  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .markdown-content :global(li) {
    margin: 0.25rem 0;
    line-height: 1.6;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-content :global(h1) {
    font-size: 1.5em;
  }
  .markdown-content :global(h2) {
    font-size: 1.3em;
  }
  .markdown-content :global(h3) {
    font-size: 1.1em;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid rgba(255, 255, 255, 0.3);
    padding-left: 1rem;
    margin: 0.75rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin: 1rem 0;
  }

  .markdown-content :global(a) {
    color: #6eb5ff;
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }
</style>
