import { json } from '@sveltejs/kit'
import { getAwsEvent } from '@beesolve/lambda-fetch-api'

export function GET() {
  const event = getAwsEvent()
  return json(event)
}
