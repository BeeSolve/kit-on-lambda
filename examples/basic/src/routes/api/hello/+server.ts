import { json } from '@sveltejs/kit'

export function GET() {
  return json({ message: 'hello from kit-on-lambda', timestamp: new Date().toISOString() })
}
