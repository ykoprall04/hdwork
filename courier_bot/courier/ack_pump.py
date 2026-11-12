"""One bounded daemon doing backend ACK HTTP only. SQLite stays on Courier's owner thread."""
import threading

class AckPump:
    def __init__(self):
        self.pending = None
        self.completed = None
        self.closed = False

    def submit(self, row, call):
        if self.closed or self.pending is not None:
            return False
        self.pending = row
        def work():
            try:
                self.completed = (row, call(), None)
            except Exception as error:
                self.completed = (row, None, error)
        threading.Thread(target=work, daemon=True, name='courier-ack-http').start()
        return True

    def poll(self):
        value = self.completed
        if value is not None:
            self.completed = None
            self.pending = None
        return value

    def close(self):
        # In-flight ACK may be repeated idempotently after restart. Never touch SQLite here.
        self.closed = True
