export interface AlphabetScrollerProps {
  /** Map of letter → index of first item starting with that letter in the sorted list. */
  letterMap: Map<string, number>;
  /** Currently active letter (e.g. derived from scroll position or centered item). */
  activeLetter?: string;
  /** Called when user clicks or drags to a letter. Receives the letter and its first index. */
  onLetterSelect: (letter: string, index: number) => void;
  /** Visual variant to match the parent's background. */
  variant?: "default" | "dark";
}
