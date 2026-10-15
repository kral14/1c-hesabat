/* Calendar values, never UTC timestamps. Keep this contract aligned with onec_dates.py. */
const C1Dates = (() => {
  const pad = n => String(n).padStart(2,'0');
  function parse(value,isEnd=false) {
    if(!value)return null;
    if(value instanceof Date)return Number.isNaN(value.getTime())?null:new Date(value.getTime());
    const text=String(value).trim();
    let m=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/),y,mo,d;
    if(m){[,y,mo,d]=m;}else{
      m=text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
      if(!m)return null;[,d,mo,y]=m;
    }
    const h=m[4]===undefined?(isEnd?23:0):Number(m[4]),mi=m[5]===undefined?(isEnd?59:0):Number(m[5]),s=m[6]===undefined?(isEnd?59:0):Number(m[6]);
    const result=new Date(0);result.setFullYear(Number(y),Number(mo)-1,Number(d));result.setHours(h,mi,s,0);
    if(result.getFullYear()!==Number(y)||result.getMonth()!==Number(mo)-1||result.getDate()!==Number(d)||result.getHours()!==h||result.getMinutes()!==mi||result.getSeconds()!==s)return null;
    return result;
  }
  function format(value,{backend=false,dateOnly=false,isEnd=false}={}) {
    if(!value)return '';
    const date=parse(value,isEnd);if(!date)throw Error('Tarix düzgün deyil: '+value);
    const y=String(date.getFullYear()).padStart(4,'0'),m=pad(date.getMonth()+1),d=pad(date.getDate());
    return (backend?`${y}-${m}-${d}`:`${d}.${m}.${y}`)+(dateOnly?'':` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
  }
  return {parse,format,toBackend:(v,end=false)=>format(v,{backend:true,isEnd:end}),display:v=>format(v),dateOnly:v=>format(v,{dateOnly:true}),milliseconds:(v,end=false)=>parse(v,end)?.getTime() ?? null};
})();
if(typeof window!=='undefined')window.C1Dates=C1Dates;
if(typeof module!=='undefined' && module.exports)module.exports=C1Dates;
