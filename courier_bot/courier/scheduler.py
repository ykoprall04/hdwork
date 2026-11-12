"""Durable, dynamic per-chat pacing. No local message queue or second poller."""
import collections
import math
import threading
import time
from .http import TransportError

class LocalBudget(TransportError):
    local_budget = True

class ApiBudget:
    def __init__(self, clock=time.monotonic):
        self.clock=clock;self.lock=threading.Lock();self.used={k:collections.deque() for k in ('normal','ack','lease')}
    def take(self,path):
        kind='lease' if '/worker/' in path else 'ack' if path.endswith('/result') else 'normal'
        limits={'normal':170,'ack':90,'lease':10}  # <=270/min total, reserve room below server 300.
        with self.lock:
            now=self.clock();items=self.used[kind]
            while items and items[0]<=now-60:items.popleft()
            if len(items)>=limits[kind]:raise LocalBudget(429,max(1,math.ceil(items[0]+60-now)))
            items.append(now)

class Scheduler:
    def __init__(self,journal,group_per_minute=18,global_per_second=1,clock=time.time):
        if not 1<=group_per_minute<=18 or not .1<=global_per_second<=1:raise ValueError('scheduler_rates_rejected')
        self.journal=journal;self.clock=clock;self.group_max=group_per_minute;self.global_rate=global_per_second
        self.state=journal.scheduler_state() or {'global_at':0,'groups':{}}
        if not isinstance(self.state.get('groups'),dict) or not isinstance(self.state.get('global_at'),(int,float)):raise ValueError('scheduler_state_rejected')
    def group(self,chat):
        row=self.state['groups'].setdefault(chat,{'at':0,'rate':self.group_max,'good':0})
        row['rate']=min(self.group_max,row['rate']);return row
    def blocked(self):
        now=self.clock();return [chat for chat,row in self.state['groups'].items() if row['at']>now]
    def reserve(self,chat):
        now=self.clock();row=self.group(chat);wait=max(self.state['global_at'],row['at'])-now
        if wait>0:raise LocalBudget(429,max(1,math.ceil(wait)))
        self.state['global_at']=now+1/self.global_rate;row['at']=now+60/row['rate'];self.journal.save_scheduler(self.state)
    def limited(self,chat,retry_after):
        row=self.group(chat);row['rate']=max(1,row['rate']*.8);row['good']=0;row['at']=max(row['at'],self.clock()+max(1,retry_after));self.journal.save_scheduler(self.state)
    def durable_success(self,chat):
        row=self.group(chat);row['good']+=1
        if row['good']>=20:row['rate']=min(self.group_max,row['rate']+1);row['good']=0
        self.journal.save_scheduler(self.state)
    def delay(self,active=False):
        now=self.clock();global_wait=self.state['global_at']-now
        if global_wait>0:return min(2,global_wait)
        if active:return 0
        waits=[row['at']-now for row in self.state['groups'].values()]
        return min(2,min(waits)) if waits and min(waits)>0 else 2
