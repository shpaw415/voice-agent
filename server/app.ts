
(function(){
var D={
en:{sub:'Real-time speech-to-speech. Press the button, talk, hang up.',ready:'Ready — your key is set.',
setup:'Setup needed: Dashboard → Plugins → Voice Agent → Settings: paste your xAI API key (the same one you use for Grok image/video works), or fill the vault slug xai-api-key.',
idle:'Press to start',conn:'Connecting…',live:'Live — just talk',ending:'Hanging up…',you:'You',agent:'Agent',
emptyTrans:'The conversation transcript appears here.',noCalls:'No calls yet.',when:'When',dur:'Duration',turns:'Turns',calls:'Calls',
mic:'Microphone permission denied — allow the mic in your browser and retry.',micNone:'No microphone found on this device — use a device that has one (this remote desktop has none).',audio:'Audio initialisation failed on this browser — try Chrome or a recent Safari.',net:'Could not reach the voice service.',
prov:'Provider error',disc:'Connection lost',tok:'Session token problem — try again.',
speak:'Agent speaking',listen:'Listening',reconnect:'Reconnecting…',auto:'Hands-free',hfStop:'Stop hands-free',delegating:'Delegating to the desktop agent: ',foot:'Audio goes from your browser straight to the provider with a short-lived token — the plugin only mints tokens and keeps this log.'},
fr:{sub:'Agent vocal temps réel. Appuie, parle, raccroche.',ready:'Prêt — ta clé est en place.',
setup:'Configuration requise : tableau de bord → Plugins → Voice Agent → Settings : colle ta clé API xAI (celle de Grok image/vidéo convient), ou remplis le slug de coffre xai-api-key.',
idle:'Appuie pour parler',conn:'Connexion…',live:'En ligne — parle naturellement',ending:'Raccrochage…',you:'Toi',agent:'Agent',
emptyTrans:'La transcription de la conversation apparaîtra ici.',noCalls:'Aucun appel pour le moment.',when:'Quand',dur:'Durée',turns:'Tours',calls:'Appels',
mic:'Micro refusé — autorise le micro dans le navigateur et réessaie.',micNone:'Aucun micro détecté sur cet appareil — utilise ton ordinateur (le bureau distant n\'en a pas).',audio:'Échec de l\'initialisation audio sur ce navigateur — essaie Chrome ou un Safari récent.',net:'Service vocal injoignable.',
prov:'Erreur du fournisseur',disc:'Connexion perdue',tok:'Problème de jeton de session — réessaie.',
speak:'L\'agent parle',listen:'Écoute',reconnect:'Reconnexion…',auto:'Mains libres',hfStop:'Arrêter le mode mains libres',delegating:'Délégation à l\'agent du bureau : ',foot:'L\'audio va de ton navigateur au fournisseur avec un jeton éphémère — le plugin ne frappe que les jetons et tient ce journal.'},
es:{sub:'Agente de voz en tiempo real. Pulsa, habla y cuelga.',ready:'Listo — tu clave está puesta.',
setup:'Falta configurar: Panel → Plugins → Voice Agent → Settings: pega tu clave de API de xAI (sirve la misma que usas para Grok imagen/vídeo), o rellena el slug xai-api-key.',
idle:'Pulsa para hablar',conn:'Conectando…',live:'En línea — habla con normalidad',ending:'Colgando…',you:'Tú',agent:'Agente',
emptyTrans:'Aquí aparecerá la transcripción.',noCalls:'Aún no hay llamadas.',when:'Cuándo',dur:'Duración',turns:'Turnos',calls:'Llamadas',
mic:'Micrófono denegado — permítelo en el navegador y reintenta.',micNone:'No se detectó micrófono en este dispositivo — usa tu propio equipo.',audio:'Fallo al iniciar el audio en este navegador — prueba Chrome o un Safari reciente.',net:'No se pudo contactar el servicio de voz.',
prov:'Error del proveedor',disc:'Conexión perdida',tok:'Problema de token — inténtalo de nuevo.',
speak:'El agente habla',listen:'Escuchando',reconnect:'Reconectando…',auto:'Manos libres',hfStop:'Detener el modo manos libres',delegating:'Delegando al agente de escritorio: ',foot:'El audio va de tu navegador al proveedor con un token efímero.'},
de:{sub:'Echtzeit-Sprachagent. Drücken, sprechen, auflegen.',ready:'Bereit — dein Schlüssel ist hinterlegt.',
setup:'Einrichtung nötig: Dashboard → Plugins → Voice Agent → Settings: xAI-API-Schlüssel einfügen (der Grok-Bild/Video-Schlüssel reicht) oder Vault-Slug xai-api-key füllen.',
idle:'Zum Sprechen drücken',conn:'Verbinde…',live:'Live — sprich einfach',ending:'Lege auf…',you:'Du',agent:'Agent',
emptyTrans:'Hier erscheint das Transkript.',noCalls:'Noch keine Anrufe.',when:'Wann',dur:'Dauer',turns:'Runden',calls:'Anrufe',
mic:'Mikrofon verweigert — im Browser erlauben und erneut versuchen.',micNone:'Kein Mikrofon an diesem Gerät gefunden — benutze deinen eigenen Rechner.',audio:'Audio-Initialisierung fehlgeschlagen — Chrome oder aktuelles Safari versuchen.',net:'Sprachdienst nicht erreichbar.',
prov:'Anbieterfehler',disc:'Verbindung verloren',tok:'Token-Problem — nochmals versuchen.',
speak:'Agent spricht',listen:'Hört zu',reconnect:'Verbinde erneut…',auto:'Freihändig',hfStop:'Freihändig-Modus beenden',delegating:'An den Desktop-Agenten delegiert: ',foot:'Audio läuft direkt vom Browser zum Anbieter mit kurzlebigem Token.'}
};
var lang=(navigator.language||'en').slice(0,2).toLowerCase();
var T=D[lang]||D.en;
function $(id){return document.getElementById(id)}
$('t-sub').textContent=T.sub;$('t-empty').textContent=T.emptyTrans;$('t-nocalls').textContent=T.noCalls;$('btn-auto').textContent=T.auto;
$('t-tr').textContent=T.you+'/'+T.agent;$('t-when').textContent=T.when;$('t-dur').textContent=T.dur;$('t-turns').textContent=T.turns;
$('foot').textContent=T.foot;$('t-calls').textContent=T.calls;
var st={ws:null,sid:null,src:null,ctx:null,pctx:null,playing:[],playT:0,t0:0,ut:0,at:0,abuf:'',ap:null,resp:false,timer:null,busy:false,auto:false,manual:false,tries:0,stage:'',inRate:24000};
document.addEventListener('click',function(){try{if(st.pctx&&st.pctx.state==='suspended')st.pctx.resume();if(st.ctx&&st.ctx.state==='suspended')st.ctx.resume();}catch(e){}},true);

function banner(kind,text){var b=$('banner');b.className='banner '+kind;b.textContent=text;}
function pill(text,cls){var p=$('pill');p.textContent=text;p.className='pill'+(cls?' '+cls:'');}
function fmt(s){s=Math.max(0,Math.round(s));var m=Math.floor(s/60);return m+':'+(s%60<10?'0':'')+(s%60);}

fetch('api/status').then(function(r){return r.json()}).then(function(s){
  if(s.hasKey){banner('ok',T.ready);$('mic').disabled=false;$('btn-auto').style.display='inline-block';}
  else{banner('setup',T.setup);}
}).catch(function(){banner('err',T.net);});
loadCalls();
function loadCalls(){fetch('api/calls').then(function(r){return r.json()}).then(function(j){renderCalls(j.calls||[])}).catch(function(){});}
function renderCalls(calls){
  var tb=$('calls');tb.innerHTML='';
  var shown=calls.slice(0,10);
  $('t-nocalls').style.display=shown.length?'none':'block';
  shown.forEach(function(c){
    var tr=document.createElement('tr');
    var d=new Date(c.ts);
    var cells=[d.toLocaleString(),(c.ended?fmt(c.durationSec||0):'…'),(c.userTurns||0)+'/'+(c.agentTurns||0)];
    cells.forEach(function(v){var td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
    tb.appendChild(tr);
  });
}

var mic=$('mic');
mic.onclick=function(){ st.manual=!!st.ws; if(st.ws){hangup();} else {start();} };

var btnAuto=$('btn-auto');
function setAutoUi(on){btnAuto.textContent=on?T.hfStop:T.auto;btnAuto.style.borderColor=on?'var(--err)':'';btnAuto.style.color=on?'var(--err)':'';mic.style.display=on?'none':'';}
btnAuto.onclick=function(){
  if(st.auto){st.auto=false;setAutoUi(false);if(st.ws){st.manual=true;hangup();}else{pill(T.idle);}}
  else{st.auto=true;st.manual=false;setAutoUi(true);if(!st.ws)start();}
};



function start(){
  if(st.busy)return; st.busy=true; mic.disabled=true; pill(T.conn);
  fetch('api/session',{method:'POST'}).then(function(r){
    return r.json().then(function(j){return {ok:r.ok,j:j}});
  }).then(function(res){
    if(!res.ok){showErr(res.j);reset();return;}
    openCall(res.j);
  }).catch(function(){banner('err',T.net);reset();});
}

function openCall(s){
  st.sid=s.sessionId;st.stage='mic';
  navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}}).then(function(stream){
    st.src=stream;st.stage='audio';
    var AC=window.AudioContext||window.webkitAudioContext;
    try{ st.ctx=new AC({sampleRate:24000}); }catch(e){ st.ctx=new AC(); }
    try{ if(st.ctx.resume)st.ctx.resume(); }catch(e){}
    try{ st.pctx=new AC({sampleRate:24000}); }catch(e){ st.pctx=new AC(); }
    st.inRate=st.ctx.sampleRate||24000;
    var src=st.ctx.createMediaStreamSource(stream);
    var startWs=function(){
      try{
        var ws=new WebSocket(s.wsUrl,['xai-client-secret.'+s.token]);
        st.ws=ws;
        ws.onopen=function(){
          st.tries=0;
          ws.send(JSON.stringify({type:'session.update',session:{voice:s.voice,instructions:s.instructions,turn_detection:{type:'server_vad'},tools:s.tools||[]}}));
          st.t0=Date.now();st.ut=0;st.at=0;st.abuf='';st.ap=null;st.resp=false;
          mic.disabled=false;mic.classList.add('active');mic.textContent='■';
          pill(T.live,'on');
          st.timer=setInterval(function(){$('timer').textContent=fmt((Date.now()-st.t0)/1000);},500);
        };
        ws.onmessage=onEvent;
        ws.onclose=function(){
          if(!st.ws)return;
          if(st.auto&&!st.manual&&st.tries<5){
            pill(T.reconnect);hangup(true);st.tries++;
            setTimeout(function(){start();},1500*st.tries);
          } else { banner('err',T.disc);hangup(true); }
        };
        ws.onerror=function(){};
      }catch(e){banner('err',T.audio);reset();}
    };
    var scriptCapture=function(){
      var sp=st.ctx.createScriptProcessor(4096,1,1);
      sp.onaudioprocess=function(ev){ sendChunk(ev.inputBuffer.getChannelData(0)); };
      var g=st.ctx.createGain();g.gain.value=0;
      src.connect(sp);sp.connect(g);g.connect(st.ctx.destination);
    };
    var workless=false;
    try{ workless=!(st.ctx.audioWorklet&&st.ctx.audioWorklet.addModule); }catch(e){ workless=true; }
    if(workless){ scriptCapture();startWs(); }
    else{
      st.ctx.audioWorklet.addModule(workletUrl()).then(function(){
        var tap=new AudioWorkletNode(st.ctx,'tap');
        tap.port.onmessage=function(ev){ sendChunk(new Float32Array(ev.data)); };
        src.connect(tap);startWs();
      }).catch(function(){ scriptCapture();startWs(); });
    }
  }).catch(function(e){
    if(st.stage==='mic'){var none=e&&(e.name==='NotFoundError'||e.name==='DevicesNotFoundError'||e.name==='OverconstrainedError');banner('err',none?T.micNone:T.mic);}
    else{banner('err',T.audio);}
    reset();
  });
}

function sendChunk(ch){
  if(!st.ws||st.ws.readyState!==1)return;
  st.ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:f32ToB64(to24k(ch,st.inRate))}));
}
function to24k(f,rate){
  rate=rate||24000;if(rate===24000)return f;
  var n=Math.max(1,Math.round(f.length*24000/rate)),out=new Float32Array(n);
  for(var i=0;i<n;i++){var t=i*rate/24000,i0=Math.floor(t),fr=t-i0,a=f[i0]||0,b=(f[i0+1]===undefined)?a:f[i0+1];out[i]=a+(b-a)*fr;}
  return out;
}

