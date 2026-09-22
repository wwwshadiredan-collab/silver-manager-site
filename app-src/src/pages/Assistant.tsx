import { FormEvent, useState } from 'react'
import { Bot, Send, Sparkles, ShieldCheck, Database } from 'lucide-react'
import { answerAssistant, type AssistantReply } from '../lib/assistant'
import { Card, PageHeader } from '../components/UI'

type Msg={role:'user'|'assistant',text:string,details?:string[]}

export function Assistant(){
  const [input,setInput]=useState(''); const [busy,setBusy]=useState(false)
  const [msgs,setMsgs]=useState<Msg[]>([{role:'assistant',text:'أهلاً، أنا مساعد Silver Manager. بقدر أقرأ بيانات التطبيق المحلية وأعطيك ملخصات وحسابات خاصة بالفضة. ما بغيّر أي قيد مالي بدون تأكيد.'}])
  const ask=async(text:string)=>{if(!text.trim())return; setMsgs(m=>[...m,{role:'user',text}]);setInput('');setBusy(true); const r:AssistantReply=await answerAssistant(text); setMsgs(m=>[...m,{role:'assistant',text:r.text,details:r.details}]);setBusy(false)}
  const submit=(e:FormEvent)=>{e.preventDefault();ask(input)}
  const chips=['شو مبيعات اليوم؟','قديش وزن الفضة المتوفر 925؟','شو العمليات غير المتزامنة؟','احسب 18.4 غرام 925 على سعر 1.2 وأجرة 8']
  return <><PageHeader title="المساعد الذكي" description="مساعد محلي متخصص بالفضة يعمل حتى بدون API خارجي في هذه المرحلة"/>
    <Card className="hero-panel slim-hero mb16">
      <div className="hero-content">
        <div>
          <div className="eyebrow"><Sparkles size={16}/> مساعد مخصص للفضة</div>
          <h2>اسأل التطبيق بلغة عادية وخذ إجابة مباشرة</h2>
          <p>المساعد يقرأ البيانات المحلية للتطبيق ويجاوبك عن المبيعات، المخزون، الوزن، والمزامنة، مع قابلية تطويره لاحقاً إلى مساعد أذكى من الخادم.</p>
        </div>
        <div className="hero-pills">
          <div><span>العمل بدون إنترنت</span><b><ShieldCheck size={14}/> مدعوم</b></div>
          <div><span>مصدر الإجابات</span><b><Database size={14}/> بيانات التطبيق</b></div>
          <div><span>الوضع الحالي</span><b>قراءة وتحليل فقط</b></div>
        </div>
      </div>
    </Card>
    <div className="assistant-layout"><Card className="chat-card"><div className="chat-messages">{msgs.map((m,i)=><div key={i} className={`message ${m.role}`}><div className="message-icon">{m.role==='assistant'?<Bot size={18}/>:<span>أنت</span>}</div><div><p>{m.text}</p>{m.details&&<ul>{m.details.map((d,j)=><li key={j}>{d}</li>)}</ul>}</div></div>)}{busy&&<div className="message assistant"><div className="message-icon"><Bot size={18}/></div><div><p>عم بحلل البيانات المحلية…</p></div></div>}</div><form className="chat-input" onSubmit={submit}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="اسأل عن المبيعات، الوزن، المخزون، المزامنة…"/><button className="btn primary"><Send size={17}/> إرسال</button></form></Card><Card><div className="card-title"><Sparkles size={18}/><b>أسئلة سريعة</b></div><div className="chip-list">{chips.map(c=><button key={c} onClick={()=>ask(c)}>{c}</button>)}</div><div className="notice info mt">المساعد الحالي يقرأ بيانات التطبيق فقط ويجري حسابات محلية. ربط نموذج AI خارجي سيضاف لاحقاً بشكل آمن من الخادم، بدون مفاتيح سرية داخل المتصفح.</div></Card></div></>
}
