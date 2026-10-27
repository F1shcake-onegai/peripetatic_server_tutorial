"""Add a "Reference" heading above a page's footnotes.

Pages without footnotes are left unchanged, so the section only appears when needed.
"""


def on_page_content(html, **kwargs):
    return html.replace(
        '<div class="footnote">\n<hr />',
        '<h2 id="reference">Reference</h2>\n<div class="footnote">',
        1,
    )