function onEvent(ev){
  var m;try{m=JSON.parse(ev.data);}catch(e){return;}
  var t=m.type||'';
  if(t==='response.output_audio.delta'||t==='response.output_audio_delta'||t==='response.audio.delta'){
    if(m.delta||m.audio){play(m.delta||m.audio);st.resp=true;}
  } else if(t==='response.output_audio_transcript.delta'||t==='response.output_audio.transcript.delta'||t==='response.audio_transcript.delta'){
    agentTxt(m.delta||m.text||'');
  } else if(t==='response.done'||t==='response.completed'){st.resp=false;st.abuf='';st.ap=null;}
  else if(t==='input_audio_buffer.speech_started'){
    stopPlay();
    if(st.resp&&st.ws&&st.ws.readyState===1){try{st.ws.send(JSON.stringify({type:'response.cancel'}));}catch(e){}}
  }
  else if(t.indexOf('input_audio_transcription')>=0&&typeof m.transcript==='string'&&m.transcript){
    userTxt(m.transcript);st.ut++;
  }
  else if(t==='response.output_item.done'&&m.item&&m.item.type==='function_call'){runDelegate(m.item);}
  else if(t==='error'){var d=(m.error&&(m.error.message||m.error.code))||'unknown';banner('err',T.prov+': '+String(d).slice(0,160));}
}

