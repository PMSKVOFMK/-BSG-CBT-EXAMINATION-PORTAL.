/* BSG CBT portal — Supabase Auth + server-checked exam submissions. */
const cfg=window.BSG_CBT_CONFIG||{};
const ready=!!(cfg.url&&cfg.anonKey&&window.supabase);
const db=ready?window.supabase.createClient(cfg.url,cfg.anonKey):null;
let currentRole=null,currentProfile=null,activeExam=null,examTimer=null,saveTimer=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){$("toast").textContent=t;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500)}
function showLogin(role){currentRole=role;$("welcome").classList.add("hidden");$("dashboard").classList.add("hidden");$("auth").classList.remove("hidden");$("auth-title").textContent=role==="admin"?"Administrator Login":role[0].toUpperCase()+role.slice(1)+" Login";$("auth-error").textContent=""}
function goHome(){$("auth").classList.add("hidden");$("dashboard").classList.add("hidden");$("welcome").classList.remove("hidden")}
$("logout").addEventListener("click",async()=>{if(db)await db.auth.signOut();currentProfile=null;activeExam=null;clearInterval(examTimer);goHome()});
async function loadDashboard(){
 if(!db){$("auth-error").textContent="Database configuration is missing. Reload after setup.";return}
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user){$("auth-error").textContent=userError?.message||"Please sign in again.";return}
 const {data:profile,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
 if(error||!profile){$("auth-error").textContent="Your portal profile is missing or could not be loaded. Contact the administrator."+(error?.message?" ("+error.message+")":"");await db.auth.signOut();return}
 if(currentRole&&profile.role!==currentRole){$("auth-error").textContent="This account does not have the selected role. Please use the correct login page.";await db.auth.signOut();return}
 if(!["admin","examiner","student"].includes(profile.role)){$("auth-error").textContent="This account has no recognised portal role. Contact the administrator.";await db.auth.signOut();return}
 currentProfile=profile;currentRole=profile.role;
 $("staff-hub").classList.add("hidden");$("auth").classList.add("hidden");$("welcome").classList.add("hidden");$("dashboard").classList.remove("hidden");
 $("dash-title").textContent=profile.role==="admin"?"Super Admin Dashboard":profile.role==="examiner"?"Examiner Dashboard":"Student Dashboard";
 const institution=$("dashboard-institution");if(institution)institution.textContent="PM SHRI Kendriya Vidyalaya, Ordnance Factory, Medak, Eddumailaram · School Code: 1525";
 $("user-email").textContent=(profile.full_name||"Portal user")+(profile.section?" · "+profile.section.toUpperCase()+" SECTION":"")+(profile.role==="student"&&profile.candidate_id?" · Candidate ID: "+profile.candidate_id:" · "+(profile.email||user.email||""))+(profile.role==="examiner"&&profile.examiner_code?" · Examiner ID: "+profile.examiner_code:"");
 try{await renderDashboard()}catch(err){$("dash-content").innerHTML='<div class="data-card"><h3>Dashboard could not be loaded</h3><p class="error">'+esc(err?.message||"Please refresh and try again.")+'</p><button class="secondary" type="button" onclick="renderDashboard()">Retry dashboard</button></div>'}
}
async function renderDashboard(){const root=$("dash-content");root.innerHTML='<p class="muted">Loading workspace…</p>';if(currentRole==="admin")return adminDashboard(root);if(currentRole==="examiner")return examinerDashboard(root);return studentDashboard(root)}
async function adminDashboard(root){
 const [{data:exams,error:examError},{count:examiners},{count:students},{count:submissions},{data:examinerProfiles,error:profileError}]=await Promise.all([
  db.from("exams").select("*").order("created_at",{ascending:false}),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","examiner"),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("role","student"),
  db.from("submissions").select("*",{count:"exact",head:true}),
  db.from("profiles").select("id,full_name,email,section,examiner_code,created_at").eq("role","examiner").order("created_at",{ascending:false})
 ]);
 if(examError||profileError){root.textContent=(examError||profileError).message;return}
 root.innerHTML=`<div class="stats"><div class="tile"><strong>${exams?.length||0}</strong><span>Examinations</span></div><div class="tile"><strong>${examiners||0}</strong><span>Examiner Profiles</span></div><div class="tile"><strong>${students||0}</strong><span>Registered Candidates</span></div><div class="tile"><strong>${submissions||0}</strong><span>Submitted Answer Sheets</span></div></div>
 <section class="data-card admin-examiner-profiles"><div class="card-kicker">STAFF MANAGEMENT · SUPER ADMIN</div><h3>Examiner Profiles</h3><p class="muted tiny">Create a separate login for each Scout or Guide examiner. The portal generates the Examiner Login ID automatically.</p>
 <form id="users-form" class="form-grid">
 <label>Examiner full name<input name="full_name" required placeholder="Enter examiner's full name"></label>
 <label>Official email address<input name="email" type="email" required placeholder="examiner@example.com"></label>
 <label>Temporary password<input name="password" type="password" minlength="8" required placeholder="At least 8 characters"></label>
 <label>Assigned section<select name="section" required><option value="">Choose section</option><option value="scout">Scout</option><option value="guide">Guide</option></select></label>
 <div class="wide"><button class="primary" type="submit">Create Examiner Profile &amp; Login</button></div>
 </form><div id="examiner-created" class="created-credentials hidden" role="status"></div>
 <div class="section-title"><h2>Existing Examiner Profiles</h2></div>
 <div class="table-wrap"><table class="examiner-table"><thead><tr><th>Examiner</th><th>Examiner Login ID</th><th>Email</th><th>Section</th></tr></thead><tbody>${(examinerProfiles||[]).map(p=>'<tr><td>'+esc(p.full_name)+'</td><td><span class="examiner-code">'+esc(p.examiner_code||"—")+'</span></td><td>'+esc(p.email)+'</td><td>'+esc((p.section||"").toUpperCase())+'</td></tr>').join("")||'<tr><td colspan="4">No examiner profiles created yet.</td></tr>'}</tbody></table></div>
 </section>
 <section class="data-card admin-exam-control"><div class="card-kicker">EXAMINATION CONTROL · SUPER ADMIN</div><h3>Create examination</h3><p class="muted tiny">Standard format: 50 MCQs × 2 marks = 100 marks · 50 minutes.</p>
 <form id="create-exam" class="form-grid">
 <label>Examination / progression<select name="level" required><option value="">Select examination</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label>
 <label>Start date &amp; time<input name="starts_at" type="datetime-local"></label><label>End date &amp; time<input name="ends_at" type="datetime-local"></label>
 <label class="wide">Candidate instructions<textarea name="instructions" rows="2" placeholder="Read all questions carefully. Each question carries 2 marks."></textarea></label>
 <div class="wide"><button class="primary" type="submit">Create 100-mark examination</button></div></form></section>
 <section class="data-card admin-exam-list"><div class="section-title"><h2>Examination papers &amp; results</h2></div>
 ${(exams||[]).map(x=>'<div class="exam-card"><div class="exam-top"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.level)+' · '+x.total_marks+' marks · '+x.duration_minutes+' minutes</p></div><span class="status">'+esc(x.status)+'</span></div><div class="action-row"><button class="secondary" onclick="addQuestion(\''+x.id+'\')">Add MCQ &amp; answer key</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'published\')">Open exam</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'closed\')">Close exam</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'csv\')">Export CSV</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'xlsx\')">Export Excel</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'pdf\')">Print / PDF</button></div></div>').join("")||'<p class="muted">No examinations created yet.</p>'}
 </section><div class="notice">Super Admin manages examiner profiles and examination papers. Examiners use the same portal workspace to register candidates, create candidate IDs and manage assigned examinations.</div>`;
 $("users-form").addEventListener("submit",createUsers);
 $("create-exam").addEventListener("submit",createExam);
 buildAdminWorkspace(root);
}
async function createUsers(e){
 e.preventDefault();
 if(currentRole!=="admin")return toast("Only Super Admin can create examiner profiles.");
 const form=e.currentTarget,fd=new FormData(form);
 const user={full_name:String(fd.get("full_name")||"").trim(),email:String(fd.get("email")||"").trim().toLowerCase(),password:String(fd.get("password")||""),section:String(fd.get("section")||"").trim().toLowerCase(),role:"examiner"};
 if(!user.full_name||!user.email||user.password.length<8||!["scout","guide"].includes(user.section))return toast("Complete all examiner details. Password must be at least 8 characters.");
 const button=form.querySelector("button[type=submit]");button.disabled=true;button.textContent="Creating examiner login…";
 const {data,error}=await db.functions.invoke("admin-create-users",{body:{users:[user]}});
 button.disabled=false;button.textContent="Create Examiner Profile & Login";
 if(error)return toast(error.message);
 const result=data?.results?.[0];
 if(!result?.success)return toast(result?.error||data?.error||"Examiner account could not be created.");
 const panel=$("examiner-created");panel.classList.remove("hidden");
 panel.innerHTML='<div class="created-head">✓ Examiner profile and login created</div><div class="credential-row"><span>Examiner</span><b>'+esc(user.full_name)+'</b></div><div class="credential-row"><span>Examiner Login ID</span><b>'+esc(result.examiner_id||"")+'</b></div><div class="credential-row"><span>Temporary Password</span><b>'+esc(user.password)+'</b></div><div class="credential-row"><span>Email</span><b>'+esc(user.email)+'</b></div><div class="credential-row"><span>Assigned Section</span><b>'+esc(user.section.toUpperCase())+'</b></div><p class="tiny muted">Share these login details securely with the examiner. The password is not displayed again after leaving this screen.</p>';
 form.reset();toast("Examiner profile created successfully. Login ID: "+(result.examiner_id||""));
}
function buildAdminWorkspace(root){
 const stats=root.querySelector(".stats");
 const profile=root.querySelector(".admin-examiner-profiles");
 const examControl=root.querySelector(".admin-exam-control");
 const examList=root.querySelector(".admin-exam-list");
 const notice=root.querySelector(".notice");
 const shell=document.createElement("div");shell.className="samagam-layout";
 const sidebar=document.createElement("aside");sidebar.className="samagam-sidebar";
 sidebar.innerHTML='<div class="samagam-side-brand"><span>⚜</span><div><b>STAFF WORKSPACE</b><small>Super Admin Control Desk</small></div></div><div class="samagam-nav-label">MAIN MENU</div>';
 const nav=document.createElement("nav");nav.className="samagam-nav";const pages=document.createElement("div");pages.className="samagam-pages";
 const add=(id,title,nodes)=>{const p=document.createElement("section");p.className="samagam-page";p.dataset.page=id;const h=document.createElement("div");h.className="samagam-page-heading";h.innerHTML='<span class="eyebrow">BHARAT SCOUTS &amp; GUIDES · CBT</span><h2>'+title+'</h2>';p.appendChild(h);nodes.filter(Boolean).forEach(n=>p.appendChild(n));pages.appendChild(p)};
 const items=[["overview","▦","Dashboard"],["examiners","♙","Examiner Profiles"],["exams","◷","Examination Management"],["reports","▤","Results & Exports"]];
 items.forEach(([id,ic,title])=>{const b=document.createElement("button");b.type="button";b.dataset.page=id;b.innerHTML='<span class="nav-icon">'+ic+'</span><span>'+title+'</span><span class="nav-chevron">›</span>';b.addEventListener("click",()=>{pages.querySelectorAll(".samagam-page").forEach(p=>p.classList.toggle("active",p.dataset.page===id));nav.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));applyPortalLanguage()});nav.appendChild(b)});
 sidebar.appendChild(nav);const foot=document.createElement("div");foot.className="samagam-side-foot";foot.textContent="Super Admin · Full administration access";sidebar.appendChild(foot);
 add("overview","Dashboard Overview",[stats,notice]);
 add("examiners","Examiner Profiles",[profile]);
 add("exams","Examination Management",[examControl,examList]);
 add("reports","Results & Exports",[examList.cloneNode(true)]);
 shell.appendChild(sidebar);shell.appendChild(pages);root.replaceChildren(shell);const first=nav.querySelector("button");if(first)first.click();
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
  return '<div class="exam-card"><div class="exam-top"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.level)+' · '+x.total_marks+' marks · '+x.duration_minutes+' minutes</p></div><span class="status">'+esc(s?s.status:x.status)+'</span></div>'+result+'<div class="action-row"><button class="secondary" onclick="printAdmitCard(\''+x.id+'\')">Print / Download Admit Card</button></div></div>'
 }).join('')||'<div class="data-card">No examinations assigned yet.</div>';
 buildStudentWorkspace(root);
}
async function printAdmitCard(examId){
 const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print the admit card.");
 const {data:exam,error}=await db.from("exams").select("*").eq("id",examId).single();
 if(error||!exam){w.close();return toast(error?.message||"Examination not found.");}
 const fmt=v=>v?new Date(v).toLocaleString():"To be announced";
 w.document.write('<!doctype html><html><head><title>BSG CBT Admit Card</title><style>body{font:14px Arial;color:#172b43;padding:30px}.card{max-width:760px;margin:auto;border:2px solid #173f69;padding:28px;border-radius:14px}.head{text-align:center;border-bottom:2px solid #d9a52e;padding-bottom:16px}.crest{font-size:38px;color:#173f69}.muted{color:#65768a}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:25px 0}.field{border-bottom:1px solid #dce4ed;padding:8px}.field b{display:block;margin-top:6px}.note{background:#f4f7fb;padding:12px;border-radius:8px}@media print{button{display:none}}</style></head><body><article class="card"><header class="head"><div class="crest">⚜</div><h1>THE BHARAT SCOUTS &amp; GUIDES</h1><h2>CBT EXAMINATION — ADMIT CARD</h2><p class="muted">Independent examination portal</p></header><div class="grid"><div class="field">Candidate Name<b>'+esc(currentProfile.full_name)+'</b></div><div class="field">Candidate ID<b>'+esc(currentProfile.candidate_id||"")+'</b></div><div class="field">Section<b>'+esc((currentProfile.section||"").toUpperCase())+'</b></div><div class="field">Scout / Guide Number<b>'+esc(currentProfile.scout_guide_number||"")+'</b></div><div class="field">Examination Level<b>'+esc(exam.level)+'</b></div><div class="field">Examination Title<b>'+esc(exam.title)+'</b></div><div class="field">Start Date &amp; Time<b>'+esc(fmt(exam.starts_at))+'</b></div><div class="field">Closing Date &amp; Time<b>'+esc(fmt(exam.ends_at))+'</b></div></div><div class="note"><b>Instructions</b><p>'+esc(exam.instructions||"Use your Candidate ID and BSG UID to sign in. Keep this admit card available during the examination.")+'</p><p>Duration: '+exam.duration_minutes+' minutes · Maximum Marks: '+exam.total_marks+'</p></div><p class="muted">Do not share your BSG UID or password with anyone.</p><button onclick="window.print()">Print / Save as PDF</button></article></body></html>');
 w.document.close();
}
async function startExam(id){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});const {data:started,error:se}=await db.rpc("start_exam",{p_exam_id:id});if(se)return toast(se.message);const {data:exam,error}=await db.from("exams").select("*").eq("id",id).single();const {data:questions,error:qe}=await db.from("questions").select("*").eq("exam_id",id).order("position");if(error||qe||!questions?.length)return toast("Questions are not available yet.");activeExam={exam,questions,startedAt:new Date(started).getTime()};const root=$("dash-content");root.innerHTML=`<div class="exam-top"><div><span class="eyebrow">EXAM IN PROGRESS</span><h2>${esc(exam.title)}</h2><p>${exam.total_marks} marks · ${exam.duration_minutes} minutes</p></div><div class="status" id="timer"></div></div><div class="notice">Your start time is recorded by the server. Do not close the page before submitting. If the exam window or duration expires, the server will reject late submissions.</div><form id="exam-form">${questions.map((q,i)=>`<div class="question"><b>Q${i+1}. ${esc(q.question_text)}</b><p class="muted tiny">${q.marks} marks</p>${q.question_type==="mcq"?(q.options||[]).map(o=>`<label><input type="radio" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join(""):`<textarea class="answer-input" name="q_${q.id}" placeholder="Type your answer…"></textarea>`}</div>`).join("")}<button class="primary">Submit examination</button></form>`;const tick=()=>{const left=Math.max(0,Math.ceil((activeExam.startedAt+exam.duration_minutes*60000-Date.now())/1000));$("timer").textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");if(left===10)toast("10 seconds remaining. Check any unanswered questions.");if(left<=0){clearInterval(examTimer);submitExam(true)}};tick();examTimer=setInterval(tick,1000);$("exam-form").addEventListener("submit",e=>{e.preventDefault();submitExam(false)})}
async function submitExam(auto){if(!activeExam)return;clearInterval(examTimer);const form=$("exam-form");if(!form)return;const fd=new FormData(form);const answers=activeExam.questions.map(q=>({question_id:q.id,answer_text:String(fd.get("q_"+q.id)||"")}));const {error}=await db.rpc("submit_exam",{p_exam_id:activeExam.exam.id,p_answers:answers});activeExam=null;if(error){toast(error.message);return}toast(auto?"Time expired. Submission received if within the server deadline.":"Examination submitted successfully.");await studentDashboard($("dash-content"))}
async function examinerDashboard(root){
 const {data:exams,error:ee}=await db.from("exams").select("*").order("created_at",{ascending:false});
 if(ee){root.textContent=ee.message;return}
 const {data:subs,error}=await db.from("submissions").select("*,exams(title,total_marks),answers(*,questions(question_text,marks,question_type))").order("submitted_at",{ascending:true});
 if(error){root.textContent=error.message;return}
 const ids=[...new Set((subs||[]).map(s=>s.student_id))];
 const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name,email,candidate_id,section").in("id",ids):{data:[]};
 const {data:proctorEvents}=await db.from("proctoring_events").select("*").order("created_at",{ascending:false}).limit(100);
 const pmap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
 root.innerHTML=`<div class="data-card"><div class="card-kicker">CANDIDATE REGISTRATION · 01</div><h3>Register a Scout / Guide candidate</h3><p class="muted tiny">The examiner enters the student's details. The seven-digit Candidate ID becomes the login ID, and the BSG UID number is automatically set as the password. No student email address is required.</p><form id="student-users-form" class="form-grid">
 <label>Student full name<input name="full_name" required autocomplete="name" placeholder="Enter student's full name"></label>
 <label>Father's name<input name="father_name" required placeholder="Enter father's name"></label>
 <label>Scout / Guide Section<select name="section" required><option value="">Select section</option><option value="scout">Scout</option><option value="guide">Guide</option></select></label><label>Scout / Guide Number<input name="scout_guide_number" required placeholder="Enter Scout / Guide number"></label>
 <label>Progression / Examination Level<select name="candidate_level" required><option value="">Select progression level</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label>
 <label>BSG UID Number<input name="bsg_uid" required inputmode="numeric" pattern="[0-9]{6,20}" minlength="6" maxlength="20" placeholder="Enter BSG UID number"></label>
 <fieldset class="wide id-choice"><legend>Candidate ID type</legend><label class="choice-inline"><input type="radio" name="candidate_id_mode" value="existing" checked> Existing Candidate ID</label><label class="choice-inline"><input type="radio" name="candidate_id_mode" value="generated"> Non-existing — generate a new ID</label><label id="candidate-id-entry">Enter existing seven-digit Candidate ID<input id="candidate-id-input" name="candidate_id" required inputmode="numeric" pattern="[0-9]{7}" minlength="7" maxlength="7" placeholder="Enter the already-issued ID"></label><small>Existing IDs are preserved. New IDs are generated by the secure server and checked for uniqueness across Scouts and Guides.</small></fieldset>
 <div class="wide"><button class="primary">Create student login account</button></div>
 </form><div id="student-created" class="created-credentials hidden" role="status"></div></div>
 <div class="section-title"><h2>Available examinations for candidate assignment</h2></div>
 ${(exams||[]).map(x=>`<div class="exam-card"><div class="exam-top"><div><h3>${esc(x.title)}</h3><p>${esc(x.level)} · ${x.total_marks} marks · ${x.duration_minutes} minutes</p></div><span class="status">${esc(x.status)}</span></div><div class="action-row"><button class="secondary" onclick="assignExam('${x.id}')">Assign to candidate</button></div></div>`).join("")||'<p class="muted">No examination papers have been created by Super Admin yet.</p>'}
 <div class="section-title"><h2>Submitted answer sheets & marking</h2></div>
 ${(subs||[]).map(s=>`<div class="data-card"><h3>${esc(s.exams?.title)} — ${esc(pmap[s.student_id]?.full_name||pmap[s.student_id]?.email||"Student")}</h3><p class="muted tiny">Submitted: ${new Date(s.submitted_at).toLocaleString()} · ${esc(s.status)}</p>${(s.answers||[]).map(a=>`<div class="question"><b>${esc(a.questions?.question_text)}</b><p>${esc(a.answer_text||"No answer")}</p><p class="muted tiny">Automatic MCQ marks: ${a.auto_marks||0}</p><label>Examiner marks (max ${a.questions?.marks})<input type="number" min="0" max="${a.questions?.marks}" step="0.5" id="mark-${a.id}" value="${a.marks_awarded??a.auto_marks??0}"></label><button class="secondary" onclick="saveMark('${a.id}')">Save marks</button></div>`).join("")}<button onclick="publishResult('${s.id}')">Finalise & publish result</button></div>`).join("")||'<p class="muted">No submitted scripts yet.</p>'}
 <section class="data-card"><div class="section-title"><h2>Remote examination monitoring</h2><span class="status">Incident log</span></div><p class="muted tiny">Tab changes, loss of browser focus, full-screen exits and copy/paste attempts are logged as review alerts, not automatic proof of misconduct.</p>${(proctorEvents||[]).map(ev=>'<div class="event-row"><b>'+esc(pmap[ev.student_id]?.full_name||'Candidate')+'</b><span>'+esc(ev.event_type.replaceAll('_',' '))+'</span><small>'+new Date(ev.created_at).toLocaleString()+'</small></div>').join('')||'<p class="muted">No monitoring incidents recorded.</p>'}</section><div class="notice">Question papers, answer keys, examination schedules and opening/closing are controlled by Super Admin. Examiners register candidates and assign the relevant examination.</div>`;
 $("student-users-form").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget,fd=new FormData(form);
 const student={full_name:String(fd.get("full_name")||"").trim(),father_name:String(fd.get("father_name")||"").trim(),scout_guide_number:String(fd.get("scout_guide_number")||"").trim(),candidate_level:String(fd.get("candidate_level")||"").trim(),section:String(fd.get("section")||"").trim(),bsg_uid:String(fd.get("bsg_uid")||"").trim(),candidate_id_mode:String(fd.get("candidate_id_mode")||"existing"),candidate_id:String(fd.get("candidate_id")||"").trim(),role:"student"};
 if(!["scout","guide"].includes(student.section))return toast("Choose Scout or Guide section.");
 if(student.candidate_id_mode==="existing"&&!/^\d{7}$/.test(student.candidate_id))return toast("Enter the existing seven-digit Candidate ID.");
 if(!["existing","generated"].includes(student.candidate_id_mode))return toast("Choose Existing or Generate New Candidate ID.");
 if(!/^\d{6,20}$/.test(student.bsg_uid))return toast("Enter a valid numeric BSG UID number (6–20 digits).");
 const button=form.querySelector("button[type=submit],button:not([type])");button.disabled=true;button.textContent="Creating secure login…";
 const {data,error}=await db.functions.invoke("admin-create-users",{body:{student}});
 button.disabled=false;button.textContent="Create student login account";
 if(error)return toast(error.message);
 const result=data?.results?.[0];
 if(!result?.success)return toast(result?.error||data?.error||"Student account could not be created.");
 const panel=$("student-created");panel.classList.remove("hidden");
 panel.innerHTML='<div class="created-head">✓ Candidate account created successfully</div><div class="credential-row"><span>Student</span><b>'+esc(student.full_name)+'</b></div><div class="credential-row"><span>Candidate Login ID</span><b>'+esc(result.candidate_id||student.candidate_id)+'</b></div><div class="credential-row"><span>Initial Password</span><b>'+esc(student.bsg_uid)+'</b></div><div class="credential-row"><span>Section</span><b>'+esc(student.section.toUpperCase())+'</b></div><div class="credential-row"><span>Scout / Guide Number</span><b>'+esc(student.scout_guide_number)+'</b></div><div class="credential-row"><span>Progression Level</span><b>'+esc(student.candidate_level)+'</b></div><p class="tiny muted">Give the Candidate ID and BSG UID to the student securely. The password itself is not stored in the profile table.</p>';
 form.reset();const idMode=form.querySelector('input[name="candidate_id_mode"]:checked');if(idMode)idMode.dispatchEvent(new Event("change",{bubbles:true}));toast("Student login created.");
});
 form.querySelectorAll('input[name="candidate_id_mode"]').forEach(r=>r.addEventListener("change",()=>{const generated=r.value==="generated"&&r.checked;const input=$("candidate-id-input");$("candidate-id-entry").classList.toggle("hidden",generated);input.required=!generated;input.disabled=generated;if(generated)input.value="";}));
 const bulk=document.createElement("div");bulk.className="data-card";bulk.innerHTML='<h3>Bulk register candidates from Excel</h3><p class="muted tiny">Upload .xlsx/.xls with columns: full_name, father_name, scout_guide_number, candidate_level, bsg_uid, candidate_id, candidate_id_mode, section. Use candidate_id_mode=existing or generated.</p><input id="candidate-xlsx" type="file" accept=".xlsx,.xls"><button type="button" class="secondary" id="import-candidates">Import Excel sheet</button><div id="bulk-created" class="created-credentials hidden"></div>';
 const registration=$("student-users-form");registration.parentElement.insertBefore(bulk,registration.nextSibling);
 $("import-candidates").addEventListener("click",async()=>{
  const file=$("candidate-xlsx").files[0];if(!file)return toast("Choose an Excel file first.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
  if(!rows.length)return toast("The Excel sheet is empty.");if(rows.length>100)return toast("Import a maximum of 100 candidates at a time.");
  const users=rows.map(r=>({full_name:String(r.full_name||r.name||"").trim(),father_name:String(r.father_name||"").trim(),scout_guide_number:String(r.scout_guide_number||"").trim(),candidate_level:String(r.candidate_level||"").trim(),bsg_uid:String(r.bsg_uid||"").trim(),candidate_id:String(r.candidate_id||"").trim(),candidate_id_mode:String(r.candidate_id_mode||"existing").trim().toLowerCase(),section:String(r.section||"").trim().toLowerCase(),role:"student"}));
  if(users.some(u=>!u.full_name||!u.father_name||!u.scout_guide_number||!u.candidate_level||(u.candidate_id_mode==="existing"&&!/^\d{7}$/.test(u.candidate_id))||!["existing","generated"].includes(u.candidate_id_mode)||!/^\d{6,20}$/.test(u.bsg_uid)||!["scout","guide"].includes(u.section)))return toast("Check required columns, Candidate ID type, BSG UIDs and Scout/Guide sections.");
  const btn=$("import-candidates");btn.disabled=true;const {data,error}=await db.functions.invoke("admin-create-users",{body:{users}});btn.disabled=false;
  if(error)return toast(error.message);const results=data?.results||[],ok=results.filter(x=>x.success),bad=results.filter(x=>!x.success);const box=$("bulk-created");box.classList.remove("hidden");box.innerHTML="<b>"+ok.length+" created · "+bad.length+" failed</b>"+(ok.length?"<ul>"+ok.map(x=>"<li>"+esc(x.candidate_id||"Candidate ID created")+"</li>").join("")+"</ul>":"")+(bad.length?"<ul>"+bad.map(x=>"<li>"+esc(x.candidate_id||"Row")+": "+esc(x.error)+"</li>").join("")+"</ul>":"");toast("Bulk registration completed.");
 });
 buildExaminerWorkspace(root);
}

async function buildExaminerWorkspace(root){
 const reg=$("student-users-form")?.closest(".data-card"),bulk=reg?.querySelector("#candidate-xlsx")?.closest(".data-card")||null;
 const titles=[...root.querySelectorAll(".section-title")],examTitle=titles.find(x=>x.textContent.includes("Available examinations for candidate assignment")),submissionTitle=titles.find(x=>x.textContent.includes("Submitted answer sheets"));
 const monitoring=[...root.querySelectorAll(".data-card")].find(x=>x.querySelector("h2")?.textContent.includes("Remote examination monitoring"));
 const examNodes=[];let node=examTitle;if(node){examNodes.push(node);node=node.nextElementSibling;while(node&&node!==submissionTitle){const next=node.nextElementSibling;examNodes.push(node);node=next;}}
 const submissionNodes=[];if(submissionTitle){submissionNodes.push(submissionTitle);node=submissionTitle.nextElementSibling;while(node&&node!==monitoring&&!node.classList.contains("notice")){const next=node.nextElementSibling;submissionNodes.push(node);node=next;}}
 const notice=[...root.querySelectorAll(".notice")].at(-1);
 const {data:candidates,error:candidateError}=await db.from("profiles").select("full_name,candidate_id,email,bsg_uid,section,candidate_level,created_at").eq("role","student").eq("section",currentProfile.section).order("created_at",{ascending:false}).limit(250);
 const candidateRegister=document.createElement("section");candidateRegister.className="data-card";candidateRegister.innerHTML='<div class="section-title"><h2>Candidate Login Register</h2><span class="portal-mark">'+(candidates||[]).length+' ACCOUNTS</span></div><p class="muted tiny">Permanent register saved in the portal database. The initial password is the candidate BSG UID. Keep this information confidential.</p>'+(candidateError?'<p class="error">'+esc(candidateError.message)+'</p>':(candidates||[]).length?'<div class="table-wrap"><table><thead><tr><th>Candidate Login ID</th><th>Candidate Name</th><th>Initial Password (BSG UID)</th><th>Section</th><th>Level</th><th>Created</th></tr></thead><tbody>'+(candidates||[]).map(p=>'<tr><td><b>'+esc(p.candidate_id||"—")+'</b></td><td>'+esc(p.full_name||"")+'</td><td><b>'+esc(p.bsg_uid||"Not available")+'</b></td><td>'+esc((p.section||"").toUpperCase())+'</td><td>'+esc(p.candidate_level||"")+'</td><td>'+(p.created_at?new Date(p.created_at).toLocaleDateString():"—")+'</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">No candidate accounts are registered for your section yet.</p>');
 const profile=document.createElement("section");profile.className="data-card";profile.innerHTML='<h3>Examiner Profile</h3><div class="credential-row"><span>Full Name</span><b>'+esc(currentProfile.full_name||"")+'</b></div><div class="credential-row"><span>Examiner Login ID</span><b>'+esc(currentProfile.examiner_code||"—")+'</b></div><div class="credential-row"><span>Registered Email</span><b>'+esc(currentProfile.email||"")+'</b></div><div class="credential-row"><span>Assigned Section</span><b>'+esc((currentProfile.section||"").toUpperCase())+'</b></div><p class="muted tiny">Your assigned section controls which candidates you can register and view.</p>';
 const stats=document.createElement("div");stats.className="stats";stats.innerHTML='<div class="tile"><strong>'+(candidates||[]).length+'</strong><span>Registered Candidates</span></div><div class="tile"><strong>'+examNodes.filter(n=>n.classList.contains("exam-card")).length+'</strong><span>Available Examinations</span></div><div class="tile"><strong>'+submissionNodes.filter(n=>n.classList.contains("data-card")).length+'</strong><span>Submitted Scripts</span></div><div class="tile"><strong>'+esc((currentProfile.section||"").toUpperCase())+'</strong><span>Assigned Section</span></div>';
 const shell=document.createElement("div");shell.className="samagam-layout";const sidebar=document.createElement("aside");sidebar.className="samagam-sidebar";
 sidebar.innerHTML='<div class="samagam-side-brand"><span>⚜</span><div><b>BSG WORKSPACE</b><small>Examination Control</small></div></div><div class="samagam-nav-label">MAIN MENU</div>';
 const nav=document.createElement("nav");nav.className="samagam-nav";const pages=document.createElement("div");pages.className="samagam-pages";
 const items=[["overview","⌂","Overview"],["profile","♙","My Profile"],["registration","▣","Candidate Registration"],["candidates","▤","Candidate Login Register"],["exams","◷","Examination Assignment"],["scripts","▥","Submitted Answer Sheets"],["monitoring","◉","Remote Monitoring"]];
 const addPage=(id,title,nodes=[])=>{const page=document.createElement("section");page.className="samagam-page";page.dataset.page=id;const h=document.createElement("div");h.className="samagam-page-heading";h.innerHTML='<span class="eyebrow">BSG EXAMINATION MANAGEMENT</span><h2>'+title+'</h2>';page.appendChild(h);nodes.filter(Boolean).forEach(n=>page.appendChild(n));pages.appendChild(page)};
 items.forEach(([id,icon,title])=>{const b=document.createElement("button");b.type="button";b.dataset.page=id;b.dataset.title=title;b.innerHTML='<span class="nav-icon">'+icon+'</span><span>'+title+'</span><span class="nav-chevron">›</span>';b.addEventListener("click",()=>openAdminModule(id));nav.appendChild(b)});
 sidebar.appendChild(nav);const foot=document.createElement("div");foot.className="samagam-side-foot";foot.textContent="Section-restricted examiner access";sidebar.appendChild(foot);
 addPage("overview","Overview",[stats,notice]);addPage("profile","My Profile",[profile]);addPage("registration","Candidate Registration",[reg,bulk]);addPage("candidates","Candidate Login Register",[candidateRegister]);addPage("exams","Examination Assignment",examNodes);addPage("scripts","Submitted Answer Sheets",submissionNodes);addPage("monitoring","Remote Monitoring",[monitoring]);
 shell.appendChild(sidebar);shell.appendChild(pages);root.replaceChildren(shell);openAdminModule("overview");applyPortalLanguage();
}
async function saveMark(id){const marks=Number($("mark-"+id).value);if(!Number.isFinite(marks)||marks<0)return toast("Invalid mark.");const {error}=await db.from("answers").update({marks_awarded:marks}).eq("id",id);toast(error?error.message:"Marks saved")}
async function publishResult(id){const {data:ans,error}=await db.from("answers").select("marks_awarded,auto_marks").eq("submission_id",id);if(error)return toast(error.message);const total=(ans||[]).reduce((n,a)=>n+Number(a.marks_awarded??a.auto_marks??0),0);const {error:e}=await db.from("submissions").update({status:"published",marks_awarded:total,published_at:new Date().toISOString()}).eq("id",id);toast(e?e.message:"Result published: "+total+" marks")}
async function publishResults(examId){
 if(currentRole!=="admin")return toast("Only the Super Admin can publish results.");
 const {count,error}=await db.from("submissions").select("*",{count:"exact",head:true}).eq("exam_id",examId);
 if(error)return toast(error.message);
 if(!count)return toast("No candidate submissions are available for this examination.");
 if(!confirm("Publish automatically evaluated results for "+count+" candidate(s)? Students will then see their marks and result category."))return;
 const {error:up}=await db.from("submissions").update({status:"published",published_at:new Date().toISOString()}).eq("exam_id",examId);
 if(up)return toast(up.message);
 toast("Results published for "+count+" candidate(s).");
 await renderDashboard();
}
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

let proctorListenersBound=false;
const proctorLastEvent={};
async function logProctorEvent(eventType,details={}){
 const session=activeExam;if(!session||currentRole!=="student"||!currentProfile)return;
 const now=Date.now();if(now-(proctorLastEvent[eventType]||0)<2500)return;proctorLastEvent[eventType]=now;
 session.incidentCount=(session.incidentCount||0)+1;
 const {error}=await db.from("proctoring_events").insert({student_id:currentProfile.id,exam_id:session.exam.id,event_type:eventType,event_details:details});
 if(error)console.warn("Monitoring event could not be saved",error.message);
 const warning=$("proctor-warning");if(warning&&activeExam===session)warning.textContent="Monitoring alert "+session.incidentCount+": "+eventType.replaceAll("_"," ")+" recorded. Please remain on the examination page.";
}
function bindRemoteExamMonitoring(){
 if(proctorListenersBound)return;proctorListenersBound=true;
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")logProctorEvent("tab_hidden",{visibility:document.visibilityState})});
 window.addEventListener("blur",()=>logProctorEvent("window_blur",{reason:"browser window lost focus"}));
 document.addEventListener("fullscreenchange",()=>{if(activeExam&&!document.fullscreenElement)logProctorEvent("fullscreen_exit",{reason:"full-screen mode exited"})});
 document.addEventListener("copy",e=>{if(activeExam){e.preventDefault();logProctorEvent("copy_attempt",{surface:"exam page"})}});
 document.addEventListener("paste",e=>{if(activeExam){e.preventDefault();logProctorEvent("paste_attempt",{surface:"exam page"})}});
 document.addEventListener("contextmenu",e=>{if(activeExam){e.preventDefault();logProctorEvent("context_menu",{surface:"exam page"})}});
}
let parsedQuestionImport=null;
function parseQuestionPaperText(raw){
 const lines=String(raw||"").replace(/\r/g,"").split("\n");const questions=[];let current=null,activeOption=null;
 const qStart=/^\s*(?:Q(?:uestion)?\s*)?(\d{1,2})\s*[.)]\s*(.*)$/i,optStart=/^\s*\(?([A-D])\)?\s*[\).:\-]\s*(.+)$/i;
 for(const line of lines){const t=line.trim();if(!t)continue;const qm=t.match(qStart);if(qm){if(current)questions.push(current);current={number:Number(qm[1]),text:qm[2].trim(),options:{}};activeOption=null;continue}
 const om=t.match(optStart);if(om&&current){const letter=om[1].toUpperCase();current.options[letter]=om[2].trim();activeOption=letter;continue}
 if(current){if(activeOption)current.options[activeOption]+=" "+t;else current.text+=(current.text?" ":"")+t}}
 if(current)questions.push(current);return questions;
}
function parseAnswerSheet(raw){
 const map={},text=String(raw||"").replace(/\r/g,"\n"),re=/(?:^|[\n,;])\s*(?:Q(?:uestion)?\s*)?(\d{1,2})\s*[.)\-: ]\s*\(?([A-D])\)?(?=\s*(?:[,;\n]|$))/gi;
 let m;while((m=re.exec(text))!==null)map[Number(m[1])]=m[2].toUpperCase();return map;
}
function renderImportPreview(parsed){
 const box=$("import-preview"),status=$("import-status"),save=$("save-import-btn");if(!box||!status||!save)return;
 status.textContent="Detected "+parsed.questions.length+" questions and "+Object.keys(parsed.answers).length+" answer-key entries.";
 box.innerHTML='<div class="import-summary"><b>'+parsed.questions.length+'/50 questions</b><span>'+Object.keys(parsed.answers).length+'/50 answers</span><span>'+(parsed.errors.length?parsed.errors.length+" issue(s)":"No structural issues detected")+'</span></div>'+(parsed.errors.length?'<ul class="import-errors">'+parsed.errors.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':'')+'<div class="table-wrap"><table class="import-table"><thead><tr><th>No.</th><th>Question</th><th>Options</th><th>Key</th><th>Check</th></tr></thead><tbody>'+parsed.questions.map(q=>{const opts=["A","B","C","D"].map(k=>q.options[k]||""),key=parsed.answers[q.number]||"",valid=opts.every(Boolean)&&new Set(opts).size===4&&!!key&&!!opts["ABCD".indexOf(key)];return '<tr><td>'+q.number+'</td><td>'+esc(q.text)+'</td><td>'+opts.map((o,i)=>'<div><b>'+"ABCD"[i]+'.</b> '+esc(o)+'</div>').join("")+'</td><td><b>'+esc(key||"Missing")+'</b></td><td>'+(valid?'<span class="import-good">Ready</span>':'<span class="import-bad">Check</span>')+'</td></tr>'}).join("")+'</tbody></table></div>';
 save.disabled=parsed.errors.length>0||parsed.questions.length!==50||Object.keys(parsed.answers).length!==50;
}
function validateQuestionImport(questionText,answerText){
 const questions=parseQuestionPaperText(questionText),answers=parseAnswerSheet(answerText),errors=[],nums=new Set();
 if(questions.length!==50)errors.push("Exactly 50 numbered questions are required; detected "+questions.length+".");
 for(const q of questions){if(nums.has(q.number))errors.push("Duplicate question number "+q.number+".");nums.add(q.number);if(!q.text)errors.push("Question "+q.number+" has no question text.");
 const opts=["A","B","C","D"].map(k=>q.options[k]||"");if(opts.some(x=>!x))errors.push("Question "+q.number+" must have four options labelled A, B, C and D.");if(new Set(opts).size!==4)errors.push("Question "+q.number+" has duplicate or empty options.");if(!answers[q.number])errors.push("Answer key missing for question "+q.number+".");if(answers[q.number]&&!q.options[answers[q.number]])errors.push("Answer key "+answers[q.number]+" does not match an option in question "+q.number+".")}
 for(const n of Object.keys(answers))if(!nums.has(Number(n)))errors.push("Answer sheet contains question "+n+" which is not in the paper.");for(let n=1;n<=50;n++)if(!nums.has(n))errors.push("Question number "+n+" is missing.");
 return {questions,answers,errors};
}
async function loadExternalScript(src,globalName){
 if(window[globalName])return window[globalName];await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error("Could not load PDF extraction library. Check your internet connection and try again."));document.head.appendChild(s)});
 if(!window[globalName])throw new Error("PDF extraction library did not initialise.");return window[globalName];
}
async function extractPdfText(file){
 const status=$("import-status");status.textContent="Reading PDF pages…";const pdfjs=await loadExternalScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","pdfjsLib");
 pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;let all=[],ocr=null;
 for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){status.textContent="Extracting PDF page "+pageNo+" of "+pdf.numPages+"…";const page=await pdf.getPage(pageNo),content=await page.getTextContent();let lines=[],line="",lastY=null;for(const item of content.items){const y=Math.round(item.transform?.[5]||0);if(lastY!==null&&Math.abs(y-lastY)>3){lines.push(line);line=""}line+=(item.str||"")+" ";lastY=y}if(line)lines.push(line);let text=lines.join("\n");
 if(text.trim().length<30){if(!ocr)ocr=await loadExternalScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js","Tesseract");const viewport=page.getViewport({scale:1.7}),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:ctx,viewport}).promise;text=(await ocr.recognize(canvas,"eng")).data.text||""}all.push(text)}
 return all.join("\n");
}
async function previewQuestionImport(){
 try{const file=$("import-paper-pdf")?.files?.[0];if(file){if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))throw new Error("Please choose a PDF file.");if(file.size>20*1024*1024)throw new Error("PDF must be 20 MB or smaller.");$("import-paper-text").value=await extractPdfText(file)}
 const answerFile=$("import-answer-pdf")?.files?.[0];if(answerFile){if(answerFile.type!=="application/pdf"&&!answerFile.name.toLowerCase().endsWith(".pdf"))throw new Error("Please choose a PDF answer key.");if(answerFile.size>20*1024*1024)throw new Error("Answer-key PDF must be 20 MB or smaller.");$("import-answer-text").value=await extractPdfText(answerFile)}
 const parsed=validateQuestionImport($("import-paper-text").value,$("import-answer-text").value);parsedQuestionImport=parsed;renderImportPreview(parsed);toast(parsed.errors.length?"Please correct the flagged questions and answer-key entries.":"All 50 questions and answers are ready for review.")
 }catch(e){toast(e.message||"Could not read the question paper.");$("import-status").textContent=e.message||"Import failed."}
}
async function saveQuestionImport(){
 const examId=$("import-exam-select").value,parsed=parsedQuestionImport;if(!examId)return toast("Select a draft examination first.");if(!parsed||parsed.errors.length||parsed.questions.length!==50)return toast("Check and preview a valid 50-question paper first.");
 const {data:exam,error:ee}=await db.from("exams").select("id,status,created_by").eq("id",examId).single();if(ee||!exam)return toast(ee?.message||"Examination not found.");if(exam.status!=="draft"||exam.created_by!==currentProfile.id)return toast("Only your own draft examinations can receive imported questions.");
 const {count,error:ce}=await db.from("questions").select("id",{count:"exact",head:true}).eq("exam_id",examId);if(ce)return toast(ce.message);if((count||0)>0)return toast("This examination already contains questions. Create a fresh draft to import the complete paper safely.");
 const btn=$("save-import-btn");btn.disabled=true;btn.textContent="Saving questions and answer keys…";const inserted=[];
 try{for(const q of parsed.questions){const options=["A","B","C","D"].map(k=>q.options[k]);const {data:row,error:ie}=await db.from("questions").insert({exam_id:examId,question_text:q.text,question_type:"mcq",marks:2,options,position:q.number}).select("id").single();if(ie)throw ie;inserted.push(row.id);
 const correct=options["ABCD".indexOf(parsed.answers[q.number])];const {error:ke}=await db.rpc("set_question_key",{p_question_id:row.id,p_correct_answer:correct,p_accepted_answers:[]});if(ke)throw ke}
 toast("Imported 50 MCQs and 50 answer keys. Paper remains in draft for final review.");parsedQuestionImport=null;$("import-paper-text").value="";$("import-answer-text").value="";$("import-paper-pdf").value="";$("import-answer-pdf").value="";$("import-preview").innerHTML="";$("import-status").textContent="Import complete. Review the draft before publishing.";await renderDashboard()
 }catch(e){if(inserted.length)await db.from("questions").delete().in("id",inserted);toast("Import stopped; inserted rows were rolled back where permitted. "+(e.message||"Unknown error"));btn.disabled=false}
 finally{btn.textContent="Save 50 Questions & Answer Key"}
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
 const route=location.hash.toLowerCase().replace(/\/$/,"");
 $("staff-hub").classList.add("hidden");
 if(route==="#/staff"){document.body.dataset.portalRole="staff";showStaffPortal()}
 else if(route==="#/staff/examiner"||route==="#/login/examiner"){document.body.dataset.portalRole="examiner";showLogin("examiner")}
 else if(route==="#/staff/super-admin"||route==="#/login/super-admin"||route==="#/login/admin"){document.body.dataset.portalRole="admin";showLogin("admin")}
 else if(route==="#/student"||route==="#/login/student"){document.body.dataset.portalRole="student";showLogin("student")}
 else{document.body.dataset.portalRole="home";$("auth").classList.add("hidden");if(!$("dashboard").classList.contains("hidden"))return;$("welcome").classList.remove("hidden")}
}
window.addEventListener("hashchange",routePortal);
routePortal();
if(db){
 db.auth.getSession().then(({data,error})=>{
  if(error){console.warn("Session restore:",error.message);return}
  if(data?.session?.user&&!currentProfile)loadDashboard();
 });
}

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
 const rows=(data||[]).map(p=>kind==="examiner"?{"Examiner ID":p.examiner_code||"","Examiner Name":p.full_name||"","Section":p.section||"","Email":p.email||""}:{"Candidate ID":p.candidate_id||"","Student Name":p.full_name||"","Section":p.section||"","Level":p.candidate_level||"","Initial Password (BSG UID)":p.bsg_uid||"Not available"});
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
  db.from("profiles").select("id,full_name,candidate_id,bsg_uid,section,candidate_level,created_at").eq("role","student").order("created_at",{ascending:false}).limit(250),
  db.from("questions").select("exam_id,id")
 ]);
 const qCounts={};(questions||[]).forEach(q=>qCounts[q.exam_id]=(qCounts[q.exam_id]||0)+1);
 root.innerHTML=`<div class="stats"><div class="tile"><strong>${exams?.length||0}</strong><span>Question papers</span></div><div class="tile"><strong>${examiners||0}</strong><span>Examiner accounts</span></div><div class="tile"><strong>${students||0}</strong><span>Candidate accounts</span></div><div class="tile"><strong>${submissions||0}</strong><span>Submissions</span></div></div>
 <div class="admin-module-grid">
 <button type="button" class="admin-module" onclick="openAdminModule('papers')"><b>📝 Create Question Paper</b><span>Create examination and add 50 MCQs</span></button>
 <button type="button" class="admin-module" onclick="openAdminModule('examiners')"><b>🧑‍🏫 Examiner ID Creation</b><span>Create Scout and Guide examiner logins</span></button>
 <button type="button" class="admin-module" onclick="openAdminModule('credentials')"><b>🪪 Export ID Registers</b><span>Download examiner and candidate IDs</span></button>
 <button type="button" class="admin-module" onclick="openAdminModule('candidates')"><b>👥 Candidate Register</b><span>View registered Scouts and Guides</span></button>
 <button type="button" class="admin-module" onclick="openAdminModule('schedule')"><b>📅 Examination Management</b><span>Publish, close and monitor papers</span></button>
 <button type="button" class="admin-module" onclick="openAdminModule('results')"><b>📊 Results & Exports</b><span>Download result sheets and reports</span></button>
 </div>
 <section class="data-card" id="admin-examiner-create"><div class="card-kicker">ACCOUNT MANAGEMENT</div><h3>Create examiner credentials</h3><p class="muted tiny">Create separate Scout and Guide examiner accounts. The portal generates the Examiner ID.</p><form id="examiner-create-form" class="form-grid"><label>Examiner full name<input name="full_name" required placeholder="Enter full name"></label><label>Assigned section<select name="section" required><option value="">Choose section</option><option value="scout">Scout Examiner</option><option value="guide">Guide Examiner</option></select></label><label>Official email address<input name="email" type="email" required placeholder="examiner@example.com"></label><label class="wide">Temporary password<input name="password" type="password" minlength="8" required placeholder="Minimum 8 characters"></label><div class="wide"><button class="primary" type="submit">Generate Examiner ID &amp; Create Account →</button></div></form><div id="created-credentials" class="created-credentials hidden"></div></section>
 <section class="data-card" id="admin-paper-create"><div class="card-kicker">QUESTION PAPER CONTROL</div><h3>Create a new examination paper</h3><p class="muted tiny">NHQ pattern: 50 MCQs × 2 marks = 100 marks · 50 minutes. The paper stays in draft until all questions and answer keys are verified.</p><form id="admin-exam-form" class="form-grid"><label>Examination level<select name="level" required><option value="">Select level</option><option>Pravesh</option><option>Pratham Sopan</option><option>Pravesh + Pratham Sopan</option><option>Dwitiya Sopan</option></select></label><label>Start date and time<input type="datetime-local" name="starts_at"></label><label>Closing date and time<input type="datetime-local" name="ends_at"></label><label class="wide">Instructions<textarea name="instructions" rows="3" placeholder="Enter instructions for candidates"></textarea></label><div class="wide"><button class="primary" type="submit">Create 100-mark question paper</button></div></form></section>
 <section class="data-card" id="admin-question-import"><div class="card-kicker">QUESTION PAPER IMPORT · PDF / COPY & PASTE</div><h3>Import complete question paper & answer sheet</h3><p class="muted tiny">Paste the complete paper and answer key separately, or upload a PDF. The portal extracts numbered questions and A–D options, matches answer letters, and previews everything before saving. Draft papers only.</p><div class="form-grid"><label class="wide">Choose an existing draft examination<select id="import-exam-select"><option value="">Select a draft question paper</option>${(exams||[]).filter(x=>x.status==="draft").map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+' · '+esc(x.level)+'</option>').join('')}</select></label><label class="wide">Question paper text<textarea id="import-paper-text" rows="12" placeholder="1. Question text&#10;A) First option&#10;B) Second option&#10;C) Third option&#10;D) Fourth option&#10;&#10;2. Next question..."></textarea></label><label class="wide">Answer sheet<textarea id="import-answer-text" rows="6" placeholder="1. B&#10;2. A&#10;3. D&#10;...&#10;50. C"></textarea></label><label class="wide">Or upload question paper PDF<input id="import-paper-pdf" type="file" accept="application/pdf,.pdf"></label><label class="wide">Or upload answer-key PDF<input id="import-answer-pdf" type="file" accept="application/pdf,.pdf"></label><div class="wide action-row"><button class="secondary" id="parse-import-btn" type="button">Check & Preview Question Paper</button><button class="primary" id="save-import-btn" type="button" disabled>Save 50 Questions & Answer Key</button></div></div><div id="import-status" class="muted tiny" role="status"></div><div id="import-preview"></div></section>
 <section class="data-card" id="admin-paper-list"><div class="section-title"><h2>Question papers & examination control</h2></div>${examErr?'<p class="error">'+esc(examErr.message)+'</p>':(exams||[]).map(x=>'<article class="exam-card"><div class="exam-top"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.level)+' · '+x.total_marks+' marks · '+x.duration_minutes+' minutes · '+(qCounts[x.id]||0)+'/50 questions</p></div><span class="status">'+esc(x.status)+'</span></div><div class="action-row"><button class="secondary" onclick="addQuestion(\''+x.id+'\')">Add MCQ / Answer Key</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'published\')">Publish Paper</button><button class="secondary" onclick="setExamStatus(\''+x.id+'\',\'closed\')">Close Paper</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'xlsx\')">Export Results</button></div></article>').join('')||'<p class="muted">No papers created yet. Use the form above to create your first paper.</p>'}</section>
 <section class="data-card" id="admin-candidate-register"><div class="section-title"><h2>Registered candidates</h2><span class="portal-mark">${candidateRows?.length||0} SHOWN</span></div><div class="action-row"><button class="secondary" onclick="exportAccountIds('candidate')">Download Candidate Register</button></div>${candidateErr?'<p class="error">'+esc(candidateErr.message)+'</p>':(candidateRows||[]).length?'<div class="table-wrap"><table><thead><tr><th>Candidate ID</th><th>Name</th><th>Section</th><th>Level</th><th>Initial Password (BSG UID)</th></tr></thead><tbody>'+(candidateRows||[]).map(p=>'<tr><td><b>'+esc(p.candidate_id||'')+'</b></td><td>'+esc(p.full_name||'')+'</td><td>'+esc((p.section||'').toUpperCase())+'</td><td>'+esc(p.candidate_level||'')+'</td><td><b>'+esc(p.bsg_uid||'Not available')+'</b></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No candidate accounts registered yet.</p>'}</section>
 <section class="data-card"><div class="section-title"><h2>Examiner register</h2><span class="portal-mark">${examinerRows?.length||0} ACCOUNTS</span></div><div class="action-row"><button class="secondary" onclick="exportAccountIds('examiner')">Download Examiner Register</button></div>${listError?'<p class="error">'+esc(listError.message)+'</p>':(examinerRows||[]).length?'<div class="table-wrap"><table><thead><tr><th>Examiner ID</th><th>Section</th><th>Name</th><th>Email</th></tr></thead><tbody>'+(examinerRows||[]).map(p=>'<tr><td><b>'+esc(p.examiner_code||'')+'</b></td><td>'+esc((p.section||'').toUpperCase())+'</td><td>'+esc(p.full_name||'')+'</td><td>'+esc(p.email||'')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No examiners created yet.</p>'}</section>
 <section class="data-card" id="admin-account-register"><div class="section-title"><h2>All Created Login Accounts</h2><span class="portal-mark">\${(examinerRows||[]).length+(candidateRows||[]).length} ACCOUNTS</span></div><p class="muted tiny">Permanent account register from the database. Use this table to identify which login ID belongs to each person. Passwords are not stored or displayed here.</p><div class="table-wrap"><table><thead><tr><th>Role</th><th>Login ID</th><th>Name</th><th>Email</th><th>Section</th><th>Created</th></tr></thead><tbody>\${[...(examinerRows||[]).map(p=>({role:"Examiner",id:p.examiner_code,name:p.full_name,email:p.email,section:p.section,created:p.created_at})),...(candidateRows||[]).map(p=>({role:"Candidate",id:p.candidate_id,name:p.full_name,email:"",section:p.section,created:p.created_at}))].sort((a,b)=>new Date(b.created||0)-new Date(a.created||0)).map(p=>'<tr><td>'+p.role+'</td><td><b>'+esc(p.id||"—")+'</b></td><td>'+esc(p.name||"")+'</td><td>'+esc(p.email||"—")+'</td><td>'+esc((p.section||"").toUpperCase())+'</td><td>'+(p.created?new Date(p.created).toLocaleDateString():"—")+'</td></tr>').join("")||'<tr><td colspan="6">No accounts created yet.</td></tr>'}</tbody></table></div></section><section class="data-card" id="admin-results"><h2>Results & reporting</h2><p class="muted tiny">Download result sheets for examinations that have candidate submissions.</p>${(exams||[]).map(x=>'<div class="action-row"><b>'+esc(x.title)+'</b><button class="secondary" onclick="exportResults(\''+x.id+'\',\'xlsx\')">Excel</button><button class="secondary" onclick="exportResults(\''+x.id+'\',\'pdf\')">Print / PDF</button></div>').join('')||'<p class="muted">No examinations available.</p>'}</section>
 <div class="notice">Super Admin controls examiner accounts, question papers, answer keys, publication and results oversight. The existing Super Admin account and credentials are unchanged.</div>`;
 buildAdminWorkspace(root);
 const resultsSection=$("admin-results");
 if(resultsSection){
  const resultRows=resultsSection.querySelectorAll(".action-row");
  resultRows.forEach((row,index)=>{
   const exam=exams&&exams[index];if(!exam)return;
   const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="Publish Results";
   button.addEventListener("click",()=>publishResults(exam.id));
   row.insertBefore(button,row.children[1]||null);
  });
 }
 const examinerForm=$("examiner-create-form");if(examinerForm)examinerForm.addEventListener("submit",createUsers);
 const examForm=$("admin-exam-form");if(examForm)examForm.addEventListener("submit",createExam);
 const parseBtn=$("parse-import-btn");if(parseBtn)parseBtn.addEventListener("click",previewQuestionImport);
 const saveBtn=$("save-import-btn");if(saveBtn)saveBtn.addEventListener("click",saveQuestionImport);
 const pdfInput=$("import-paper-pdf");if(pdfInput)pdfInput.addEventListener("change",()=>{parsedQuestionImport=null;$("save-import-btn").disabled=true;$("import-status").textContent="Question-paper PDF selected. Choose Check & Preview to extract its text."});
 const answerPdfInput=$("import-answer-pdf");if(answerPdfInput)answerPdfInput.addEventListener("change",()=>{parsedQuestionImport=null;$("save-import-btn").disabled=true;$("import-status").textContent="Answer-key PDF selected. Choose Check & Preview to extract both files."});
}


let portalLanguage="en";
const portalLabels={overview:"अवलोकन",examiners:"परीक्षक प्रबंधन",candidates:"अभ्यर्थी पंजीकरण",papers:"प्रश्नपत्र कार्यक्षेत्र",schedule:"परीक्षा समय-सारणी",results:"परिणाम और रिपोर्ट",credentials:"आईडी और लॉगिन विवरण",monitoring:"दूरस्थ निगरानी",registration:"उम्मीदवार पंजीकरण",exams:"परीक्षा आवंटन",scripts:"जमा उत्तर पुस्तिकाएँ",myexams:"मेरी परीक्षाएँ",profile:"मेरी प्रोफ़ाइल",help:"निर्देश"};
function applyPortalLanguage(){
 const hi=portalLanguage==="hi";
 const en={overview:"Overview",examiners:"Examiner Management",candidates:"Candidate Register",papers:"Question Paper Studio",schedule:"Exam Scheduling",results:"Results & Reports",credentials:"ID & Credential Centre",monitoring:"Remote Monitoring",registration:"Candidate Registration",exams:"Examination Assignment",scripts:"Submitted Answer Sheets",myexams:"My Examinations",profile:"My Profile",help:"Instructions"};
 document.querySelectorAll(".samagam-nav button").forEach(b=>{const span=b.querySelector("span:nth-child(2)");if(span)span.textContent=hi?portalLabels[b.dataset.page]||span.textContent:en[b.dataset.page]||span.textContent;});
 document.querySelectorAll(".samagam-page").forEach(p=>{const h=p.querySelector(".samagam-page-heading h2");if(h)h.textContent=hi?portalLabels[p.dataset.page]||h.textContent:en[p.dataset.page]||h.textContent;});
}
const languageSelect=$("portal-language");
if(languageSelect)languageSelect.addEventListener("change",()=>{portalLanguage=languageSelect.value;applyPortalLanguage();toast(portalLanguage==="hi"?"पोर्टल मेनू हिन्दी में दिखाए जा रहे हैं। परीक्षा प्रश्न अंग्रेज़ी में रहेंगे।":"Portal menus are in English. Examination content remains in English.");});

function openAdminModule(id){
 document.querySelectorAll(".samagam-page").forEach(p=>p.classList.toggle("active",p.dataset.page===id));
 document.querySelectorAll(".samagam-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
 const selected=document.querySelector('.samagam-nav button[data-page="'+id+'"]');
 if(selected&&$("dash-title"))$("dash-title").textContent=selected.dataset.title||selected.textContent.trim();applyPortalLanguage();
}
function buildAdminWorkspace(root){
 const stats=root.querySelector(".stats"),quick=root.querySelector(".admin-module-grid");
 const examinerCreate=$("admin-examiner-create"),candidateRegister=$("admin-candidate-register");
 const paperCreate=$("admin-paper-create"),paperImport=$("admin-question-import");
 const paperList=$("admin-paper-list"),results=$("admin-results");
 const examinerRegister=[...root.querySelectorAll(".data-card")].find(x=>x.querySelector("h2")?.textContent.trim()==="Examiner register");
 const notice=[...root.querySelectorAll(".notice")].at(-1);
 const shell=document.createElement("div");shell.className="samagam-layout";
 const sidebar=document.createElement("aside");sidebar.className="samagam-sidebar";
 sidebar.innerHTML='<div class="samagam-side-brand"><span>⚜</span><div><b>BSG WORKSPACE</b><small>Examination Control</small></div></div><div class="samagam-nav-label">MAIN MENU</div>';
 const nav=document.createElement("nav");nav.className="samagam-nav";
 const items=[["overview","⌂","Overview"],["profile","♙","My Profile"],["examiners","♙","Examiner Management"],["candidates","▣","Candidate Register"],["papers","▤","Question Paper Studio"],["schedule","◷","Exam Scheduling"],["results","▥","Results & Reports"],["credentials","▧","ID & Credential Centre"],["monitoring","◉","Remote Monitoring"]];
 const pages=document.createElement("div");pages.className="samagam-pages";
 const addPage=(id,title,nodes=[])=>{const page=document.createElement("section");page.className="samagam-page";page.dataset.page=id;const h=document.createElement("div");h.className="samagam-page-heading";h.innerHTML='<span class="eyebrow">BSG EXAMINATION MANAGEMENT</span><h2>'+title+'</h2>';page.appendChild(h);nodes.filter(Boolean).forEach(n=>page.appendChild(n));pages.appendChild(page)};
 items.forEach(([id,icon,title])=>{const b=document.createElement("button");b.type="button";b.dataset.page=id;b.dataset.title=title;b.innerHTML='<span class="nav-icon">'+icon+'</span><span>'+title+'</span><span class="nav-chevron">›</span>';b.addEventListener("click",()=>openAdminModule(id));nav.appendChild(b)});
 sidebar.appendChild(nav);const sideFoot=document.createElement("div");sideFoot.className="samagam-side-foot";sideFoot.textContent="Independent BSG CBT Portal";sidebar.appendChild(sideFoot);
 const adminProfile=document.createElement("section");adminProfile.className="data-card";adminProfile.innerHTML='<h3>Super Admin Profile</h3><div class="credential-row"><span>Full Name</span><b>'+esc(currentProfile.full_name||"")+'</b></div><div class="credential-row"><span>Registered Email</span><b>'+esc(currentProfile.email||"")+'</b></div><div class="credential-row"><span>Role</span><b>SUPER ADMIN</b></div>';
 addPage("overview","Overview",[stats,quick,notice]);
 addPage("profile","My Profile",[adminProfile]);
 addPage("examiners","Examiner Management",[examinerCreate,examinerRegister]);
 addPage("candidates","Candidate Register",[candidateRegister]);
 addPage("papers","Question Paper Studio",[paperCreate,paperImport]);
 addPage("schedule","Examination Scheduling",[paperList]);
 addPage("results","Results & Reports",[results]);
 const credential=document.createElement("section");credential.className="data-card";credential.innerHTML='<h3>Credential registers</h3><p class="muted tiny">Download seven-digit candidate IDs and Examiner IDs. Passwords are excluded from general registers.</p><div class="action-row"><button class="secondary" type="button" id="export-examiner-ids">Export Examiner IDs (Excel)</button><button class="secondary" type="button" id="export-candidate-ids">Export Candidate IDs (Excel)</button></div>';
 const accountRegister=$("admin-account-register");
 addPage("credentials","ID & Credential Centre",[credential,accountRegister]);
 const monitor=document.createElement("section");monitor.className="data-card";monitor.innerHTML='<h3>Remote examination incident log</h3><p class="muted tiny">Alerts require examiner review. Browser events cannot prove cheating or detect use of a second device.</p><div id="admin-proctoring-content" class="muted">Loading monitoring events…</div>';
 addPage("monitoring","Remote Monitoring",[monitor]);
 shell.appendChild(sidebar);shell.appendChild(pages);root.replaceChildren(shell);
 const exportExaminerButton=$("export-examiner-ids"),exportCandidateButton=$("export-candidate-ids");
 if(exportExaminerButton)exportExaminerButton.addEventListener("click",()=>exportAccountIds("examiner"));
 if(exportCandidateButton)exportCandidateButton.addEventListener("click",()=>exportAccountIds("candidate"));
 openAdminModule("overview");applyPortalLanguage();loadAdminProctorEvents();
}
async function loadAdminProctorEvents(){
 const host=$("admin-proctoring-content");if(!host)return;
 const {data:events,error}=await db.from("proctoring_events").select("*").order("created_at",{ascending:false}).limit(150);
 if(error){host.textContent="Monitoring events are unavailable: "+error.message;return}
 const ids=[...new Set((events||[]).map(x=>x.student_id))];
 const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name,candidate_id,section").in("id",ids):{data:[]};
 const map=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
 host.innerHTML=(events||[]).length?'<div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Section</th><th>Incident</th><th>Time</th></tr></thead><tbody>'+(events||[]).map(ev=>{const p=map[ev.student_id]||{};return '<tr><td>'+esc(p.full_name||"Candidate")+'<small> '+esc(p.candidate_id||"")+'</small></td><td>'+esc((p.section||"").toUpperCase())+'</td><td>'+esc(ev.event_type.replaceAll("_"," "))+'</td><td>'+new Date(ev.created_at).toLocaleString()+'</td></tr>'}).join('')+'</tbody></table></div>':'<p class="muted">No remote monitoring alerts have been recorded.</p>';
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
 panel.innerHTML='<div class="created-head">✓ Examiner account created successfully</div><div class="credential-row"><span>Examiner ID</span><b>'+esc(result.examiner_id)+'</b><button type="button" class="secondary" onclick="navigator.clipboard.writeText(\''+esc(result.examiner_id)+'\').then(()=>toast(\'Examiner ID copied\'))">Copy ID</button></div><div class="credential-row"><span>Login email</span><b>'+esc(user.email)+'</b></div><div class="credential-row"><span>Temporary Password</span><b>'+esc(user.password)+'</b></div><p class="muted tiny">Save these credentials securely now. Supabase stores the password as a secure hash; it cannot be retrieved later.</p>';
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
  $("dash-content").innerHTML='<div class="cbt-head"><div><span class="eyebrow">EXAMINATION IN PROGRESS</span><h2>'+esc(activeExam.exam.title)+'</h2><p>'+esc(currentProfile.full_name)+' · '+esc(activeExam.exam.level)+'</p></div><div class="cbt-clock"><span>TIME LEFT</span><strong id="timer">--:--</strong></div></div><div class="notice proctor-notice" id="proctor-warning">Remote examination monitoring is active. Keep this examination page open; activity alerts may be reviewed by your examiner.</div><div class="cbt-layout"><section class="cbt-main"><div class="cbt-question-head"><b>Question '+(currentIndex+1)+' of '+questions.length+'</b><span>'+esc(q.marks)+' mark(s)</span></div><div class="cbt-question"><h3>'+esc(q.question_text)+'</h3><div id="cbt-answer-area">'+options+'</div></div><div class="cbt-controls"><button class="secondary" id="clear-answer" type="button">Clear Response</button><button class="secondary" id="mark-review" type="button">Mark for Review & Next</button><button class="primary" id="save-next" type="button">Save & Next</button></div><div class="cbt-bottom"><button class="secondary" id="previous-q" type="button" '+(currentIndex===0?'disabled':'')+'>Previous</button><button class="primary" id="submit-final" type="button">Submit Examination</button></div></section><aside class="cbt-side"><h3>Question Palette</h3><p class="muted tiny">Select a number to move to that question.</p><div class="palette">'+palette+'</div><div class="palette-legend"><span><i class="answered"></i> Answered</span><span><i class="not-answered"></i> Not answered</span><span><i class="review"></i> Marked for review</span><span><i class="answered-review"></i> Answered & review</span></div><div class="cbt-summary"><b>'+questions.filter(x=>String(responses[x.id]||"").trim()).length+'</b> answered · <b>'+questions.length-questions.filter(x=>String(responses[x.id]||"").trim()).length+'</b> remaining</div></aside></div>';
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
async function saveExamProgress(){
 if(!activeExam)return;
 const {error}=await db.rpc("save_exam_progress",{p_exam_id:activeExam.exam.id,p_answers:activeExam.responses});
 if(error&&activeExam)toast("Answer auto-save warning: "+error.message);
}
function captureAnswer(){
  if(!activeExam)return;
  const q=activeExam.questions[activeExam.currentIndex];
  const selected=document.querySelector('input[name="cbt-answer"]:checked');
  const typed=$("cbt-text-answer");
  if(selected)activeExam.responses[q.id]=selected.value;
  else if(typed)activeExam.responses[q.id]=typed.value;
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{saveTimer=null;saveExamProgress()},450);
}
function shuffledCopy(items){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
async function startExam(id){
  if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});
  const {data:exam,error:ee}=await db.from("exams").select("*").eq("id",id).single();
  if(ee||!exam)return toast(ee?.message||"Examination not found.");
  const instructions=exam.instructions||"Read every question carefully. Select one option for MCQs. You can move between questions using the palette. Save your responses before submitting. The server timer starts when you begin. No negative marking.";
  if(!confirm("EXAMINATION INSTRUCTIONS\n\n"+instructions+"\n\nDuration: "+exam.duration_minutes+" minutes\nMaximum marks: "+exam.total_marks+"\n\nPress OK only when you are ready to start."))return;
  const {data:started,error:se}=await db.rpc("start_exam",{p_exam_id:id});
  if(se)return toast(se.message);
  const {data:questions,error:qe}=await db.from("questions").select("*").eq("exam_id",id).order("position");
  if(qe||!questions?.length)return toast(qe?.message||"Questions are not available.");
  const {data:saved,error:progressError}=await db.rpc("get_exam_progress",{p_exam_id:id});
  if(progressError)return toast(progressError.message);
  const randomized=shuffledCopy(questions.map(q=>({...q,options:Array.isArray(q.options)?shuffledCopy(q.options):q.options})));
  activeExam={exam,questions:randomized,startedAt:new Date(started).getTime(),responses:saved||{},review:new Set(),currentIndex:0,incidentCount:0};
  bindRemoteExamMonitoring();
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
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}
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
