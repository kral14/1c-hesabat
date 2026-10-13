"""Short control calls are serviced before queued background report chunks."""
import itertools
import queue


class ActionQueue:
    def __init__(self):
        self.queue = queue.PriorityQueue()
        self.sequence = itertools.count()

    def put(self, value):
        action, payload, _ = value
        if action == 'shutdown': priority = -1
        elif action in ('ping', 'connection_probe', 'get_users') or payload.get('_login'): priority = 0
        elif action in ('get_audit_events', 'universal_report', 'order_analysis', 'generate'): priority = 3
        else: priority = 1
        self.queue.put((priority, next(self.sequence), value))

    def get(self, *args, **kwargs): return self.queue.get(*args, **kwargs)[2]
    def empty(self): return self.queue.empty()
    def qsize(self): return self.queue.qsize()