function workletUrl(){
  var code='class Tap extends AudioWorkletProcessor{constructor(){super();this.n=0;this.b=new Float32Array(2048);}' +
    'process(inputs){var c=inputs[0][0];if(c){for(var i=0;i<c.length;i++){this.b[this.n++]=c[i];' +
    'if(this.n===2048){this.port.postMessage(this.b.slice(0));this.n=0;}}}}return true;}}' +
    'registerProcessor(\'tap\',Tap);';
  return URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
}
function f32ToB64(f){
  var n=f.length,out=new Uint8Array(n*2);
  for(var i=0;i<n;i++){var v=Math.max(-1,Math.min(1,f[i]));var s=v<0?v*32768:v*32767;var x=Math.round(s);
    out[2*i]=x&255;out[2*i+1]=(x>>8)&255;}
  var bin='';for(var j=0;j<out.length;j+=8192){bin+=String.fromCharCode.apply(null,out.subarray(j,j+8192));}
  return btoa(bin);
}
function b64ToF32(b64){
  var bin=atob(b64),n=bin.length>>1,f=new Float32Array(n);
  for(var i=0;i<n;i++){var v=(bin.charCodeAt(2*i+1)<<8)|bin.charCodeAt(2*i);if(v>=32768)v-=65536;f[i]=v/32768;}
  return f;
}
function play(b64){
  var f=b64ToF32(b64);if(!f.length)return;
  var ctx=st.pctx,buf=ctx.createBuffer(1,f.length,24000);buf.copyToChannel(f,0);
  var src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);
  var now=ctx.currentTime;if(st.playT<now)st.playT=now+0.02;
  src.start(st.playT);st.playT+=buf.duration;
  st.playing.push(src);pill(T.speak,'speak');
  src.onended=function(){var i=st.playing.indexOf(src);if(i>=0)st.playing.splice(i,1);if(!st.playing.length&&st.ws)pill(T.live,'on');};
}
function stopPlay(){st.playing.forEach(function(s){try{s.stop();}catch(e){}});st.playing=[];st.playT=0;}

