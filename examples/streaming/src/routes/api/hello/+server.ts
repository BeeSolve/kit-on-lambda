import { json } from '@sveltejs/kit'

export function GET() {
  return json({ message: 'hello from kit-on-lambda streaming', timestamp: new Date().toISOString() })
}
