export function load({ cookies }: { cookies: { get: (name: string) => string | undefined } }) {
  return { value: cookies.get('test') ?? '' }
}
