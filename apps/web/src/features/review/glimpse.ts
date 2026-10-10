/** A one-line glimpse of a card's front, without Markdown or cloze syntax ("Raft elects a [leader]"). */
export const glimpse = (text: string) =>
  text
    .replace(/\{\{c\d+::((?:(?!\}\}).)*?)(?:::(?:(?!\}\}).)*?)?\}\}/g, '[$1]')
    .replace(/[#*_`>$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
