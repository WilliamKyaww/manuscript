/** A one-line glimpse of a card's front, without Markdown or cloze syntax ("Raft elects a [leader]"). */
export const glimpse = (text: string) =>
  text
    // As core's CLOZE: no `::` in the answer and no `{{` in either part, so an unclosed run is linear.
    .replace(/\{\{c\d+::((?:(?!\}\}|::|\{\{).)*)(?:::(?:(?!\}\}|\{\{).)*)?\}\}/g, '[$1]')
    .replace(/[#*_`>$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
