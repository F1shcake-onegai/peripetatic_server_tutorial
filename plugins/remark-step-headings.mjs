// Numbered step headings, as { .step } and { .step-0 } did in MkDocs (attr_list).
// MDX reads braces as JavaScript, so the marker is a comment at the end of the heading:
//   ## Install mesh-config {/* .step */}
// The comment is removed and the heading gets class "step" or "step-0";
// src/styles/steps.css numbers them.
const MARKER = /^\/\*\s*\.(step(?:-0)?)\s*\*\/$/;

export default function remarkStepHeadings() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (node.type === 'heading') mark(node);
  for (const child of node.children ?? []) walk(child);
}

function mark(heading) {
  const last = heading.children.at(-1);
  if (last?.type !== 'mdxTextExpression') return;
  const match = last.value.trim().match(MARKER);
  if (!match) return;
  heading.children.pop();
  const prev = heading.children.at(-1);
  if (prev?.type === 'text') {
    prev.value = prev.value.trimEnd();
    if (!prev.value) heading.children.pop();
  }
  heading.data ??= {};
  heading.data.hProperties ??= {};
  heading.data.hProperties.className = [match[1]];
}
