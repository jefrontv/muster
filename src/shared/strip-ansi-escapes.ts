// Strips terminal control sequences from captured command output.
//
// The run pane is a `<pre>`, not a terminal, so colour codes arrive as literal `[1m[31m` noise in
// front of the words that matter. Package managers emit them even with CI and NO_COLOR set, because
// not all of them check.
//
// Deliberately narrow: CSI sequences (colour, cursor moves), OSC sequences (window titles, links)
// and lone escapes. It does not try to be a terminal emulator — anything it misses renders as it
// did before, which is no worse than not running it.

// eslint-disable-next-line no-control-regex -- matching control characters is the entire job here
const CONTROL_SEQUENCES = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B[@-Z\\-_]|\r(?!\n)/g

export function stripAnsiEscapes(text: string): string {
  return text.replace(CONTROL_SEQUENCES, '')
}
