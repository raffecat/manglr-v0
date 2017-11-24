export class TaskQueue {
  queue: any[] = [];
  push(fn:any) {
    this.queue.push(fn);
  }
  run() {
    const queue = this.queue;
    var idx = 0;
    function done() {
      setImmediate(next);
    }
    function next() {
      if (idx < queue.length) {
        const step = queue[idx++];
        step(done);
      }
    }
    next();
  }
}
