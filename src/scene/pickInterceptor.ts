/**
 * Something drawn on the Moon that wants clicks near it (the site search's spots) registers here;
 * the camera asks it first, before turning a click into a custom site under the pointer.
 */
type Interceptor = (clientX: number, clientY: number) => boolean;

let current: Interceptor | null = null;

export function setPickInterceptor(next: Interceptor | null): void {
  current = next;
}

/** True when the click was taken by something on the Moon. */
export function interceptPick(clientX: number, clientY: number): boolean {
  return current ? current(clientX, clientY) : false;
}
