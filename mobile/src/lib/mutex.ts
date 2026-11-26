/** Serializa tareas asíncronas: cada una empieza cuando termina la anterior (aunque falle). */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}
