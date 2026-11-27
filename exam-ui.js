/* BSG CBT examination briefing and question UI. Loaded after app.js. */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .exam-brief{background:#fff;border:1px solid #dce5f0;border-radius:20px;padding:clamp(20px,4vw,34px);box-shadow:0 12px 34px #153b6810}
    .exam-brief h2{margin:8px 0 10px;font-size:clamp(24px,4vw,34px)}
    .exam-brief-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
    .exam-brief-stat{background:#f1f5fb;border:1px solid #e1e9f3;border-radius:13px;padding:14px}
    .exam-brief-stat b{display:block;font-size:24px;color:#123765}
    .exam-brief-stat span{font-size:12px;color:#66758a}
    .exam-brief-types{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
    .exam-brief-type{padding:10px 12px;border:1px solid #e2e9f2;border-radius:10px;font-size:13px}
    .exam-brief-type b{display:block;color:#123765}
    .exam-brief-instructions{background:#fff8e9;border:1px solid #f0dfb7;border-radius:12px;padding:15px;white-space:pre-line;line-height:1.6;font-size:13px}
    .exam-brief-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
    .cbt-question-type{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#66758a;font-weight:800;margin:0 0 8px}
    .cbt-question textarea{width:100%;min-height:135px;padding:13px;border:1px solid #cbd6e4;border-radius:10px;font:inherit;resize:vertical}
    @media(max-width:650px){.exam-brief-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.exam-brief-types{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
})();

function examTypeLabel(type) {
  return ({mcq:"Multiple Choice",short:"Written / Short Answer",long:"Written / Long Answer",drawing:"Drawing Task"})[type] || "Written Response";
}

async function startExam(id) {
  const { data: exam, error: examError } = await db.from("exams").select("*").eq("id", id).single();
  if (examError || !exam) return toast(examError?.message || "Examination not found.");
  const { data: questions, error: questionError } = await db.from("questions").select("*").eq("exam_id", id).order("position");
  if (questionError || !questions?.length) return toast(questionError?.message || "Question paper is not available.");

  const types = {};
  questions.forEach(q => {
    const key = q.question_type || "short";
    if (!types[key]) types[key] = { count: 0, marks: 0 };
    types[key].count += 1;
    types[key].marks += Number(q.marks) || 0;
  });
  const typeCards = Object.entries(types).map(([type, v]) =>
    '<div class="exam-brief-type"><b>' + esc(examTypeLabel(type)) + '</b>' +
    esc(v.count) + ' question(s) · ' + esc(v.marks) + ' marks</div>'
  ).join("");
  const root = $("dash-content");
  root.innerHTML =
    '<section class="exam-brief">' +
      '<span class="eyebrow">READ BEFORE YOU BEGIN</span>' +
      '<h2>' + esc(exam.title) + '</h2>' +
      '<p class="muted">' + esc(exam.level) + ' · PM SHRI Kendriya Vidyalaya Ordnance Factory Medak</p>' +
      '<div class="exam-brief-grid">' +
        '<div class="exam-brief-stat"><b>' + esc(exam.total_marks) + '</b><span>Maximum marks</span></div>' +
        '<div class="exam-brief-stat"><b>' + esc(exam.duration_minutes) + ' min</b><span>Time allowed</span></div>' +
        '<div class="exam-brief-stat"><b>' + questions.length + '</b><span>Total questions</span></div>' +
        '<div class="exam-brief-stat"><b>2 Parts</b><span>Pravesh + Pratham Sopan</span></div>' +
      '</div>' +
      '<h3>Question types and marks</h3><div class="exam-brief-types">' + typeCards + '</div>' +
      '<h3>Examination instructions</h3>' +
      '<div class="exam-brief-instructions">' + esc(exam.instructions || "Read every question carefully. Answer all questions. Submit before the timer expires.") + '</div>' +
      '<div class="notice"><b>Important:</b> The timer starts only after you press Start Examination. MCQs are automatically evaluated. Written, drawing and practical responses are reviewed by the examiner. Drawing tasks for this paper must be completed on paper and shown/submitted to the examiner.</div>' +
      '<div class="exam-brief-actions"><button class="primary" id="confirm-exam-start" type="button">Start Examination →</button><button class="secondary" id="cancel-exam-start" type="button">Go Back</button></div>' +
    '</section>';
  $("cancel-exam-start").addEventListener("click", () => studentDashboard(root));
  $("confirm-exam-start").addEventListener("click", async () => {
    const button = $("confirm-exam-start");
    button.disabled = true;
    button.textContent = "Starting securely…";
    const { data: started, error: startError } = await db.rpc("start_exam", { p_exam_id: id });
    if (startError) {
      button.disabled = false;
      button.textContent = "Start Examination →";
      return toast(startError.message);
    }
    const { data: saved, error: progressError } = await db.rpc("get_exam_progress", { p_exam_id: id });
    if (progressError) return toast(progressError.message);
    activeExam = {
      exam,
      questions,
      startedAt: new Date(started).getTime(),
      responses: saved || {},
      review: new Set(),
      currentIndex: 0,
      incidentCount: 0
    };
    if (typeof bindRemoteExamMonitoring === "function") bindRemoteExamMonitoring();
    paintQuestion();
    const tick = () => {
      if (!activeExam) return;
      const left = Math.max(0, Math.ceil((activeExam.startedAt + activeExam.exam.duration_minutes * 60000 - Date.now()) / 1000));
      const clock = $("timer");
      if (clock) clock.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      if (left <= 0) {
        clearInterval(examTimer);
        submitExam(true);
      }
    };
    tick();
    clearInterval(examTimer);
    examTimer = setInterval(tick, 1000);
  });
}

function paintQuestion() {
  if (!activeExam) return;
  const { questions, responses, review, currentIndex } = activeExam;
  const q = questions[currentIndex];
  const answer = responses[q.id] || "";
  const palette = questions.map((item, i) => {
    const answered = !!String(responses[item.id] || "").trim();
    const marked = review.has(item.id);
    const cls = marked ? (answered ? "answered-review" : "review") : answered ? "answered" : "not-answered";
    return '<button type="button" class="palette-item ' + cls + (i === currentIndex ? ' current' : '') +
      '" data-q-index="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + '</button>';
  }).join("");
  const answerControl = q.question_type === "mcq"
    ? (q.options || []).map((o, i) =>
        '<label class="cbt-option"><input type="radio" name="cbt-answer" value="' + esc(o) + '" ' +
        (answer === o ? "checked" : "") + '><span>' + esc(o) + '</span></label>'
      ).join("")
    : '<textarea id="cbt-text-answer" class="answer-input" rows="6" placeholder="' +
      (q.question_type === "drawing" ? "Write your submission note. Complete the drawing on paper for the examiner." : "Type your answer here…") +
      '">' + esc(answer) + '</textarea>';
  const answeredCount = questions.filter(item => String(responses[item.id] || "").trim()).length;
  $("dash-content").innerHTML =
    '<div class="cbt-head"><div><span class="eyebrow">EXAMINATION IN PROGRESS</span><h2>' + esc(activeExam.exam.title) +
    '</h2><p>' + esc(currentProfile.full_name) + ' · ' + esc(activeExam.exam.level) + '</p></div>' +
    '<div class="cbt-clock"><span>TIME LEFT</span><strong id="timer">--:--</strong></div></div>' +
    '<div class="notice proctor-notice" id="proctor-warning">Keep this examination page open. Activity alerts may be reviewed by your examiner.</div>' +
    '<div class="cbt-layout"><section class="cbt-main"><div class="cbt-question-head"><b>Question ' + (currentIndex + 1) +
    ' of ' + questions.length + '</b><span>' + esc(q.marks) + ' mark(s)</span></div>' +
    '<div class="cbt-question"><div class="cbt-question-type">' + esc(examTypeLabel(q.question_type)) +
    '</div><h3>' + esc(q.question_text) + '</h3><div id="cbt-answer-area">' + answerControl + '</div></div>' +
    '<div class="cbt-controls"><button class="secondary" id="clear-answer" type="button">Clear Response</button>' +
    '<button class="secondary" id="mark-review" type="button">Mark for Review & Next</button>' +
    '<button class="primary" id="save-next" type="button">Save & Next</button></div>' +
    '<div class="cbt-bottom"><button class="secondary" id="previous-q" type="button" ' + (currentIndex === 0 ? "disabled" : "") +
    '>Previous</button><button class="primary" id="submit-final" type="button">Submit Examination</button></div></section>' +
    '<aside class="cbt-side"><h3>Question Palette</h3><p class="muted tiny">Select a number to move to that question.</p>' +
    '<div class="palette">' + palette + '</div><div class="palette-legend"><span><i class="answered"></i> Answered</span>' +
    '<span><i class="not-answered"></i> Not answered</span><span><i class="review"></i> Marked for review</span>' +
    '<span><i class="answered-review"></i> Answered & review</span></div>' +
    '<div class="cbt-summary"><b>' + answeredCount + '</b> answered · <b>' + (questions.length - answeredCount) +
    '</b> remaining</div></aside></div>';

  document.querySelectorAll("[data-q-index]").forEach(el => el.addEventListener("click", () => {
    captureAnswer();
    activeExam.currentIndex = Number(el.dataset.qIndex);
    paintQuestion();
  }));
  $("clear-answer").addEventListener("click", () => {
    delete activeExam.responses[q.id];
    activeExam.review.delete(q.id);
    saveExamProgress();
    paintQuestion();
  });
  $("mark-review").addEventListener("click", () => {
    captureAnswer();
    activeExam.review.add(q.id);
    if (currentIndex < questions.length - 1) activeExam.currentIndex++;
    paintQuestion();
  });
  $("save-next").addEventListener("click", () => {
    captureAnswer();
    activeExam.review.delete(q.id);
    if (currentIndex < questions.length - 1) activeExam.currentIndex++;
    paintQuestion();
  });
  $("previous-q").addEventListener("click", () => {
    captureAnswer();
    activeExam.currentIndex = Math.max(0, currentIndex - 1);
    paintQuestion();
  });
  $("submit-final").addEventListener("click", () => submitExam(false));
  const area = $("cbt-answer-area");
  area.querySelectorAll('input[name="cbt-answer"]').forEach(el => el.addEventListener("change", captureAnswer));
  const textarea = $("cbt-text-answer");
  if (textarea) textarea.addEventListener("input", captureAnswer);
}

async function submitExam(auto) {
  if (!activeExam) return;
  captureAnswer();
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const questions = activeExam.questions;
  const examId = activeExam.exam.id;
  const answered = questions.filter(q => String(activeExam.responses[q.id] || "").trim()).length;
  if (!auto && !confirm("Submit this examination?\n\nAnswered: " + answered + "\nUnanswered: " +
    (questions.length - answered) + "\n\nYou cannot submit again after this.")) return;
  clearInterval(examTimer);
  const answers = questions.map(q => ({ question_id: q.id, answer_text: String(activeExam.responses[q.id] || "") }));
  const { error } = await db.rpc("submit_exam", { p_exam_id: examId, p_answers: answers });
  if (error) {
    toast(error.message);
    return;
  }
  activeExam = null;
  toast(auto ? "Time expired. Your answers were submitted." : "Examination submitted successfully.");
  await studentDashboard($("dash-content"));
}
