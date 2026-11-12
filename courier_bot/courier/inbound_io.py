"""Bounded I/O pumps: Telegram polling and backend forwarding never own SQLite."""
import time
from .ack_pump import AckPump
from .raw_log import observe

class PollPump:
    def __init__(self,telegram,wake,clock=time.monotonic):
        self.telegram=telegram;self.pump=AckPump(wake);self.clock=clock;self.until=0;self.failures=0
    def take(self,offset):
        done=self.pump.poll()
        if done:
            _,updates,error=done
            if error:
                self.failures+=1;self.until=float('inf') if getattr(error,'status',0) in (401,403,409) else self.clock()+max(getattr(error,'retry_after',0),min(60,2**min(self.failures,6)))
            else:self.failures=0
            return updates,error
        if self.pump.pending is None and self.clock()>=self.until:
            self.pump.submit({'offset':offset},lambda:observe('TELEGRAM_POLL',lambda:self.telegram.updates(offset,timeout=25)))
        return None
    def close(self):self.pump.close()
