const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/**
 * Re-indents JSON without evaluating it. `JSON.parse` followed by `JSON.stringify` would round
 * integers beyond 2^53 (12345678901234567890 → 12345678901234567000), turn `1e400` into `null`,
 * drop `-0.0`'s sign and silently discard all but the last of a repeated key, so a data file
 * would read differently from what is on disk. Here the text is only validated by `JSON.parse`;
 * every number, string and key is copied as it was written.
 *
 * The output stops soon after `limit` characters, because indentation can multiply a small file
 * (a hundred thousand nested brackets would otherwise need terabytes of spaces).
 * @throws SyntaxError when the text is not valid JSON.
 */
export function formatJson(text: string, limit: number): string {
  JSON.parse(text);
  const lines = (depth: number) => `\n${'  '.repeat(depth)}`;
  let out = '';
  let depth = 0;
  for (let index = 0; index < text.length && out.length <= limit; index++) {
    const char = text[index] as string;
    if (char === '"') {
      let end = index + 1;
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      out += text.slice(index, end + 1);
      index = end;
    } else if (char === '{' || char === '[') {
      let next = index + 1;
      while (WHITESPACE.has(text[next] as string)) next++;
      const close = char === '{' ? '}' : ']';
      if (text[next] === close) {
        out += char + close;
        index = next;
      } else out += char + lines(++depth);
    } else if (char === '}' || char === ']') out += lines(--depth) + char;
    else if (char === ',') out += `,${lines(depth)}`;
    else if (char === ':') out += ': ';
    else if (!WHITESPACE.has(char)) out += char;
  }
  return out;
}
