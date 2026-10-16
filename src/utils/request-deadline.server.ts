/**
 * Run one request's work under a deadline with named progress steps.
 *
 * The pending timer keeps the Worker request alive, so a wait that depends on
 * another request's I/O can still finish instead of being killed as "hung";
 * if the work truly stalls, the caller gets a clear error naming the step.
 */
export async function withDeadline<T>(
  label: string,
  ms: number,
  fn: (step: (name: string) => void) => Promise<T>,
): Promise<T> {
  const started = Date.now();
  let current = "starting";
  const step = (name: string) => {
    current = name;
    console.log(`[${label}] ${name} +${Date.now() - started}ms`);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.error(`[${label}] timed out after ${ms}ms while ${current}`);
      reject(new Error(`Saving took too long (stuck while ${current}). Please try again.`));
    }, ms);
  });
  try {
    return await Promise.race([fn(step), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
