export const engagementTypes = [
  { value: "poll", label: "Live poll" },
  { value: "multipleChoice", label: "Multiple choice" },
  { value: "wordCloud", label: "Word cloud" },
  { value: "qna", label: "Q&A" },
  { value: "quiz", label: "Quiz" },
  { value: "reactions", label: "Emoji reactions" },
];

export const reactionLabels = {
  thumbsUp: "👍",
  heart: "❤️",
  clap: "👏",
  wow: "😮",
  fire: "🔥",
};

export function ensureEngagement(slide) {
  slide.engagement ||= {};
  slide.engagement.enabled ??= false;
  slide.engagement.type ||= "poll";
  slide.engagement.prompt ||= "What should we prioritize next?";
  slide.engagement.options ||= ["Option A", "Option B", "Option C"];
  slide.engagement.correctAnswers ||= [];
  slide.engagement.showCorrectAnswer ??= true;
  slide.engagement.correctAnswerRevealed ??= false;
  slide.engagement.results ||= {};
  slide.engagement.qna ||= [];
  slide.engagement.reactions ||= {
    thumbsUp: 0,
    heart: 0,
    clap: 0,
    wow: 0,
    fire: 0,
  };
  return slide.engagement;
}

export function getAnswerFeedback(slide, response) {
  const engagement = ensureEngagement(slide);
  if (!["multipleChoice", "quiz"].includes(engagement.type) || !response) {
    return null;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  return {
    correctAnswers,
    isCorrect: correctAnswers.includes(response),
    shouldReveal: engagement.showCorrectAnswer,
  };
}

export function recordAudienceResponse(slide, payload) {
  const engagement = ensureEngagement(slide);
  if (!engagement.enabled) {
    return;
  }

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    engagement.results[payload.value] = (engagement.results[payload.value] || 0) + 1;
  }

  if (engagement.type === "wordCloud") {
    for (const word of String(payload.value || "").split(/\s+/).filter(Boolean)) {
      const key = word.toLowerCase();
      engagement.results[key] = (engagement.results[key] || 0) + 1;
    }
  }

  if (engagement.type === "qna" && payload.value) {
    engagement.qna.push({
      id: crypto.randomUUID?.() || String(Date.now()),
      text: payload.value,
      upvotes: 0,
      answered: false,
    });
  }

  if (engagement.type === "reactions" && payload.value) {
    engagement.reactions[payload.value] = (engagement.reactions[payload.value] || 0) + 1;
  }
}

export function renderLiveControls(container, deck, slide, onChange) {
  const engagement = ensureEngagement(slide);
  container.innerHTML = "";

  const meta = document.createElement("div");
  meta.className = "result-row";
  meta.innerHTML = `
    <strong>${engagement.enabled ? labelForType(engagement.type) : "Presentation-only slide"}</strong>
    <span>Audience code ${escapeHtml(deck.settings.audienceCode)} · ${engagement.enabled ? "Live controls ready" : "No audience input"}</span>
  `;
  container.append(meta);

  if (!engagement.enabled) {
    return;
  }

  const prompt = document.createElement("div");
  prompt.className = "result-row";
  prompt.innerHTML = `<strong>${escapeHtml(engagement.prompt)}</strong>`;
  container.append(prompt);

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    renderCorrectAnswerControls(container, engagement, onChange);
    renderResults(container, engagement);
  } else if (engagement.type === "wordCloud") {
    renderWordCloud(container, engagement);
  } else if (engagement.type === "qna") {
    renderQna(container, engagement, onChange);
  } else if (engagement.type === "reactions") {
    renderReactions(container, engagement);
  }
}

export function renderAudienceContent(container, deck, slide, onSubmit, latestResponse = null) {
  const engagement = ensureEngagement(slide);
  container.innerHTML = "";
  const join = document.createElement("div");
  join.className = "result-row";
  join.innerHTML = `
    <span>Joined with code ${escapeHtml(deck.settings.audienceCode)}</span>
    <strong>${engagement.enabled ? escapeHtml(engagement.prompt) : "This slide is presentation-only."}</strong>
  `;
  container.append(join);

  if (!engagement.enabled) {
    return;
  }

  const feedback = getAnswerFeedback(slide, latestResponse);
  const canRevealAnswer = ["multipleChoice", "quiz"].includes(engagement.type);
  if (feedback?.shouldReveal || (canRevealAnswer && engagement.correctAnswerRevealed)) {
    renderAudienceFeedback(
      container,
      feedback || {
        correctAnswers: normalizedCorrectAnswers(engagement),
        isCorrect: false,
        shouldReveal: true,
        revealedByPresenter: true,
      },
      latestResponse
    );
  }

  if (["poll", "multipleChoice", "quiz"].includes(engagement.type)) {
    const options = document.createElement("div");
    options.className = "audience-options";
    for (const option of engagement.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      if (latestResponse === option) {
        button.setAttribute("aria-pressed", "true");
      }
      button.addEventListener("click", () => onSubmit({ value: option }));
      options.append(button);
    }
    container.append(options);
  }

  if (engagement.type === "wordCloud" || engagement.type === "qna") {
    const form = document.createElement("form");
    form.className = "audience-options";
    form.innerHTML = `
      <label for="audienceInput">${engagement.type === "qna" ? "Question" : "Word or phrase"}</label>
      <input id="audienceInput" type="text" required />
      <button type="submit">${engagement.type === "qna" ? "Send question" : "Send response"}</button>
    `;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("input");
      onSubmit({ value: input.value.trim() });
      input.value = "";
    });
    container.append(form);
  }

  if (engagement.type === "reactions") {
    const row = document.createElement("div");
    row.className = "reaction-row";
    for (const [key, label] of Object.entries(reactionLabels)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => onSubmit({ value: key }));
      row.append(button);
    }
    container.append(row);
  }
}