function addMsg(cls,text){
  var box=$('log');var e=$('t-empty');if(e)e.style.display='none';
  var div=document.createElement('div');div.className='msg '+cls;
  if(cls!=='sys'){var w=document.createElement('span');w.className='who';w.textContent=cls==='user'?T.you:T.agent;div.appendChild(w);}
  var p=document.createElement('span');p.textContent=text;
  div.appendChild(p);box.appendChild(div);
  while(box.children.length>200)box.removeChild(box.firstChild);
  box.scrollTop=box.scrollHeight;
  return p;
}
function userTxt(t){addMsg('user',t);}
function runDelegate(item){
  var task='';
  try{var a=JSON.parse(item.arguments||'{}');task=String(a.task||'');}catch(e){}
  if(!task){toolOut(item.call_id,'No task was provided.');return;}
  addMsg('sys',T.delegating+task);
  fetch('api/delegate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:task})})
    .then(function(r){return r.json()})
    .then(function(j){
      if(!j||!j.id){toolOut(item.call_id,'Delegation failed to start.');return;}
      pollDelegate(j.id,0,item.call_id);
    })
    .catch(function(){toolOut(item.call_id,'Delegation failed: network.');});
}
function pollDelegate(id,n,callId){
  if(!st.ws||st.ws.readyState!==1)return;
  if(n>200){toolOut(callId,'The task did not finish in time.');return;}
  fetch('api/delegate?id='+encodeURIComponent(id))
    .then(function(r){return r.json()})
    .then(function(j){
      if(j&&j.done){toolOut(callId,j.result||'(empty response)');}
      else{setTimeout(function(){pollDelegate(id,n+1,callId);},1500);}
    })
    .catch(function(){setTimeout(function(){pollDelegate(id,n+1,callId);},3000);});
}
function toolOut(callId,out){
  if(!st.ws||st.ws.readyState!==1||!callId)return;
  st.ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:String(out).slice(0,4000)}}));
  st.ws.send(JSON.stringify({type:'response.create'}));
}
function agentTxt(d){st.abuf=(st.abuf+d).slice(-4000);
  if(st.ap){st.ap.textContent=st.abuf;}
  else{st.ap=addMsg('agent',st.abuf);}
  $('log').scrollTop=$('log').scrollHeight;st.at++;}

