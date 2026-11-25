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
async function loadDashboard(){const {data:{user}}=await db.auth.getUser();if(!user)return goHome();const {data:profile,error}=await db.from("profiles").select("*").eq("id",user.id).single();if(error||!profile){$("auth-error").textContent="Your portal profile is missing. Contact the administrator.";await db.auth.signOut();return}if(currentRole&&profile.role!==currentRole){$("auth-error").textContent="This account does not have the selected role.";await db.auth.signOut();return}currentProfile=profile;currentRole=profile.role;$("staff-hub").classList.add("hidden");$("auth").classList.add("hidden");$("welcome").classList.add("hidden");$("dashboard").classList.remove("hidden");$("dash-title").textContent=profile.role==="admin"?"Administrator Dashboard":profile.role==="examiner"?"Examiner Dashboard":"Student Dashboard";const institution=$("dashboard-institution");if(institution)institution.textContent="PM SHRI Kendriya Vidyalaya, Ordnance Factory, Medak, Eddumailaram · School Code: 1525";$("user-email").textContent=profile.full_name+(profile.section?" · "+profile.section.toUpperCase()+" SECTION":"")+(profile.role==="student"&&profile.candidate_id?" · Candidate ID: "+profile.candidate_id:" · "+user.email)+(profile.role==="examiner"&&profile.examiner_code?" · Examiner ID: "+profile.examiner_code:"");await renderDashboard()}
async function renderDashboard(){const root=$("dash-content");root.innerHTML='<p class="muted">Loading workspace…</p>';if(currentRole==="admin")return adminDashboard(root);if(currentRole==="examiner")return examinerDashboard(root);return studentDashboard(root)}
async function adminDashboard(root){
 const [{data:exams},{count:examiners},{count:students},{count:submissions}]=await Promise.all([
  db.from("exams").select("*").order("created_at",{ascending:false}),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","examiner"),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","student"),
  db.from("submissions").select("*",{count:"exact",head:true})
 ]);
 root.innerHTML=`<div class="stats"><div class="tile"><strong>${exams?.length||0}</strong><span>Examinations</span></div><div class="tile"><strong>${examiners||0}</strong><span>Examiners</span></div><div class="tile"><strong>${students||0}</strong><span>Students</span></div><div class="tile"><strong>${submissions||0}</strong><span>Submissions</span></div></div>
 <div class="data-card"><h3>Create examiner accounts</h3><p class="muted tiny">One examiner per line: Full Name,email,password,examiner. Only Super Admin can create examiner accounts.</p><form id="users-form"><textarea id="bulk-users" rows="4" placeholder="Examiner Name,examiner@example.com,TempPass123,examiner"></textarea><button class="primary">Create examiner account(s)</button></form><div id="examiner-created" class="created-credentials hidden" role="status"></div></div>
 <div class="section-title"><h2>Examination monitoring & marks export</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><p class="muted tiny">Created by Super Admin · NHQ 50-MCQ format</p><div class="action-row"><button class="secondary" onclick="exportResults('${x.id}','csv')">Export CSV</button><button class="secondary" onclick="exportResults('${x.id}','xlsx')">Export Excel</button><button class="secondary" onclick="exportResults('${x.id}','pdf')">Print / PDF</button></div></div>`).join("")||'<p class="muted">No examinations have been created by examiners yet.</p>'}
 <div class="data-card"><div class="card-kicker">EXAMINATION CONTROL · SUPER ADMIN</div><h3>Create examination</h3><p class="muted tiny">NHQ format: 50 MCQs × 2 marks = 100 marks · 50 minutes. Super Admin creates and manages all question papers.</p>
 <form id="create-exam" class="form-grid">
 <label>Examination / progression<select name="level" required><option value="">Select examination</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label>
 <label>Start date & time<input name="starts_at" type="datetime-local"></label><label>End date & time<input name="ends_at" type="datetime-local"></label>
 <label class="wide">Candidate instructions<textarea name="instructions" rows="2" placeholder="Read all questions carefully. Each question carries 2 marks."></textarea></label>
 <div class="wide"><button class="primary">Create 100-mark examination</button></div></form></div>
 <div class="section-title"><h2>Examination papers & question management</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><div class="action-row"><button class="secondary" onclick="addQuestion('${x.id}')">Add MCQ & answer key</button><button class="secondary" onclick="setExamStatus('${x.id}','published')">Open exam</button><button class="secondary" onclick="setExamStatus('${x.id}','closed')">Close exam</button><button class="secondary" onclick="exportResults('${x.id}','csv')">Export CSV</button><button class="secondary" onclick="exportResults('${x.id}','xlsx')">Export Excel</button><button class="secondary" onclick="exportResults('${x.id}','pdf')">Print / PDF</button></div></div>`).join("")||'<p class="muted">No examinations created yet.</p>'}
 <div class="notice">Super Admin creates examiner accounts, candidate examination papers, answer keys and schedules. Examiners register candidates and assign the approved paper.</div>`;
 $("users-form").addEventListener("submit",createUsers);
 $("create-exam").addEventListener("submit",createExam);
}
async function createUsers(e){
 e.preventDefault();
 const lines=$("bulk-users").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),users=[];
 for(const line of lines){const p=line.split(",").map(x=>x.trim());if(p.length!==4||p[3].toLowerCase()!=="examiner"){toast("Each row: Full Name,email,password,examiner");return}users.push({full_name:p[0],email:p[1],password:p[2],role:"examiner"})}
 if(!users.length)return toast("Enter at least one examiner account.");
 const {data,error}=await db.functions.invoke("admin-create-users",{body:{users}});
 if(error)return toast(error.message);
 const panel=$("examiner-created"),ok=(data?.results||[]).filter(x=>x.success),failed=(data?.results||[]).filter(x=>!x.success);
 panel.classList.remove("hidden");
 panel.innerHTML=ok.map(r=>{const original=users.find(u=>u.email.toLowerCase()===String(r.email||"").toLowerCase())||{};return '<div class="created-head">✓ Examiner account created</div><div class="credential-row"><span>Examiner</span><b>'+esc(original.full_name||"")+'</b></div><div class="credential-row"><span>Examiner Login ID</span><b>'+esc(r.examiner_id||"")+'</b></div><div class="credential-row"><span>Temporary Password</span><b>'+esc(original.password||"")+'</b></div><div class="credential-row"><span>Email</span><b>'+esc(original.email||"")+'</b></div><hr>'}).join("")+(failed.length?'<p class="error">'+failed.map(x=>esc(x.email)+': '+esc(x.error)).join('<br>')+'</p>':"");
 toast(ok.length+" examiner account(s) created; "+failed.length+" failed.");
 $("bulk-users").value="";
}
function resultCategory(marks){const n=Number(marks)||0;return n>=90?'First Class':n>=70?'Second Class':n>=50?'Third Class':'Fail'}
async function studentDashboard(root){
 const {data:as,error}=await db.from('exam_assignments').select('id,exam_id,exams(*)').eq('student_id',currentProfile.id);
 if(error){root.textContent=error.message;return}
 const {data:subs,error:se}=await db.from('submissions').select('exam_id,status,marks_awarded,published_at').eq('student_id',currentProfile.id);
 if(se){root.textContent=se.message;return}
 root.innerHTML='<div class="section-title"><h2>My examinations</h2></div>'+(as||[]).map(a=>{
  const x=a.exams||{},s=(subs||[]).find(z=>z.exam_id===x.id);let result='';
  if(s&&s.status==='published'){const m=Number(s.marks_awarded)||0;result='<div class="notice"><b>Result published</b><p>'+m+' / '+x.total_marks+' marks · '+resultCategory(m)+' · '+(m>=50?'PASS':'NOT QUALIFIED')+'</p></div>'}
  else if(s){result='<p class="muted">Your submission is recorded. The result has not yet been published.</p>'}
  else if(x.status==='published'){result='<button onclick="startExam(\''+x.id+'\')">Start examination</button>'}
  else{result='<p class="muted">This examination is not open yet.</p>'}
  return '<div class="exam-card"><div class="exam-top"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.level)+' · '+x.total_marks+' marks · '+x.duration_minutes+' minutes</p></div><span class="status">'+esc(s?s.status:x.status)+'</span></div>'+result+'</div>'
 }).join('')||'<div class="data-card">No examinations assigned yet.</div>';
}
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
 root.innerHTML=`<div class="data-card"><div class="card-kicker">CANDIDATE REGISTRATION · 01</div><h3>Register a Scout / Guide candidate</h3><p class="muted tiny">The examiner enters the student's details. The seven-digit Candidate ID becomes the login ID, and the BSG UID number is automatically set as the password. No student email address is required.</p><form id="student-users-form" class="form-grid">
 <label>Student full name<input name="full_name" required autocomplete="name" placeholder="Enter student's full name"></label>
 <label>Father's name<input name="father_name" required placeholder="Enter father's name"></label>
 <label>Scout / Guide Section<select name="section" required><option value="">Select section</option><option value="scout">Scout</option><option value="guide">Guide</option></select></label><label>Scout / Guide Number<input name="scout_guide_number" required placeholder="Enter Scout / Guide number"></label>
 <label>Progression / Examination Level<select name="candidate_level" required><option value="">Select progression level</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label>
 <label>BSG UID Number<input name="bsg_uid" required inputmode="numeric" pattern="[0-9]{6,20}" minlength="6" maxlength="20" placeholder="Enter BSG UID number"></label>
 <label>Seven-digit Candidate ID<input name="candidate_id" required inputmode="numeric" pattern="[0-9]{7}" minlength="7" maxlength="7" placeholder="Enter assigned seven-digit ID"></label>
 <div class="wide"><button class="primary">Create student login account</button></div>
 </form><div id="student-created" class="created-credentials hidden" role="status"></div></div>
 <div class="section-title"><h2>Available examinations for candidate assignment</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><div class="action-row"><button class="secondary" onclick="assignExam('${x.id}')">Assign to candidate</button></div></div>`).join("")||'<p class="muted">No examination papers have been created by Super Admin yet.</p>'}
 <div class="section-title"><h2>Submitted answer sheets & marking</h2></div>
 ${(subs||[]).map(s=>`<div class="data-card"><h3>${esc(s.exams?.title)} — ${esc(pmap[s.student_id]?.full_name||pmap[s.student_id]?.email||"Student")}</h3><p class="muted tiny">Submitted: ${new Date(s.submitted_at).toLocaleString()} · ${esc(s.status)}</p>${(s.answers||[]).map(a=>`<div class="question"><b>${esc(a.questions?.question_text)}</b><p>${esc(a.answer_text||"No answer")}</p><p class="muted tiny">Automatic MCQ marks: ${a.auto_marks||0}</p><label>Examiner marks (max ${a.questions?.marks})<input type="number" min="0" max="${a.questions?.marks}" step="0.5" id="mark-${a.id}" value="${a.marks_awarded??a.auto_marks??0}"></label><button class="secondary" onclick="saveMark('${a.id}')">Save marks</button></div>`).join("")}<button onclick="publishResult('${s.id}')">Finalise & publish result</button></div>`).join("")||'<p class="muted">No submitted scripts yet.</p>'}
 <div class="notice">Question papers, answer keys, examination schedules and opening/closing are controlled by Super Admin. Examiners register candidates and assign the relevant examination.</div>`;
 $("student-users-form").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget,fd=new FormData(form);
 const student={full_name:String(fd.get("full_name")||"").trim(),father_name:String(fd.get("father_name")||"").trim(),scout_guide_number:String(fd.get("scout_guide_number")||"").trim(),candidate_level:String(fd.get("candidate_level")||"").trim(),section:String(fd.get("section")||"").trim(),bsg_uid:String(fd.get("bsg_uid")||"").trim(),candidate_id:String(fd.get("candidate_id")||"").trim(),role:"student"};
 if(!["scout","guide"].includes(student.section))return toast("Choose Scout or Guide section.");
 if(!/^\d{7}$/.test(student.candidate_id))return toast("Candidate ID must contain exactly seven digits.");
 if(!/^\d{6,20}$/.test(student.bsg_uid))return toast("Enter a valid numeric BSG UID number (6–20 digits).");
 const button=form.querySelector("button[type=submit],button:not([type])");button.disabled=true;button.textContent="Creating secure login…";
 const {data,error}=await db.functions.invoke("admin-create-users",{body:{student}});
 button.disabled=false;button.textContent="Create student login account";
 if(error)return toast(error.message);
 const result=data?.results?.[0];
 if(!result?.success)return toast(result?.error||data?.error||"Student account could not be created.");
 const panel=$("student-created");panel.classList.remove("hidden");
 panel.innerHTML='<div class="created-head">✓ Candidate account created successfully</div><div class="credential-row"><span>Student</span><b>'+esc(student.full_name)+'</b></div><div class="credential-row"><span>Candidate Login ID</span><b>'+esc(student.candidate_id)+'</b></div><div class="credential-row"><span>Initial Password</span><b>'+esc(student.bsg_uid)+'</b></div><div class="credential-row"><span>Section</span><b>'+esc(student.section.toUpperCase())+'</b></div><div class="credential-row"><span>Scout / Guide Number</span><b>'+esc(student.scout_guide_number)+'</b></div><div class="credential-row"><span>Progression Level</span><b>'+esc(student.candidate_level)+'</b></div><p class="tiny muted">Give the Candidate ID and BSG UID to the student securely. The password itself is not stored in the profile table.</p>';
 form.reset();toast("Student login created.");
});
 const bulk=document.createElement("div");bulk.className="data-card";bulk.innerHTML='<h3>Bulk register candidates from Excel</h3><p class="muted tiny">Upload .xlsx/.xls with columns: full_name, father_name, scout_guide_number, candidate_level, bsg_uid, candidate_id, section. Keep the already-issued seven-digit Candidate IDs.</p><input id="candidate-xlsx" type="file" accept=".xlsx,.xls"><button type="button" class="secondary" id="import-candidates">Import Excel sheet</button><div id="bulk-created" class="created-credentials hidden"></div>';
 const registration=$("student-users-form");registration.parentElement.insertBefore(bulk,registration.nextSibling);
 $("import-candidates").addEventListener("click",async()=>{
  const file=$("candidate-xlsx").files[0];if(!file)return toast("Choose an Excel file first.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
  if(!rows.length)return toast("The Excel sheet is empty.");if(rows.length>100)return toast("Import a maximum of 100 candidates at a time.");
  const users=rows.map(r=>({full_name:String(r.full_name||r.name||"").trim(),father_name:String(r.father_name||"").trim(),scout_guide_number:String(r.scout_guide_number||"").trim(),candidate_level:String(r.candidate_level||"").trim(),bsg_uid:String(r.bsg_uid||"").trim(),candidate_id:String(r.candidate_id||"").trim(),section:String(r.section||"").trim().toLowerCase(),role:"student"}));
  if(users.some(u=>!u.full_name||!u.father_name||!u.scout_guide_number||!u.candidate_level||!/^\d{7}$/.test(u.candidate_id)||!/^\d{6,20}$/.test(u.bsg_uid)||!["scout","guide"].includes(u.section)))return toast("Check required columns, Candidate IDs, BSG UIDs and Scout/Guide sections.");
  const btn=$("import-candidates");btn.disabled=true;const {data,error}=await db.functions.invoke("admin-create-users",{body:{users}});btn.disabled=false;
  if(error)return toast(error.message);const results=data?.results||[],ok=results.filter(x=>x.success),bad=results.filter(x=>!x.success);const box=$("bulk-created");box.classList.remove("hidden");box.innerHTML="<b>"+ok.length+" created · "+bad.length+" failed</b>"+(bad.length?"<ul>"+bad.map(x=>"<li>"+esc(x.candidate_id||"Row")+": "+esc(x.error)+"</li>").join("")+"</ul>":"");toast("Bulk registration completed.");
 });

}
async function saveMark(id){const marks=Number($("mark-"+id).value);if(!Number.isFinite(marks)||marks<0)return toast("Invalid mark.");const {error}=await db.from("answers").update({marks_awarded:marks}).eq("id",id);toast(error?error.message:"Marks saved")}
async function publishResult(id){const {data:ans,error}=await db.from("answers").select("marks_awarded,auto_marks").eq("submission_id",id);if(error)return toast(error.message);const total=(ans||[]).reduce((n,a)=>n+Number(a.marks_awarded??a.auto_marks??0),0);const {error:e}=await db.from("submissions").update({status:"published",marks_awarded:total,published_at:new Date().toISOString()}).eq("id",id);toast(e?e.message:"Result published: "+total+" marks")}
async function exportResults(examId,format){const {data:subs,error}=await db.from("submissions").select("*,answers(*,questions(question_text,marks,position))").eq("exam_id",examId).order("submitted_at");if(error)return toast(error.message);const ids=[...new Set((subs||[]).map(s=>s.student_id))];const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name,email").in("id",ids):{data:[]};const map=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));const rows=(subs||[]).map(s=>{const p=map[s.student_id]||{};const row={"Student Name":p.full_name||"","Email":p.email||"","Exam ID":examId,"Submitted At":s.submitted_at,"Status":s.status};for(const a of (s.answers||[]).sort((a,b)=>(a.questions?.position||0)-(b.questions?.position||0))){row["Q: "+(a.questions?.question_text||a.question_id)]=a.marks_awarded??a.auto_marks??0}row["Total Marks"]=s.marks_awarded??"";return row});if(format==="pdf"){const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print results.");const cols=Object.keys(rows[0]||{"No submissions":""});w.document.write("<html><head><title>CBT Results</title><style>body{font:12px Arial;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left}</style></head><body><h2>BSG CBT Examination Results</h2><table><thead><tr>"+cols.map(c=>"<th>"+esc(c)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+cols.map(c=>"<td>"+esc(r[c])+"</td>").join("")+"</tr>").join("")+"</tbody></table><script>window.print()<\/script></body></html>");w.document.close();return}if(format==="xlsx"&&window.XLSX){const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Results");XLSX.writeFile(wb,"BSG-CBT-Results.xlsx");return}const cols=Object.keys(rows[0]||{"No submissions":""});const csv=[cols,...rows.map(r=>cols.map(c=>r[c]))].map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="BSG-CBT-Results.csv";a.click();URL.revokeObjectURL(a.href)}
(async()=>{if(!ready)return;const {data:{session}}=await db.auth.getSession();if(session)await loadDashboard()})();

/* Missing examiner actions completed in this revision. */
async function createExam(e){
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const level=String(fd.get("level")||"").trim();
  const title=level+" Examination";
  const total_marks=100;
  const duration_minutes=50;
  const toIso=v=>v?new Date(v).toISOString():null;
  const starts_at=toIso(fd.get("starts_at"));
  const ends_at=toIso(fd.get("ends_at"));
  if(!["Pravesh","Pratham Sopan","Pravesh + Pratham Sopan","Dwitiya Sopan"].includes(level)){toast("Select a valid examination level.");return}
  if(starts_at&&ends_at&&new Date(ends_at)<=new Date(starts_at)){toast("End date/time must be after the start date/time.");return}
  const {data,error}=await db.from("exams").insert({title,level,total_marks,duration_minutes,starts_at,ends_at,instructions:String(fd.get("instructions")||""),status:"draft",created_by:currentProfile.id}).select("id").single();
  if(error){toast(error.message);return}
  toast("100-mark, 50-minute draft created. Add exactly 50 MCQs, each worth 2 marks.");
  await renderDashboard();
}
async function addQuestion(examId){
  const {data:exam,error:ee}=await db.from("exams").select("id,title,total_marks,status").eq("id",examId).single();
  if(ee||!exam)return toast(ee?.message||"Examination not found.");
  if(exam.status!=="draft")return toast("Questions can only be changed while the examination is a draft.");
  const question_text=prompt("Enter the question text:");
  if(!question_text?.trim())return;
  const {count:existingCount}=await db.from("questions").select("*",{count:"exact",head:true}).eq("exam_id",examId);
  if((existingCount||0)>=50)return toast("This paper already has 50 questions.");
  const question_type="mcq";
  const marks=2;
  let options=null,correct="";
  {
    const raw=prompt("Enter exactly four options separated by | (vertical bar):","Option A|Option B|Option C|Option D");
    options=(raw||"").split("|").map(s=>s.trim()).filter(Boolean);
    if(options.length!==4||new Set(options).size!==4)return toast("MCQ requires four different options separated by |.");
    correct=prompt("Enter the exact correct option text:",options[0])||"";
    if(!options.includes(correct.trim()))return toast("Correct answer must exactly match one of the four options.");
    correct=correct.trim();
  }
  const count=existingCount;
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
  const candidateId=(prompt("Enter the student's seven-digit Candidate ID:")||"").trim();
  if(!candidateId)return;
  if(!/^\d{7}$/.test(candidateId))return toast("Enter the seven-digit Candidate ID.");
  const {data:student,error:pe}=await db.from("profiles").select("id,full_name,candidate_id,candidate_level,role").eq("candidate_id",candidateId).maybeSingle();
  if(pe||!student)return toast(pe?.message||"No student account found with that Candidate ID.");
  if(student.role!=="student")return toast("That account is not a student account.");
  const {data:exam,error:examError}=await db.from("exams").select("id,level").eq("id",examId).single();
  if(examError||!exam)return toast(examError?.message||"Examination not found.");
  if(student.candidate_level!==exam.level)return toast("Progression mismatch: this candidate is registered for "+student.candidate_level+", not "+exam.level+".");
  const {error}=await db.from("exam_assignments").insert({exam_id:examId,student_id:student.id});
  if(error)return toast(error.code==="23505"?"This student is already assigned.":error.message);
  toast("Examination assigned to "+student.full_name+" ("+student.candidate_id+").");
  await renderDashboard();
}
async function setExamStatus(examId,nextStatus){
  if(!["published","closed"].includes(nextStatus))return;
  const {data:exam,error}=await db.from("exams").select("*").eq("id",examId).single();
  if(error||!exam)return toast(error?.message||"Examination not found.");
  if(nextStatus==="published"){
    const {data:qs,error:qe}=await db.from("questions").select("id,marks,question_type").eq("exam_id",examId);
    if(qe)return toast(qe.message);
    if(qs?.length!==50)return toast("This NHQ-format paper must contain exactly 50 MCQs. Current count: "+(qs?.length||0)+".");
    if(qs.some(q=>q.question_type!=="mcq"||Number(q.marks)!==2))return toast("Every question must be MCQ type and carry exactly 2 marks.");
    const sum=qs.reduce((n,q)=>n+Number(q.marks||0),0);
    if(sum!==100||Number(exam.total_marks)!==100||Number(exam.duration_minutes)!==50)return toast("NHQ format required: 50 MCQs × 2 marks = 100 marks, 50 minutes.");
    if(exam.starts_at&&exam.ends_at&&new Date(exam.ends_at)<=new Date(exam.starts_at))return toast("Correct the examination schedule first.");
    /* MCQ keys are written securely at question creation; never overwrite them during publication. */
    if(!confirm("Open this examination for assigned students? Once opened, question edits are locked."))return;
  }else if(!confirm("Close this examination now? Students will no longer be able to start or submit after the server deadline."))return;
  const {error:up}=await db.from("exams").update({status:nextStatus}).eq("id",examId);
  if(up)return toast(up.message);
  toast(nextStatus==="published"?"Examination opened.":"Examination closed.");
  await renderDashboard();
}

/* Dedicated staff sign-in routes; student landing remains the public home. */
function showStaffPortal(){
 $("welcome").classList.add("hidden");$("auth").classList.add("hidden");$("dashboard").classList.add("hidden");
 $("staff-hub").classList.remove("hidden");
}
function routePortal(){
 const route=location.hash.toLowerCase();
 $("staff-hub").classList.add("hidden");
 if(route==="#/staff"){document.body.dataset.portalRole="staff";showStaffPortal()}
 else if(route==="#/staff/examiner"){document.body.dataset.portalRole="examiner";showLogin("examiner")}
 else if(route==="#/staff/super-admin"){document.body.dataset.portalRole="admin";showLogin("admin")}
 else if(route==="#/student"){document.body.dataset.portalRole="student";showLogin("student")}
 else{document.body.dataset.portalRole="home";$("auth").classList.add("hidden");if(!$("dashboard").classList.contains("hidden"))return;$("welcome").classList.remove("hidden")}
}
window.addEventListener("hashchange",routePortal);
routePortal();


/* Examiner ID authentication and Super Admin account register refresh. */
function showLogin(role){
 $("staff-hub").classList.add("hidden");
 currentRole=role;$("welcome").classList.add("hidden");$("dashboard").classList.add("hidden");$("auth").classList.remove("hidden");
 $("auth-title").textContent=role==="admin"?"Super Admin Login":role==="examiner"?"Examiner Login":"Student Login";
 $("auth-sub").textContent=role==="admin"?"Authorised portal administration access.":role==="examiner"?"Enter the unique Examiner ID issued by the Super Admin.":"Sign in to access your assigned examination workspace.";
 $("identity-caption").textContent=role==="examiner"?"Examiner ID":role==="student"?"Seven-digit Candidate ID":"Registered email address";
 $("email").type=role==="admin"?"email":"text";$("email").placeholder=role==="examiner"?"BSG-EXM-XXXXXXXX":role==="student"?"e.g. 1234567":"name@example.com";
 $("auth-help").textContent=role==="examiner"?"Use the Examiner ID and password issued by the Super Admin.":role==="student"?"Enter your seven-digit Candidate ID. Your BSG UID number is your password.":"Use the existing Super Admin account credentials.";
 $("auth-error").textContent="";
}
$("login-form").addEventListener("submit",async e=>{
 e.preventDefault();e.stopImmediatePropagation();
 if(!ready){$("auth-error").textContent="Database configuration is missing. Reload after setup.";return}
 const identity=$("email").value.trim(),password=$("password").value;
 if(currentRole==="examiner"||currentRole==="student"){
  const {data,error}=await db.functions.invoke("portal-login",{body:{login_id:identity,password}});
  if(error||!data?.session){$("auth-error").textContent=data?.error||error?.message||"Invalid Candidate ID / Examiner ID or password.";return}
  const {error:setError}=await db.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  if(setError){$("auth-error").textContent=setError.message;return}
 }else{
  const {error}=await db.auth.signInWithPassword({email:identity,password});
  if(error){$("auth-error").textContent=error.message;return}
 }
 await loadDashboard();
},true);

async function exportAccountIds(kind){
 const role=kind==="examiner"?"examiner":"student";
 const {data,error}=await db.from("profiles").select("full_name,email,examiner_code,candidate_id,section,candidate_level,created_at").eq("role",role).order("created_at",{ascending:false});
 if(error)return toast(error.message);
 const rows=(data||[]).map(p=>kind==="examiner"?{"Examiner ID":p.examiner_code||"","Examiner Name":p.full_name||"","Section":p.section||"","Email":p.email||""}:{"Candidate ID":p.candidate_id||"","Student Name":p.full_name||"","Section":p.section||"","Level":p.candidate_level||""});
 if(!rows.length)return toast("No "+role+" accounts are registered yet.");
 if(window.XLSX){const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,kind==="examiner"?"Examiner IDs":"Candidate IDs");XLSX.writeFile(wb,"BSG-"+(kind==="examiner"?"Examiner":"Candidate")+"-ID-Register.xlsx");}
 else{const cols=Object.keys(rows[0]),csv=[cols,...rows.map(r=>cols.map(c=>r[c]))].map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="BSG-"+kind+"-IDs.csv";a.click();URL.revokeObjectURL(a.href);}
}
async function adminDashboard(root){
 const [{data:exams,error:examErr},{count:examiners},{count:students},{count:submissions},{data:examinerRows,error:listError},{data:candidateRows,error:candidateErr},{data:questions,error:questionErr}]=await Promise.all([
  db.from("exams").select("*").order("created_at",{ascending:false}),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","examiner"),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","student"),
  db.from("submissions").select("*",{count:"exact",head:true}),
  db.from("profiles").select("id,full_name,email,examiner_code,section,created_at").eq("role","examiner").order("created_at",{ascending:false}),
  db.from("profiles").select("id,full_name,candidate_id,section,candidate_level,created_at").eq("role","student").order("created_at",{ascending:false}).limit(250),
  db.from("questions").select("exam_id,id")
 ]);
 const qCounts={};(questions||[]).forEach(q=>qCounts[q.exam_id]=(qCounts[q.exam_id]||0)+1);
 root.innerHTML=`<div class="stats"><div class="tile"><strong>${exams?.length||0}</strong><span>Question papers</span></div><div class="tile"><strong>${examiners||0}</strong><span>Examiner accounts</span></div><div class="tile"><strong>${students||0}</strong><span>Candidate accounts</span></div><div class="tile"><strong>${submissions||0}</strong><span>Submissions</span></div></div>
 <div class="admin-module-grid">
 <button type="button" class="admin-module" onclick="document.getElementById('admin-paper-create').scrollIntoView({behavior:'smooth'})"><b>📝 Create Question Paper</b><span>Create examination and add 50 MCQs</span></button>
 <button type="button" class="admin-module" onclick="document.getElementById('admin-examiner-create').scrollIntoView({behavior:'smooth'})"><b>🧑‍🏫 Examiner ID Creation</b><span>Create Scout and Guide examiner logins</span></button>
 <button type="button" class="admin-module" onclick="document.getElementById('admin-id-register').scrollIntoView({behavior:'smooth'})"><b>🪪 Export ID Registers</b><span>Download examiner and candidate IDs</span></button>
 <button type="button" class="admin-module" onclick="document.getElementById('admin-candidate-register').scrollIntoView({behavior:'smooth'})"><b>👥 Candidate Register</b><span>View registered Scouts and Guides</span></button>
 <button type="button" class="admin-module" onclick="document.getElementById('admin-paper-list').scrollIntoView({behavior:'smooth'})"><b>📅 Examination Management</b><span>Publish, close and monitor papers</span></button>
 <button type="button" class="admin-module" onclick="document.getElementById('admin-results').scrollIntoView({behavior:'smooth'})"><b>📊 Results & Exports</b><span>Download result sheets and reports</span></button>
 </div>
 <section class="data-card" id="admin-examiner-create"><div class="card-kicker">ACCOUNT MANAGEMENT</div><h3>Create examiner credentials</h3><p class="muted tiny">Create separate Scout and Guide examiner accounts. The portal generates the Examiner ID.</p><form id="examiner-create-form" class="form-grid"><label>Examiner full name<input name="full_name" required placeholder="Enter full name"></label><label>Assigned section<select name="section" required><option value="">Choose section</option><option value="scout">Scout Examiner</option><option value="guide">Guide Examiner</option></select></label><label>Official email address<input name="email" type="email" required placeholder="examiner@example.com"></label><label class="wide">Temporary password<input name="password" type="password" minlength="8" required placeholder="Minimum 8 characters"></label><div class="wide"><button class="primary" type="submit">Generate Examiner ID &amp; Create Account →</button></div></form><div id="created-credentials" class="created-credentials hidden"></div></section>
 <section class="data-card" id="admin-paper-create"><div class="card-kicker">QUESTION PAPER CONTROL</div><h3>Create a new examination paper</h3><p class="muted tiny">NHQ pattern: 50 MCQs × 2 marks = 100 marks · 50 minutes. The paper stays in draft until all questions and answer keys are verified.</p><form id="admin-exam-form" class="form-grid"><label>Examination level<select name="level" required><option value="">Select level</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label><label>Start date and time<input type="datetime-local" name="starts_at"></label><label>Closing date and time<input type="datetime-local" name="ends_at"></label><label class="wide">Instructions<textarea name="instructions" rows="3" placeholder="Enter instructions for candidates"></textarea></label><div class="wide"><button class="primary" type="submit">Create 100-mark question paper</button></div></form></section>
 <section class="data-card" id="admin-id-register"><div class="card-kicker">ID REGISTERS & EXPORTS</div><h3>Export login ID registers</h3><p class="muted tiny">Exports account IDs and section details. Passwords are deliberately excluded from these general ID registers.</p><div class="action-row"><button class="secondary" type="button" onclick="exportAccountIds('examiner')">Export Examiner IDs (Excel)</button><button class="secondary" type="button" onclick="exportAccountIds('candidate')">Export Candidate IDs (Excel)</button></div></section>
 <section class="data-card" id="admin-paper-list"><div class="section-title"><h2>Question papers & examination control</h2></div>${examErr?'<p class="error">'+esc(examErr.message)+'</p>':(exams||[]).map(x=>'<article class="exam-card"><div class="exam-top"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.level)+' · '+x.total_marks+' marks · '+x.duration_minutes+' minutes · '+(qCounts[x.id]||0)+'/50 questions</p></div><span class="status">'+esc(x.status)+'</span></div><div class="action-row"><button class="secondary" onclick="addQuestion(\''+x.id+'\')">Add MCQ / Answer Key</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'published\')">Publish Paper</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'closed\')">Close Paper</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'xlsx\')">Export Results</button></div></article>').join('')||'<p class="muted">No papers created yet. Use the form above to create your first paper.</p>'}</section>
 <section class="data-card" id="admin-candidate-register"><div class="section-title"><h2>Registered candidates</h2><span class="portal-mark">${candidateRows?.length||0} SHOWN</span></div><div class="action-row"><button class="secondary" onclick="exportAccountIds('candidate')">Download Candidate Register</button></div>${candidateErr?'<p class="error">'+esc(candidateErr.message)+'</p>':(candidateRows||[]).length?'<div class="table-wrap"><table><thead><tr><th>Candidate ID</th><th>Name</th><th>Section</th><th>Level</th></tr></thead><tbody>'+(candidateRows||[]).map(p=>'<tr><td><b>'+esc(p.candidate_id||'')+'</b></td><td>'+esc(p.full_name||'')+'</td><td>'+esc((p.section||'').toUpperCase())+'</td><td>'+esc(p.candidate_level||'')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No candidate accounts registered yet.</p>'}</section>
 <section class="data-card"><div class="section-title"><h2>Examiner register</h2><span class="portal-mark">${examinerRows?.length||0} ACCOUNTS</span></div><div class="action-row"><button class="secondary" onclick="exportAccountIds('examiner')">Download Examiner Register</button></div>${listError?'<p class="error">'+esc(listError.message)+'</p>':(examinerRows||[]).length?'<div class="table-wrap"><table><thead><tr><th>Examiner ID</th><th>Section</th><th>Name</th><th>Email</th></tr></thead><tbody>'+(examinerRows||[]).map(p=>'<tr><td><b>'+esc(p.examiner_code||'')+'</b></td><td>'+esc((p.section||'').toUpperCase())+'</td><td>'+esc(p.full_name||'')+'</td><td>'+esc(p.email||'')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No examiners created yet.</p>'}</section>
 <section class="data-card" id="admin-results"><h2>Results & reporting</h2><p class="muted tiny">Download result sheets for examinations that have candidate submissions.</p>${(exams||[]).map(x=>'<div class="action-row"><b>'+esc(x.title)+'</b><button class="secondary" onclick="exportResults(\''+x.id+'\',\'xlsx\')">Excel</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'pdf\')">Print / PDF</button></div>').join('')||'<p class="muted">No examinations available.</p>'}</section>
 <div class="notice">Super Admin controls examiner accounts, question papers, answer keys, publication and results oversight. The existing Super Admin account and credentials are unchanged.</div>`;
 const examinerForm=$("examiner-create-form");if(examinerForm)examinerForm.addEventListener("submit",createUsers);
 const examForm=$("admin-exam-form");if(examForm)examForm.addEventListener("submit",createExam);
}
async function createUsers(e){
 e.preventDefault();const fd=new FormData(e.currentTarget);
 const user={full_name:String(fd.get("full_name")||"").trim(),email:String(fd.get("email")||"").trim().toLowerCase(),password:String(fd.get("password")||""),section:String(fd.get("section")||""),role:"examiner"};
 if(!user.full_name||!user.email||!["scout","guide"].includes(user.section)||user.password.length<8)return toast("Enter name, section, email and a password of at least 8 characters.");
 const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent="Creating secure account…";
 const {data,error}=await db.functions.invoke("admin-create-users",{body:{users:[user]}});
 if(error){button.disabled=false;button.textContent="Generate Examiner ID & Create Account →";return toast(error.message)}
 const result=data?.results?.[0];if(!result?.success){button.disabled=false;button.textContent="Generate Examiner ID & Create Account →";return toast(result?.error||"Examiner account could not be created.")}
 await adminDashboard($("dash-content"));
 const panel=$("created-credentials");
 panel.innerHTML='<div class="created-head">✓ Examiner account created successfully</div><div class="credential-row"><span>Examiner ID</span><b>'+esc(result.examiner_id)+'</b><button type="button" class="secondary" onclick="navigator.clipboard.writeText(\''+esc(result.examiner_id)+'\').then(()=>toast(\'Examiner ID copied\'))">Copy ID</button></div><div class="credential-row"><span>Login email</span><b>'+esc(user.email)+'</b></div><p class="muted tiny">Share the Examiner ID and temporary password securely. The password is not stored in this register.</p>';
 panel.classList.remove("hidden");toast("Examiner account created: "+result.examiner_id);
}
/* Candidate CBT workspace: instruction gate, question palette and review navigation. */
function paintQuestion(){
  if(!activeExam)return;
  const {questions,responses,review,currentIndex}=activeExam;
  const q=questions[currentIndex],answer=responses[q.id]||"";
  const palette=questions.map((item,i)=>{
    const answered=!!String(responses[item.id]||"").trim(),marked=review.has(item.id);
    const cls=marked?(answered?"answered-review":"review"):answered?"answered":"not-answered";
    return '<button type="button" class="palette-item '+cls+(i===currentIndex?' current':'')+'" data-q-index="'+i+'" aria-label="Question '+(i+1)+'">'+(i+1)+'</button>';
  }).join("");
  const options=q.question_type==="mcq"?(q.options||[]).map((o,i)=>'<label class="cbt-option"><input type="radio" name="cbt-answer" value="'+esc(o)+'" '+(answer===o?'checked':'')+'><span>'+esc(o)+'</span></label>').join(""):'<textarea id="cbt-text-answer" class="answer-input" rows="5" placeholder="Type your answer here…">'+esc(answer)+'</textarea>';
  $("dash-content").innerHTML='<div class="cbt-head"><div><span class="eyebrow">EXAMINATION IN PROGRESS</span><h2>'+esc(activeExam.exam.title)+'</h2><p>'+esc(currentProfile.full_name)+' · '+esc(activeExam.exam.level)+'</p></div><div class="cbt-clock"><span>TIME LEFT</span><strong id="timer">--:--</strong></div></div><div class="cbt-layout"><section class="cbt-main"><div class="cbt-question-head"><b>Question '+(currentIndex+1)+' of '+questions.length+'</b><span>'+esc(q.marks)+' mark(s)</span></div><div class="cbt-question"><h3>'+esc(q.question_text)+'</h3><div id="cbt-answer-area">'+options+'</div></div><div class="cbt-controls"><button class="secondary" id="clear-answer" type="button">Clear Response</button><button class="secondary" id="mark-review" type="button">Mark for Review & Next</button><button class="primary" id="save-next" type="button">Save & Next</button></div><div class="cbt-bottom"><button class="secondary" id="previous-q" type="button" '+(currentIndex===0?'disabled':'')+'>Previous</button><button class="primary" id="submit-final" type="button">Submit Examination</button></div></section><aside class="cbt-side"><h3>Question Palette</h3><p class="muted tiny">Select a number to move to that question.</p><div class="palette">'+palette+'</div><div class="palette-legend"><span><i class="answered"></i> Answered</span><span><i class="not-answered"></i> Not answered</span><span><i class="review"></i> Marked for review</span><span><i class="answered-review"></i> Answered & review</span></div><div class="cbt-summary"><b>'+questions.filter(x=>String(responses[x.id]||"").trim()).length+'</b> answered · <b>'+questions.length-questions.filter(x=>String(responses[x.id]||"").trim()).length+'</b> remaining</div></aside></div>';
  document.querySelectorAll("[data-q-index]").forEach(el=>el.addEventListener("click",()=>{captureAnswer();activeExam.currentIndex=Number(el.dataset.qIndex);paintQuestion()}));
  $("clear-answer").addEventListener("click",()=>{delete activeExam.responses[q.id];activeExam.review.delete(q.id);paintQuestion()});
  $("mark-review").addEventListener("click",()=>{captureAnswer();activeExam.review.add(q.id);if(currentIndex<questions.length-1)activeExam.currentIndex++;paintQuestion()});
  $("save-next").addEventListener("click",()=>{captureAnswer();activeExam.review.delete(q.id);if(currentIndex<questions.length-1)activeExam.currentIndex++;paintQuestion()});
  $("previous-q").addEventListener("click",()=>{captureAnswer();activeExam.currentIndex=Math.max(0,currentIndex-1);paintQuestion()});
  $("submit-final").addEventListener("click",()=>submitExam(false));
  const area=$("cbt-answer-area");
  area.querySelectorAll('input[name="cbt-answer"]').forEach(el=>el.addEventListener("change",captureAnswer));
  const ta=$("cbt-text-answer");if(ta)ta.addEventListener("input",captureAnswer);
}
function captureAnswer(){
  if(!activeExam)return;
  const q=activeExam.questions[activeExam.currentIndex];
  const selected=document.querySelector('input[name="cbt-answer"]:checked');
  const typed=$("cbt-text-answer");
  if(selected)activeExam.responses[q.id]=selected.value;
  else if(typed)activeExam.responses[q.id]=typed.value;
}
function shuffledCopy(items){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
async function startExam(id){
  const {data:exam,error:ee}=await db.from("exams").select("*").eq("id",id).single();
  if(ee||!exam)return toast(ee?.message||"Examination not found.");
  const instructions=exam.instructions||"Read every question carefully. Select one option for MCQs. You can move between questions using the palette. Save your responses before submitting. The server timer starts when you begin. No negative marking.";
  if(!confirm("EXAMINATION INSTRUCTIONS\n\n"+instructions+"\n\nDuration: "+exam.duration_minutes+" minutes\nMaximum marks: "+exam.total_marks+"\n\nPress OK only when you are ready to start."))return;
  const {data:started,error:se}=await db.rpc("start_exam",{p_exam_id:id});
  if(se)return toast(se.message);
  const {data:questions,error:qe}=await db.from("questions").select("*").eq("exam_id",id).order("position");
  if(qe||!questions?.length)return toast(qe?.message||"Questions are not available.");
  const randomized=shuffledCopy(questions.map(q=>({...q,options:Array.isArray(q.options)?shuffledCopy(q.options):q.options})));
  activeExam={exam,questions:randomized,startedAt:new Date(started).getTime(),responses:{},review:new Set(),currentIndex:0};
  paintQuestion();
  const tick=()=>{
    if(!activeExam)return;
    const left=Math.max(0,Math.ceil((activeExam.startedAt+activeExam.exam.duration_minutes*60000-Date.now())/1000));
    const clock=$("timer");if(clock)clock.textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");
    if(left<=0){clearInterval(examTimer);submitExam(true)}
  };
  tick();examTimer=setInterval(tick,1000);
}
async function submitExam(auto){
  if(!activeExam)return;
  captureAnswer();
  const questions=activeExam.questions,examId=activeExam.exam.id;
  const answered=questions.filter(q=>String(activeExam.responses[q.id]||"").trim()).length;
  if(!auto&&!confirm("Submit this examination?\n\nAnswered: "+answered+"\nUnanswered: "+(questions.length-answered)+"\n\nYou cannot submit again after this."))return;
  clearInterval(examTimer);
  const answers=questions.map(q=>({question_id:q.id,answer_text:String(activeExam.responses[q.id]||"")}));
  const {error}=await db.rpc("submit_exam",{p_exam_id:examId,p_answers:answers});
  if(error){toast(error.message);return}
  activeExam=null;
  toast(auto?"Time expired. Your answers were submitted.":"Examination submitted successfully.");
  await studentDashboard($("dash-content"));
}
