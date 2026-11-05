// Embedded guests (the Bots webview) take dictation through their own bridge instead of a host text field.

export type DictationGuestSink = (text: string) => void

const sinks = new WeakMap<Element, DictationGuestSink>()

export function registerDictationGuestSink(element: Element, sink: DictationGuestSink): () => void {
  sinks.set(element, sink)
  return () => {
    if (sinks.get(element) === sink) {
      sinks.delete(element)
    }
  }
}

export function dictationGuestSinkFor(element: Element | null): DictationGuestSink | undefined {
  return element ? sinks.get(element) : undefined
}