function renderResults(container, engagement) {
  const totals = Object.values(engagement.results).reduce((sum, value) => sum + value, 0) || 1;
  const correctAnswers = engagement.correctAnswerRevealed ? normalizedCorrectAnswers(engagement) : [];
  for (const option of engagement.options) {
    const count = engagement.results[option] || 0;
    const marker = correctAnswers.includes(option) ? " · Correct" : "";
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <span>${escapeHtml(option)} · ${count}${marker}</span>
      <div class="result-bar"><i style="width:${Math.round((count / totals) * 100)}%"></i></div>
    `;
    container.append(row);
  }
}

function renderCorrectAnswerControls(container, engagement, onChange) {
  if (!["multipleChoice", "quiz"].includes(engagement.type)) {
    return;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  const row = document.createElement("div");
  row.className = "result-row correct-answer-control";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = engagement.correctAnswerRevealed ? "Hide correct answers" : "Display correct answers";
  button.disabled = !correctAnswers.length && !engagement.correctAnswerRevealed;
  button.addEventListener("click", () => {
    engagement.correctAnswerRevealed = !engagement.correctAnswerRevealed;
    onChange();
  });

  const status = document.createElement("span");
  status.textContent = correctAnswers.length
    ? engagement.correctAnswerRevealed
      ? `Showing: ${correctAnswers.join(", ")}`
      : `${correctAnswers.length} answer${correctAnswers.length > 1 ? "s" : ""} ready to reveal`
    : "Mark one or more correct answers in the editor first";

  row.append(button, status);
  container.append(row);

  if (engagement.correctAnswerRevealed) {
    renderCorrectAnswerSummary(container, engagement);
  }
}

function renderCorrectAnswerSummary(container, engagement) {
  if (!["multipleChoice", "quiz"].includes(engagement.type)) {
    return;
  }

  const correctAnswers = normalizedCorrectAnswers(engagement);
  const row = document.createElement("div");
  row.className = "result-row correct-answer-summary";
  row.innerHTML = correctAnswers.length
    ? `<strong>Correct answer${correctAnswers.length > 1 ? "s" : ""}</strong><span>${correctAnswers.map(escapeHtml).join(", ")}</span>`
    : "<strong>Correct answers</strong><span>No correct answer marked yet</span>";
  container.append(row);
}

function renderAudienceFeedback(container, feedback, response) {
  const card = document.createElement("div");
  const tone = response ? (feedback.isCorrect ? "correct" : "incorrect") : "correct";
  card.className = `feedback-card ${tone}`;
  const answerText = feedback.correctAnswers.length
    ? feedback.correctAnswers.map(escapeHtml).join(", ")
    : "No correct answer has been marked yet.";
  card.innerHTML = `
    <strong>${response ? (feedback.isCorrect ? "Correct" : "Answer submitted") : "Correct answer"}</strong>
    <span>${response ? `You chose ${escapeHtml(response)}.` : ""}</span>
    <span>Correct answer${feedback.correctAnswers.length > 1 ? "s" : ""}: ${answerText}</span>
  `;
  container.append(card);
}

function renderWordCloud(container, engagement) {
  const words = Object.entries(engagement.results).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const row = document.createElement("div");
  row.className = "result-row";
  row.innerHTML = words.length
    ? words.map(([word, count]) => `<span style="font-size:${14 + count * 3}px">${escapeHtml(word)}</span>`).join(" ")
    : "<span>No words yet</span>";
  container.append(row);
}

function renderQna(container, engagement, onChange) {
  if (!engagement.qna.length) {
    const empty = document.createElement("span");
    empty.textContent = "No questions yet";
    container.append(empty);
    return;
  }
  for (const question of engagement.qna) {
    const row = document.createElement("div");
    row.className = "result-row";
    const buttonLabel = question.answered ? "Answered" : "Mark answered";
    row.innerHTML = `<strong>${escapeHtml(question.text)}</strong><button type="button">${buttonLabel}</button>`;
    row.querySelector("button").addEventListener("click", () => {
      question.answered = !question.answered;
      onChange();
    });
    container.append(row);
  }
}

function renderReactions(container, engagement) {
  const row = document.createElement("div");
  row.className = "reaction-row";
  for (const [key, label] of Object.entries(reactionLabels)) {
    const cell = document.createElement("div");
    cell.className = "result-row";
    cell.innerHTML = `<strong>${label}</strong><span>${engagement.reactions[key] || 0}</span>`;
    row.append(cell);
  }
  container.append(row);
}

function labelForType(type) {
  return engagementTypes.find((item) => item.value === type)?.label || type;
}

function normalizedCorrectAnswers(engagement) {
  const options = new Set(engagement.options || []);
  return (engagement.correctAnswers || []).filter((answer) => options.has(answer));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
