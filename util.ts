export function assertUnreachable(value: never, message = JSON.stringify(value)): never {
  throw Error("An unreachable state reached!\n" + message);
}

export function computeRoutes(files: Array<string>): Array<string> {
  return [
    ...new Set(
      files
        .map((file) => {
          const segments = file.split("/");
          // A top-level file (e.g. `favicon.ico`) or a file one level deep
          // (e.g. `_app/version.json`) maps to an exact route. Files nested
          // deeper collapse to a two-segment wildcard (e.g. `_app/immutable/*`).
          //
          // Deliberately never emit a bare one-segment wildcard such as
          // `_app/*`: SvelteKit serves dynamic endpoints under `_app/` too
          // (e.g. remote functions at `_app/remote/*`), and a greedy `_app/*`
          // S3 route would shadow them, sending those dynamic requests to the
          // asset bucket (404/403) instead of the Lambda default behaviour.
          if (segments.length <= 2) return file;
          return `${segments[0]}/${segments[1]}/*`;
        })
        .filter((route): route is string => route != null),
    ),
  ];
}
