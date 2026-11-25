/* BSG CBT portal — Supabase Auth + server-checked exam submissions. */
const cfg=window.BSG_CBT_CONFIG||{};
const ready=!!(cfg.url&&cfg.anonKey&&window.supabase);
const db=ready?window.supabase.createClient(cfg.url,cfg.anonKey):null;
let currentRole=null,currentProfile=null,activeExam=null,examTimer=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){$("toast").textContent=t;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500)}
function showLogin(role){currentRole=role;$("welcome").classList.add("hidden");$("dashboard").classList.add("hidden");$("auth").classList.remove("hidden");$("auth-title").textContent=role==="admin"?"Administrator Login":role[0].toUpperCase()+role.slice(1)+" Login";$("auth-error").textContent=""}
function goHome(){$("auth").classList.add("hidden");$("dashboard").classList.add("hidden");$("welcome").classList.remove("hidden")}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();if(!ready){$("auth-error").textContent="Database configuration is missing. Reload after setup.";return}const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){$("auth-error").textContent=error.message;return}await loadDashboard()});
$("logout").addEventListener("click",async()=>{if(db)await db.auth.signOut();currentProfile=null;activeExam=null;clearInterval(examTimer);goHome()});
async function loadDashboard(){const {data:{user}}=await db.auth.getUser();if(!user)return goHome();const {data:profile,error}=await db.from("profiles").select("*").eq("id",user.id).single();if(error||!profile){$("auth-error").textContent="Your portal profile is missing. Contact the administrator.";await db.auth.signOut();return}if(currentRole&&profile.role!==currentRole){$("auth-error").textContent="This account does not have the selected role.";await db.auth.signOut();return}currentProfile=profile;currentRole=profile.role;$("auth").classList.add("hidden");$("welcome").classList.add("hidden");$("dashboard").classList.remove("hidden");$("dash-title").textContent=profile.role==="admin"?"Administrator Dashboard":profile.role==="examiner"?"Examiner Dashboard":"Student Dashboard";$("user-email").textContent=profile.full_name+" · "+user.email;await renderDashboard()}
async function renderDashboard(){const root=$("dash-content");root.innerHTML='<p class="muted">Loading workspace…</p>';if(currentRole==="admin")return adminDashboard(root);if(currentRole==="examiner")return examinerDashboard(root);return studentDashboard(root)}
async function adminDashboard(root){
 const [{data:exams},{count:examiners},{count:students},{count:submissions}]=await Promise.all([
  db.from("exams").select("*").order("created_at",{ascending:false}),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","examiner"),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","student"),
  db.from("submissions").select("*",{count:"exact",head:true})
 ]);
 root.innerHTML=`<div class="stats"><div class="tile"><strong>${exams?.length||0}</strong><span>Examinations</span></div><div class="tile"><strong>${examiners||0}</strong><span>Examiners</span></div><div class="tile"><strong>${students||0}</strong><span>Students</span></div><div class="tile"><strong>${submissions||0}</strong><span>Submissions</span></div></div>
 <div class="data-card"><h3>Create examiner accounts</h3><p class="muted tiny">One examiner per line: Full Name,email,password,examiner. Only Super Admin can create examiner accounts.</p><form id="users-form"><textarea id="bulk-users" rows="4" placeholder="Examiner Name,examiner@example.com,TempPass123,examiner"></textarea><button class="primary">Create examiner account(s)</button></form></div>
 <div class="section-title"><h2>Examination monitoring & marks export</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><p class="muted tiny">Created by examiner ID: ${esc(x.created_by)}</p><div class="action-row"><button class="secondary" onclick="exportResults('${x.id}','csv')">Export CSV</button><button class="secondary" onclick="exportResults('${x.id}','xlsx')">Export Excel</button><button class="secondary" onclick="exportResults('${x.id}','pdf')">Print / PDF</button></div></div>`).join("")||'<p class="muted">No examinations have been created by examiners yet.</p>'}
 <div class="notice">Super Admin is in monitoring mode: examiner-created question papers, answer keys, schedules and marking are managed by the examiner. Exported marks can be entered into the separate BSG OYMS 2.0 main website manually. This portal does not connect to or modify that website.</div>`;
 $("users-form").addEventListener("submit",createUsers);
}
async function createUsers(e){e.preventDefault();const lines=$("bulk-users").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const users=[];for(const line of lines){const p=line.split(",").map(x=>x.trim());if(p.length!==4){toast("Each row must be: Full Name,email,password,examiner");return}users.push({full_name:p[0],email:p[1],password:p[2],role:p[3].toLowerCase()})}if(!users.length)return toast("Enter at least one examiner account.");const {data,error}=await db.functions.invoke("admin-create-users",{body:{users}});if(error)return toast(error.message);const ok=data?.created||0;const failed=(data?.results||[]).filter(x=>!x.success);toast(ok+" examiner account(s) created; "+failed.length+" failed.");if(failed.length)alert(failed.map(x=>x.email+": "+x.error).join("\n"));$("bulk-users").value="";renderDashboard()}
async function studentDashboard(root){const {data:as,error}=await db.from("exam_assignments").select("id,exam_id,exams(*)").eq("student_id",currentProfile.id);if(error){root.textContent=error.message;return}const {data:subs}=await db.from("submissions").select("exam_id,status,marks_awarded").eq("student_id",currentProfile.id);root.innerHTML='<div class="section-title"><h2>My examinations</h2></div>'+(as||[]).map(a=>{const x=a.exams||{},s=(subs||[]).find(z=>z.exam_id===x.id);return `<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(s?.status||x.status)}</span></div>${s?(s.status==="published"?"<p>Result: "+s.marks_awarded+" marks</p>":"<p>Submitted. Awaiting examiner review and result publication.</p>"):x.status==="published"?'<button onclick="startExam(\''+x.id+'\')">Start examination</button>':'<p class="muted">This examination is not open yet.</p>'}</div>`}).join("")||'<div class="data-card">No examinations assigned yet.</div>'}
async function startExam(id){const {data:started,error:se}=await db.rpc("start_exam",{p_exam_id:id});if(se)return toast(se.message);const {data:exam,error}=await db.from("exams").select("*").eq("id",id).single();const {data:questions,error:qe}=await db.from("questions").select("*").eq("exam_id",id).order("position");if(error||qe||!questions?.length)return toast("Questions are not available yet.");activeExam={exam,questions,startedAt:new Date(started).getTime()};const root=$("dash-content");root.innerHTML=`<div class="exam-top"><div><span class="eyebrow">EXAM IN PROGRESS</span><h2>${esc(exam.title)}</h2><p>${exam.total_marks} marks · ${exam.duration_minutes} minutes</p></div><div class="status" id="timer"></div></div><div class="notice">Your start time is recorded by the server. Do not close the page before submitting. If the exam window or duration expires, the server will reject late submissions.</div><form id="exam-form">${questions.map((q,i)=>`<div class="question"><b>Q${i+1}. ${esc(q.question_text)}</b><p class="muted tiny">${q.marks} marks</p>${q.question_type==="mcq"?(q.options||[]).map(o=>`<label><input type="radio" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join(""):`<textarea class="answer-input" name="q_${q.id}" placeholder="Type your answer…"></textarea>`}</div>`).join("")}<button class="primary">Submit examination</button></form>`;const tick=()=>{const left=Math.max(0,Math.ceil((activeExam.startedAt+exam.duration_minutes*60000-Date.now())/1000));$("timer").textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");if(left<=0){clearInterval(examTimer);submitExam(true)}};tick();examTimer=setInterval(tick,1000);$("exam-form").addEventListener("submit",e=>{e.preventDefault();submitExam(false)})}
async function submitExam(auto){if(!activeExam)return;clearInterval(examTimer);const form=$("exam-form");if(!form)return;const fd=new FormData(form);const answers=activeExam.questions.map(q=>({question_id:q.id,answer_text:String(fd.get("q_"+q.id)||"")}));const {error}=await db.rpc("submit_exam",{p_exam_id:activeExam.exam.id,p_answers:answers});activeExam=null;if(error){toast(error.message);return}toast(auto?"Time expired. Submission received if within the server deadline.":"Examination submitted successfully.");await studentDashboard($("dash-content"))}
async function examinerDashboard(root){
 const {data:exams,error:ee}=await db.from("exams").select("*").order("created_at",{ascending:false});
 if(ee){root.textContent=ee.message;return}
 const {data:subs,error}=await db.from("submissions").select("*,exams(title,total_marks),answers(*,questions(question_text,marks,question_type))").order("submitted_at",{ascending:true});
 if(error){root.textContent=error.message;return}
 const ids=[...new Set((subs||[]).map(s=>s.student_id))];
 const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name,email").in("id",ids):{data:[]};
 const pmap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
 root.innerHTML=`<div class="data-card"><h3>Create student accounts</h3><p class="muted tiny">One student per line: Full Name,email,password,student. Examiners can create student accounts for their own examinations.</p><form id="student-users-form"><textarea id="student-users" rows="3" placeholder="Student Name,student@example.com,TempPass123,student"></textarea><button class="primary">Create student account(s)</button></form></div>
 <div class="data-card"><h3>Create examination & question paper</h3><form id="create-exam" class="form-grid"><label>Examination title<input name="title" required placeholder="Pravesh & Pratham Sopan"></label><label>Level<select name="level"><option>Combined Pravesh + Pratham Sopan</option><option>Pravesh</option><option>Pratham Sopan</option><option>Dwitiya Sopan</option></select></label><label>Total marks<input name="total_marks" type="number" min="1" value="100" required></label><label>Duration (minutes)<input name="duration_minutes" type="number" min="1" value="180" required></label><label>Start date/time<input name="starts_at" type="datetime-local"></label><label>End date/time<input name="ends_at" type="datetime-local"></label><label class="wide">Instructions<textarea name="instructions" rows="2"></textarea></label><div class="wide"><button class="primary">Save examination as draft</button></div></form></div>
 <div class="section-title"><h2>My examinations & question papers</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><div class="action-row"><button class="secondary" onclick="addQuestion('${x.id}')">Add question & answer key</button><button class="secondary" onclick="assignExam('${x.id}')">Assign student</button><button onclick="setExamStatus('${x.id}','published')">Open exam</button><button class="secondary" onclick="setExamStatus('${x.id}','closed')">Close exam</button></div></div>`).join("")||'<p class="muted">Create your first examination above.</p>'}
 <div class="section-title"><h2>Submitted answer sheets & marking</h2></div>
 ${(subs||[]).map(s=>`<div class="data-card"><h3>${esc(s.exams?.title)} — ${esc(pmap[s.student_id]?.full_name||pmap[s.student_id]?.email||"Student")}</h3><p class="muted tiny">Submitted: ${new Date(s.submitted_at).toLocaleString()} · ${esc(s.status)}</p>${(s.answers||[]).map(a=>`<div class="question"><b>${esc(a.questions?.question_text)}</b><p>${esc(a.answer_text||"No answer")}</p><p class="muted tiny">Automatic MCQ marks: ${a.auto_marks||0}</p><label>Examiner marks (max ${a.questions?.marks})<input type="number" min="0" max="${a.questions?.marks}" step="0.5" id="mark-${a.id}" value="${a.marks_awarded??a.auto_marks??0}"></label><button class="secondary" onclick="saveMark('${a.id}')">Save marks</button></div>`).join("")}<button onclick="publishResult('${s.id}')">Finalise & publish result</button></div>`).join("")||'<p class="muted">No submitted scripts yet.</p>'}
 <div class="notice">Create the question paper and answer key before opening the exam. The system checks that question marks add up to the exam total and that every MCQ has a correct answer.</div>`;
 $("student-users-form").addEventListener("submit",async e=>{e.preventDefault();const lines=$("student-users").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const users=[];for(const line of lines){const p=line.split(",").map(x=>x.trim());if(p.length!==4||p[3].toLowerCase()!=="student"){toast("Each row must be: Full Name,email,password,student");return}users.push({full_name:p[0],email:p[1],password:p[2],role:"student"})}if(!users.length)return toast("Enter at least one student.");const {data,error}=await db.functions.invoke("admin-create-users",{body:{users}});if(error)return toast(error.message);const failed=(data?.results||[]).filter(x=>!x.success);toast((data?.created||0)+" student account(s) created; "+failed.length+" failed.");if(failed.length)alert(failed.map(x=>x.email+": "+x.error).join("\n"));$("student-users").value="";renderDashboard()});
 $("create-exam").addEventListener("submit",createExam);
}
async function saveMark(id){const marks=Number($("mark-"+id).value);if(!Number.isFinite(marks)||marks<0)return toast("Invalid mark.");const {error}=await db.from("answers").update({marks_awarded:marks}).eq("id",id);toast(error?error.message:"Marks saved")}
async function publishResult(id){const {data:ans,error}=await db.from("answers").select("marks_awarded,auto_marks").eq("submission_id",id);if(error)return toast(error.message);const total=(ans||[]).reduce((n,a)=>n+Number(a.marks_awarded??a.auto_marks??0),0);const {error:e}=await db.from("submissions").update({status:"published",marks_awarded:total,published_at:new Date().toISOString()}).eq("id",id);toast(e?e.message:"Result published: "+total+" marks")}
async function exportResults(examId,format){const {data:subs,error}=await db.from("submissions").select("*,answers(*,questions(question_text,marks,position))").eq("exam_id",examId).order("submitted_at");if(error)return toast(error.message);const ids=[...new Set((subs||[]).map(s=>s.student_id))];const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name,email").in("id",ids):{data:[]};const map=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));const rows=(subs||[]).map(s=>{const p=map[s.student_id]||{};const row={"Student Name":p.full_name||"","Email":p.email||"","Exam ID":examId,"Submitted At":s.submitted_at,"Status":s.status};for(const a of (s.answers||[]).sort((a,b)=>(a.questions?.position||0)-(b.questions?.position||0))){row["Q: "+(a.questions?.question_text||a.question_id)]=a.marks_awarded??a.auto_marks??0}row["Total Marks"]=s.marks_awarded??"";return row});if(format==="pdf"){const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print results.");const cols=Object.keys(rows[0]||{"No submissions":""});w.document.write("<html><head><title>CBT Results</title><style>body{font:12px Arial;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left}</style></head><body><h2>BSG CBT Examination Results</h2><table><thead><tr>"+cols.map(c=>"<th>"+esc(c)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+cols.map(c=>"<td>"+esc(r[c])+"</td>").join("")+"</tr>").join("")+"</tbody></table><script>window.print()<\/script></body></html>");w.document.close();return}if(format==="xlsx"&&window.XLSX){const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Results");XLSX.writeFile(wb,"BSG-CBT-Results.xlsx");return}const cols=Object.keys(rows[0]||{"No submissions":""});const csv=[cols,...rows.map(r=>cols.map(c=>r[c]))].map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="BSG-CBT-Results.csv";a.click();URL.revokeObjectURL(a.href)}
(async()=>{if(!ready)return;const {data:{session}}=await db.auth.getSession();if(session)await loadDashboard()})();

/* Missing examiner actions completed in this revision. */
async function createExam(e){
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const title=String(fd.get("title")||"").trim();
  const level=String(fd.get("level")||"").trim();
  const total_marks=Number(fd.get("total_marks"));
  const duration_minutes=Number(fd.get("duration_minutes"));
  const toIso=v=>v?new Date(v).toISOString():null;
  const starts_at=toIso(fd.get("starts_at"));
  const ends_at=toIso(fd.get("ends_at"));
  if(!title||!level||!Number.isFinite(total_marks)||total_marks<=0||!Number.isFinite(duration_minutes)||duration_minutes<=0){toast("Enter a valid title, marks and duration.");return}
  if(starts_at&&ends_at&&new Date(ends_at)<=new Date(starts_at)){toast("End date/time must be after the start date/time.");return}
  const {data,error}=await db.from("exams").insert({title,level,total_marks,duration_minutes,starts_at,ends_at,instructions:String(fd.get("instructions")||""),status:"draft",created_by:currentProfile.id}).select("id").single();
  if(error){toast(error.message);return}
  toast("Draft examination created. Add questions and answer keys next.");
  await renderDashboard();
}
async function addQuestion(examId){
  const {data:exam,error:ee}=await db.from("exams").select("id,title,total_marks,status").eq("id",examId).single();
  if(ee||!exam)return toast(ee?.message||"Examination not found.");
  if(exam.status!=="draft")return toast("Questions can only be changed while the examination is a draft.");
  const question_text=prompt("Enter the question text:");
  if(!question_text?.trim())return;
  const kind=(prompt("Question type: enter MCQ, SHORT, LONG or DRAWING","MCQ")||"MCQ").trim().toLowerCase();
  const question_type=kind==="mcq"?"mcq":kind==="short"?"short":kind==="long"?"long":kind==="drawing"?"drawing":null;
  if(!question_type)return toast("Unsupported question type.");
  const marks=Number(prompt("Marks for this question:", "1"));
  if(!Number.isFinite(marks)||marks<=0)return toast("Enter a positive mark value.");
  let options=null,correct="";
  if(question_type==="mcq"){
    const raw=prompt("Enter exactly four options separated by | (vertical bar):","Option A|Option B|Option C|Option D");
    options=(raw||"").split("|").map(s=>s.trim()).filter(Boolean);
    if(options.length!==4||new Set(options).size!==4)return toast("MCQ requires four different options separated by |.");
    correct=prompt("Enter the exact correct option text:",options[0])||"";
    if(!options.includes(correct.trim()))return toast("Correct answer must exactly match one of the four options.");
    correct=correct.trim();
  }else if(question_type==="short"||question_type==="long"){
    correct=prompt("Optional accepted answer (can be left blank; examiner will mark):","")||"";
  }
  const {count}=await db.from("questions").select("*",{count:"exact",head:true}).eq("exam_id",examId);
  const position=(count||0)+1;
  const {data:q,error}=await db.from("questions").insert({exam_id:examId,question_text:question_text.trim(),question_type,marks,options,position}).select("id").single();
  if(error)return toast(error.message);
  if(correct){
    const {error:keyError}=await db.rpc("set_question_key",{p_question_id:q.id,p_correct_answer:correct,p_accepted_answers:[]});
    if(keyError){toast("Question saved, but answer key could not be saved: "+keyError.message);return}
  }else if(question_type==="mcq"){
    toast("Question saved but key missing. Do not publish until its key is added.");return;
  }
  toast("Question and answer key saved.");
  await renderDashboard();
}
async function assignExam(examId){
  const email=(prompt("Enter the student's registered email address:")||"").trim().toLowerCase();
  if(!email)return;
  const {data:student,error:pe}=await db.from("profiles").select("id,full_name,email,role").eq("email",email).maybeSingle();
  if(pe||!student)return toast(pe?.message||"No student account found with that email.");
  if(student.role!=="student")return toast("That account is not a student account.");
  const {error}=await db.from("exam_assignments").insert({exam_id:examId,student_id:student.id});
  if(error)return toast(error.code==="23505"?"This student is already assigned.":error.message);
  toast("Examination assigned to "+student.full_name+".");
  await renderDashboard();
}
async function setExamStatus(examId,nextStatus){
  if(!["published","closed"].includes(nextStatus))return;
  const {data:exam,error}=await db.from("exams").select("*").eq("id",examId).single();
  if(error||!exam)return toast(error?.message||"Examination not found.");
  if(nextStatus==="published"){
    const {data:qs,error:qe}=await db.from("questions").select("id,marks,question_type").eq("exam_id",examId);
    if(qe)return toast(qe.message);
    if(!qs?.length)return toast("Add questions before opening this examination.");
    const sum=qs.reduce((n,q)=>n+Number(q.marks||0),0);
    if(Math.abs(sum-Number(exam.total_marks))>0.001)return toast("Question marks total "+sum+" but exam total is "+exam.total_marks+". Correct the totals before opening.");
    if(exam.starts_at&&new Date(exam.ends_at)<=new Date(exam.starts_at))return toast("Correct the examination schedule first.");
    /* MCQ keys are written securely at question creation; never overwrite them during publication. */
    if(!confirm("Open this examination for assigned students? Once opened, question edits are locked."))return;
  }else if(!confirm("Close this examination now? Students will no longer be able to start or submit after the server deadline."))return;
  const {error:up}=await db.from("exams").update({status:nextStatus}).eq("id",examId);
  if(up)return toast(up.message);
  toast(nextStatus==="published"?"Examination opened.":"Examination closed.");
  await renderDashboard();
}

/* Separate staff and candidate entry pages share this authenticated backend. */
(function routePortal(){
  const path=location.pathname.toLowerCase();
  if(path.endsWith("/student.html")){document.body.dataset.portalRole="student";const grid=document.querySelector(".role-grid");if(grid)grid.innerHTML='<article class="role"><div class="role-icon">🎓</div><h3>Student Examination Portal</h3><p>Sign in to view your assigned examinations, instructions, question paper and published results.</p><button class="primary" onclick="showLogin(\'student\')">Student Login</button></article>';const btn=document.querySelector(".hero .primary");if(btn)btn.onclick=()=>showLogin("student");setTimeout(()=>showLogin("student"),0)}
  if(path.endsWith("/staff.html")){document.body.dataset.portalRole="staff";const grid=document.querySelector(".role-grid");if(grid)grid.innerHTML='<article class="role"><div class="role-icon">🧑‍🏫</div><h3>Examiner</h3><p>Create examinations, prepare question papers, assign candidates and evaluate written responses.</p><button class="primary" onclick="showLogin(\'examiner\')">Examiner Login</button></article><article class="role"><div class="role-icon">🛡️</div><h3>Super Admin</h3><p>Create examiner accounts, monitor examinations and export final marks.</p><button class="secondary" onclick="showLogin(\'admin\')">Administrator Login</button></article>';const btn=document.querySelector(".hero .primary");if(btn)btn.onclick=()=>showLogin("examiner")}
})();
