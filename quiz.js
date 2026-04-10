/**
 * quiz.js - Shared quiz engine for all module pages.
 *
 * Usage on any module page:
 *   1. Add <script src="quiz.js"></script> before </body>
 *   2. Add <link rel="stylesheet" href="quiz.css"> in <head>
 *   3. For each quizzable section, include:
 *
 *      <div class="quiz-trigger-row">
 *        <button class="btn-quiz" data-quiz="<id>">Quiz Me</button>
 *      </div>
 *
 *      <template id="quiz-data-<id>">
 *        <div data-type="mcq|truefalse|scenario"
 *             data-question="..."
 *             data-options='["A","B","C"]'   <!-- mcq/scenario only -->
 *             data-correct="1"               <!-- mcq/scenario: index; truefalse: "true"/"false" -->
 *             data-explanation="...">
 *        </div>
 *      </template>
 *
 *      <div class="quiz-panel" id="quiz-<id>" hidden></div>
 *
 * Supported question types:
 *   mcq        - multiple choice, data-options array, data-correct index
 *   truefalse  - True / False buttons, data-correct "true" or "false"
 *   scenario   - identical rendering to mcq, semantically different content
 */

(function () {
  'use strict';

  const initialized = new Set();

  // ------------------------------------------------------------------
  // Public entry: build the quiz card inside its panel (once per quiz)
  // ------------------------------------------------------------------
  function buildQuizCard(quizId) {
    const tmpl  = document.getElementById('quiz-data-' + quizId);
    const panel = document.getElementById('quiz-' + quizId);
    if (!tmpl || !panel) return;

    const dataEl = tmpl.content.cloneNode(true).querySelector('[data-type]');
    if (!dataEl) return;

    const { type, question, explanation } = dataEl.dataset;

    // Scaffold card HTML
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-header">
        <span class="quiz-label">Quick Check</span>
        <button class="quiz-close" aria-label="Close quiz">&times;</button>
      </div>
      <div class="quiz-body">
        <p class="quiz-question"></p>
      </div>
      <div class="quiz-feedback" hidden></div>
      <div class="quiz-actions">
        <button class="btn-submit-quiz" disabled>Check Answer</button>
      </div>
    `;

    card.querySelector('.quiz-question').textContent = question;
    panel.appendChild(card);

    const body      = card.querySelector('.quiz-body');
    const feedback  = card.querySelector('.quiz-feedback');
    const submitBtn = card.querySelector('.btn-submit-quiz');

    // Close button hides the panel
    card.querySelector('.quiz-close').addEventListener('click', () => {
      panel.hidden = true;
    });

    // Dispatch to the correct renderer
    if (type === 'mcq' || type === 'scenario') {
      renderMCQ(body, dataEl, submitBtn, feedback, explanation);
    } else if (type === 'truefalse') {
      renderTrueFalse(body, dataEl, submitBtn, feedback, explanation);
    }
  }

  // ------------------------------------------------------------------
  // Renderers
  // ------------------------------------------------------------------
  function renderMCQ(body, dataEl, submitBtn, feedback, explanation) {
    const options = JSON.parse(dataEl.dataset.options);
    const correct = parseInt(dataEl.dataset.correct, 10);
    let selected  = null;

    const wrap = document.createElement('div');
    wrap.className = 'quiz-options';

    options.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className   = 'quiz-option';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        if (submitBtn.dataset.done) return;
        wrap.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = i;
        submitBtn.disabled = false;
      });
      wrap.appendChild(btn);
    });

    body.appendChild(wrap);

    submitBtn.addEventListener('click', () => {
      if (selected === null || submitBtn.dataset.done) return;
      submitBtn.dataset.done = '1';
      submitBtn.disabled     = true;
      const ok = selected === correct;
      wrap.querySelectorAll('.quiz-option').forEach((btn, i) => {
        if (i === correct)              btn.classList.add('correct');
        else if (i === selected && !ok) btn.classList.add('incorrect');
      });
      lockOptions(wrap);
      showFeedback(feedback, ok, explanation);
    });
  }

  function renderTrueFalse(body, dataEl, submitBtn, feedback, explanation) {
    const correct = dataEl.dataset.correct === 'true';
    let selected  = null;

    const wrap = document.createElement('div');
    wrap.className = 'quiz-options tf-options';

    ['True', 'False'].forEach(label => {
      const val = (label === 'True');
      const btn = document.createElement('button');
      btn.className   = 'quiz-option';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (submitBtn.dataset.done) return;
        wrap.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = val;
        submitBtn.disabled = false;
      });
      wrap.appendChild(btn);
    });

    body.appendChild(wrap);

    submitBtn.addEventListener('click', () => {
      if (selected === null || submitBtn.dataset.done) return;
      submitBtn.dataset.done = '1';
      submitBtn.disabled     = true;
      const ok = (selected === correct);
      wrap.querySelectorAll('.quiz-option').forEach(btn => {
        const val = (btn.textContent === 'True');
        if (val === correct)              btn.classList.add('correct');
        else if (val === selected && !ok) btn.classList.add('incorrect');
      });
      lockOptions(wrap);
      showFeedback(feedback, ok, explanation);
    });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function showFeedback(feedback, isCorrect, explanation) {
    feedback.hidden   = false;
    feedback.className = 'quiz-feedback ' + (isCorrect ? 'correct-fb' : 'incorrect-fb');
    const label = isCorrect ? 'Correct!' : 'Not quite.';
    feedback.innerHTML = `<strong>${label}</strong> ${explanation}`;
  }

  function lockOptions(container) {
    container.querySelectorAll('.quiz-option').forEach(btn => { btn.disabled = true; });
  }

  // ------------------------------------------------------------------
  // Wire up every .btn-quiz on the page
  // ------------------------------------------------------------------
  document.querySelectorAll('.btn-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const id    = btn.dataset.quiz;
      const panel = document.getElementById('quiz-' + id);
      if (!panel) return;

      const opening = panel.hidden;
      panel.hidden  = !opening;

      if (opening) {
        if (!initialized.has(id)) {
          initialized.add(id);
          buildQuizCard(id);
        }
        requestAnimationFrame(() => {
          panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    });
  });

})();
