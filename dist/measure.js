/**
 * Text measurement without a browser: Helvetica's advance widths, in thousandths of an em, for
 * printable ASCII. The drawing asks for Helvetica, Arial or the sans-serif the system
 * has; those differ from Helvetica by a few percent, which the boxes' padding absorbs.
 */
const WIDTHS = {
    ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, '\'': 191, '(': 333, ')': 333,
    '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556,
    '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584,
    '>': 584, '?': 556, '@': 1015, 'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
    'H': 722, 'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667, 'Q': 778,
    'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944, 'X': 667, 'Y': 667, 'Z': 611, '[': 278,
    '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556,
    'f': 278, 'g': 556, 'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556,
    'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722, 'x': 500, 'y': 500,
    'z': 500, '{': 334, '|': 260, '}': 334, '~': 584, '×': 584, '⟨': 333, '⟩': 333, '…': 1000, '→': 1000
};
const OTHER = 650;
/** Helvetica Bold is wider by about this factor. */
const BOLD = 1.07;
/** The width in pixels of `text` set at `size` pixels. */
export function measure(text, size, bold = false) {
    let total = 0;
    for (const character of text)
        total += WIDTHS[character] ?? OTHER;
    return total / 1000 * size * (bold ? BOLD : 1);
}
