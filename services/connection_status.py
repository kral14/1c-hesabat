"""Connection diagnostics without dereferencing COM objects or exposing keys."""
import time


def worker_snapshot(worker, pid, process_started_at, now=None):
    now = time.time() if now is None else now
    connections = list(worker.connections.items())
    metadata = getattr(worker,'connection_details',{})
    details = [dict(metadata[key]) for key,_ in connections if key in metadata]
    return dict(available=True,pid=pid,busy=worker.busy,worker_alive=worker.is_alive(),
                queued=worker.req_q.qsize(),session_count=len(connections),
                connection_generation=worker.connection_generation,
                session_tokens=[f'{pid}:{id(conn)}' for _,conn in connections],
                current_action=getattr(worker,'current_action','') if worker.busy else '',
                action_age=max(0,time.monotonic()-getattr(worker,'action_started',time.monotonic())) if worker.busy else 0,
                process_started_at=process_started_at,process_uptime_seconds=max(0,now-process_started_at),
                connections=details)


def public_details(state):
    """Expose only diagnostics needed by the launcher; never auth/cache tokens."""
    keys=('pid','available','worker_alive','busy','queued','session_count','current_action','action_age',
          'process_started_at','process_uptime_seconds','connection_generation','connections')
    result = {key:state.get(key) for key in keys}
    allowed = ('server','ref','user','connected_at','generation')
    result['connections'] = [{key:conn.get(key) for key in allowed} for conn in state.get('connections') or []]
    return result
