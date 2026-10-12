"""Isolated settings preview. No database/1C imports or connections."""
from pathlib import Path
from flask import Flask, render_template, jsonify, request
import datetime
ROOT = Path(__file__).resolve().parents[2]
app = Flask(__name__,template_folder=str(ROOT/'templates'),static_folder=str(ROOT/'static'))
@app.route('/')
def index(): return render_template('index.html')
@app.route('/api/<path:name>',methods=['GET','POST'])
def fixture(name):
    if name == 'documents/list':
        payload=request.get_json(silent=True) or {}
        day=datetime.datetime.strptime((payload.get('date_from') or '2026-10-01')[:10],'%Y-%m-%d').strftime('%d.%m.%Y')
        rows=[{'number':'PREVIEW-1','date':day+' 12:00:00','kontragent':'A — nümunə','amount':150},
              {'number':'PREVIEW-2','date':day+' 12:00:00','kontragent':'B — nümunə','amount':50}]
        for rule in reversed(payload.get('sort_rules') or []): rows.sort(key=lambda row:row.get(rule['field'],''),reverse=not rule.get('ascending'))
        if payload.get('navigation_edge')=='end': rows.reverse()
        return jsonify(success=True,items=rows,columns=[{'key':key,'label':label,'width':150} for key,label in [('date','Дата'),('number','Номер'),('kontragent','Контрагент'),('amount','Сумма')]],has_more=False,doc_title='Реализация (önizləmə)')
    return jsonify(success=True,bases=[],items=[],columns=[],has_more=False,presets=[])
if __name__ == '__main__': app.run(host='127.0.0.1',port=5057,debug=False)
