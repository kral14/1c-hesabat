"""Materialize results on the owning STA thread before crossing a thread/process boundary."""
import json
import queue


class ResultQueue(queue.Queue):
    def put(self, item, *args, **kwargs):
        ok, result = item
        if ok:
            try:
                result = json.loads(json.dumps(result, ensure_ascii=False, default=str))
            except Exception as error:
                ok, result = False, RuntimeError('1C nəticəsi çevrilmədi: ' + str(error))
        else:
            # Native COM error objects must also remain on the apartment that owns them.
            result = RuntimeError(str(result))
        return super().put((ok, result), *args, **kwargs)
