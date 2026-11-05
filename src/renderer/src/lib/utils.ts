import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-chat` is a font size token; unregistered, tailwind-merge reads it as a colour and drops it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['chat'] }] } }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
