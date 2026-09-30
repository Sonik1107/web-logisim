export class History {
  #past = [];
  #future = [];
  constructor(limit = 100) {
    this.limit = limit;
  }
  get canUndo() {
    return this.#past.length > 0;
  }
  get canRedo() {
    return this.#future.length > 0;
  }
  checkpoint(state) {
    this.#past.push(structuredClone(state));
    if (this.#past.length > this.limit) {
      this.#past.shift();
    }
    this.#future = [];
  }
  undo(current) {
    return this.#restore(this.#past, this.#future, current);
  }
  redo(current) {
    return this.#restore(this.#future, this.#past, current);
  }
  #restore(source, destination, current) {
    if (!source.length) {
      return null;
    }
    destination.push(structuredClone(current));
    return source.pop();
  }
}
