import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { escapeHtml, renderInline, renderMarkdown } = await import("./markdown.ts");

const count = (haystack, needle) => haystack.split(needle).length - 1;

describe("escapeHtml", () => {
  it("escapes &, <, >, and \"", () => {
    assert.equal(escapeHtml('& < > "'), "&amp; &lt; &gt; &quot;");
  });
});

describe("renderInline", () => {
  it("renders bold, inline code (not re-parsed), and escapes inside code", () => {
    assert.equal(renderInline("**볼드**"), "<strong>볼드</strong>");
    assert.equal(renderInline("`**a**`"), "<code>**a**</code>");
    assert.equal(renderInline("`a<b`"), "<code>a&lt;b</code>");
  });

  it("links http(s) and root-relative urls only", () => {
    assert.equal(
      renderInline("[t](https://x)"),
      '<a href="https://x" target="_blank" rel="noreferrer noopener">t</a>',
    );
    assert.equal(
      renderInline("[t](/rel)"),
      '<a href="/rel" target="_blank" rel="noreferrer noopener">t</a>',
    );
  });

  it("keeps javascript: and protocol-relative urls as text (no anchor)", () => {
    const js = renderInline("[t](javascript:alert(1))");
    const proto = renderInline("[t](//evil.example)");
    assert.ok(!js.includes("<a"));
    assert.ok(!proto.includes("<a"));
    assert.ok(js.includes("javascript:"));
  });

  it("preserves plain space-digit-space runs with no code span (slot collision guard)", () => {
    assert.equal(renderInline("결함 0 건, 총 2 라운드"), "결함 0 건, 총 2 라운드");
  });

  it("preserves an unrelated space-digit-space when a code span is present", () => {
    const out = renderInline("`code`와 숫자 3 개");
    assert.ok(out.includes("<code>code</code>"));
    assert.ok(out.includes("숫자 3 개"));
  });

  it("normalizes raw NUL to U+FFFD without deleting surrounding digits", () => {
    assert.equal(renderInline("앞\0 0 \0뒤"), "앞� 0 �뒤");
  });
});

describe("renderMarkdown", () => {
  it("renders heading levels", () => {
    const out = renderMarkdown("# H1\n## H2\n###### H6");
    assert.ok(out.includes("<h1>H1</h1>"));
    assert.ok(out.includes("<h2>H2</h2>"));
    assert.ok(out.includes("<h6>H6</h6>"));
  });

  it("renders paragraphs, unordered and ordered lists", () => {
    assert.equal(renderMarkdown("hello world"), "<p>hello world</p>");
    assert.equal(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
    assert.equal(renderMarkdown("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  });

  it("flattens nested lists (documented limitation)", () => {
    const out = renderMarkdown("- a\n  - b");
    assert.equal(count(out, "<li>"), 2);
    assert.equal(count(out, "<ul>"), 1);
  });

  it("renders a GFM table", () => {
    const out = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    assert.ok(out.includes("<table>"));
    assert.ok(out.includes("<th>A</th>"));
    assert.ok(out.includes("<td>1</td>"));
    assert.ok(out.includes("<td>2</td>"));
  });

  it("renders code fences with escaped contents and no inline parsing", () => {
    const out = renderMarkdown("```\nconst x = 1 < 2; **b**\n```");
    assert.ok(out.includes("<pre><code>const x = 1 &lt; 2; **b**</code></pre>"));
    assert.ok(!out.includes("<strong>"));
  });

  it("renders blockquotes and horizontal rules", () => {
    assert.equal(renderMarkdown("> quote line"), "<blockquote>quote line</blockquote>");
    assert.equal(renderMarkdown("---"), "<hr />");
  });

  it("returns empty string for empty input", () => {
    assert.equal(renderMarkdown(""), "");
  });

  it("escapes raw HTML (XSS): <script> becomes &lt;script&gt;", () => {
    const out = renderMarkdown("<script>alert(1)</script>");
    assert.ok(out.includes("&lt;script&gt;"));
    assert.ok(!out.includes("<script>"));
  });

  it("keeps an escaped pipe inside a code cell as one cell and restores the literal pipe", () => {
    const out = renderMarkdown(
      "| 필드 | 타입 |\n| --- | --- |\n| x | `validation: string \\| null` |",
    );
    // 데이터 행은 2열이어야 한다(순진한 split(\"|\")이면 열이 밀린다).
    const body = out.slice(out.indexOf("<tbody>"));
    assert.equal(count(body, "<td>"), 2);
    assert.ok(out.includes("validation: string | null"));
  });

  it("leaves no stray backslash when a row ends in an escaped pipe", () => {
    const out = renderMarkdown("| A | B |\n| --- | --- |\n| a | b \\|");
    assert.ok(out.includes("b |"));
    assert.ok(!out.includes("\\"));
  });

  it("splits on an unescaped pipe even inside a code span (GFM behavior)", () => {
    const out = renderMarkdown("| A | B |\n| --- | --- |\n| `a | b` |");
    const body = out.slice(out.indexOf("<tbody>"));
    assert.equal(count(body, "<td>"), 2);
  });
});
