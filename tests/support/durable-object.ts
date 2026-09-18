export class DurableObject<E> {
  constructor(protected ctx: any, protected env: E) {}
}
