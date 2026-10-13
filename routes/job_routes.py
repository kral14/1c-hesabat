"""Durable read jobs with per-job access tokens."""
from flask import Blueprint, jsonify, request
from services.onec_service import one_c

job_bp = Blueprint('jobs', __name__)


@job_bp.post('/api/jobs/start')
def start_job():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(one_c.start_job(data.get('action'), data.get('payload') or {}, data.get('request_id'), data.get('token')))
    except (ValueError, PermissionError) as error:
        return jsonify(success=False, error=str(error)), 400
    except Exception as error:
        return jsonify(success=False, error=str(error)), 503


@job_bp.post('/api/jobs/status')
def job_status():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(success=True, job=one_c.job(data.get('job_id'), data.get('token', ''), data.get('after', -1)))
    except PermissionError as error:
        return jsonify(success=False, error=str(error)), 403
    except Exception as error:
        return jsonify(success=False, error=str(error)), 503


@job_bp.post('/api/connection/worker-recover')
def worker_recover():
    data = request.get_json(silent=True) or {}
    if data.get('confirmed') is not True:
        return jsonify(success=False, error='İşləyən sessiyanı bağlamaq üçün təsdiq tələb olunur.'), 403
    try:
        one_c.shutdown_worker(confirmed=True)
        return jsonify(success=True)
    except Exception as error:
        return jsonify(success=False, error=str(error)), 503