function showErr(j){
  var code=(j&&j.error)||'net';
  if(code==='missing_key')banner('setup',T.setup);
  else if(code==='mic')banner('err',T.mic);
  else if(code==='micnone')banner('err',T.micNone);
  else if(code==='token')banner('err',T.tok);
  else banner('err',T.net+((j&&j.detail)?' ('+String(j.detail).slice(0,160)+')':''));
}
function reset(){st.busy=false;mic.disabled=false;}
function hangup(fromClose){
  var dur=st.t0?(Date.now()-st.t0)/1000:0;
  if(st.timer){clearInterval(st.timer);st.timer=null;}
  $('timer').textContent='';
  stopPlay();
  if(st.ws){var w=st.ws;st.ws=null;try{w.onclose=null;w.close();}catch(e){}}
  if(st.src){st.src.getTracks().forEach(function(t){t.stop();});st.src=null;}
  if(st.ctx){try{st.ctx.close();}catch(e){}st.ctx=null;}
  if(st.pctx){try{st.pctx.close();}catch(e){}st.pctx=null;}
  mic.classList.remove('active');mic.textContent='●';pill(T.idle);
  var sid=st.sid;st.sid=null;st.busy=false;st.ap=null;st.abuf='';
  if(sid){
    if(!fromClose)pill(T.ending);
    fetch('api/calls/end',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sid,durationSec:Math.round(dur),userTurns:st.ut,agentTurns:st.at})})
      .then(function(){pill(T.idle);loadCalls();})
      .catch(function(){pill(T.idle);loadCalls();});
  } else { pill(T.idle); loadCalls(); }
}
pill(T.idle);
})();